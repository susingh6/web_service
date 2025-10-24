import Redis from 'ioredis';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { shouldReceiveEvent, shouldReceiveCacheUpdate, WEBSOCKET_CONFIG, SocketData } from '../shared/websocket-config';
import { Worker } from 'worker_threads';
import { config } from './config';
import { Entity, Team } from '@shared/schema';
import { storage } from './storage';
import { DashboardMetrics, EntityChange, CachedData, calculateMetrics, ComplianceTrendData, ComplianceTrendPoint } from '@shared/cache-types';
import { resolveEntityIdentifier } from '@shared/entity-utils';

// Standardized event envelope for real-time updates with race condition protection
interface EntityChangeEvent {
  event: 'entity-updated';
  type: 'created' | 'updated' | 'deleted' | 'rollback';
  entityId: string;
  entityName: string;
  tenantName: string;    // required for filtering
  teamName: string;      // required for filtering
  originUserId?: string; // optional, for UI hints
  ts: number;           // timestamp for idempotency
  version: number;      // version number for ordering
  updatedAt: string;    // entity's updatedAt for race condition detection
  data?: any;           // optional entity data
}

// Team member change event for real-time updates
interface TeamMemberChangeEvent {
  event: 'team-members-updated';
  type: 'member-added' | 'member-removed';
  teamName: string;     // required for filtering
  tenantName: string;   // required for filtering
  memberId?: string;    // member being added/removed
  memberName?: string;  // display name
  originUserId?: string; // optional, for UI hints
  ts: number;           // timestamp for idempotency
  version: number;      // version number for ordering
  updatedAt: string;    // team's updatedAt for race condition detection
  data?: any;           // optional team data
}


// Cache keys
export const CACHE_KEYS = {
  ENTITIES: 'sla:entities',
  TEAMS: 'sla:teams',
  TENANTS: 'sla:tenants',
  METRICS: 'sla:metrics',
  LAST_30_DAY_METRICS: 'sla:last30DayMetrics',
  COMPLIANCE_TRENDS: 'sla:complianceTrends',
  // New compliance cache hydrated from FastAPI (6h TTL)
  ENTITIES_COMPLIANCE: 'sla:entitiescompliance',
  LAST_UPDATED: 'sla:lastUpdated',
  RECENT_CHANGES: 'sla:recentChanges',
  CACHE_LOCK: 'sla:cache_lock',
  REFRESH_CHANNEL: 'sla:refresh',
  CHANGES_CHANNEL: 'sla:changes',
  ALERTS: 'sla:alerts',
  ADMIN_MESSAGES: 'sla:adminMessages',
  TASKS: 'sla:tasks',
  PERMISSIONS: 'sla:permissions',
  ROLES: 'sla:roles',
  USERS: 'sla:users',
  ENTITY_INDEX: 'sla:entity_index',
  CONFLICT_INDEX_KEYS: 'sla:entity_conflicts_index:keys',
  CONFLICT_HASH: 'sla:entity_conflicts_index',
  ENTITIES_HASH: 'sla:entities_hash',
};

export class RedisCache {
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private readonly CACHE_DURATION_MS = config.cache.refreshIntervalHours * 60 * 60 * 1000;
  private readonly LOCK_TIMEOUT = 300000; // 5 minutes lock timeout
  private wss: WebSocketServer | null = null;
  private authenticatedSockets: Map<WebSocket, SocketData> = new Map();
  private pendingNotifications: Array<{event: string, data: any, timestamp: Date}> = [];
  private cacheWorker: Worker | null = null;
  private isInitialized = false;
  private fallbackData: CachedData | null = null;
  private useRedis = false;
  // Coalescing buffers for change events to avoid WS storms
  private changeCoalesceBuffers: Map<string, { count: number; lastEvent: EntityChangeEvent; timer: any }> = new Map();

  constructor() {
    this.initialize();
  }

  // ---------- Slim entity projection & recent changes helpers ----------
  private buildSlimCompositeKey(e: any): string {
    const tenantId = e.tenant_id ?? e.tenantId ?? 0;
    const teamId = e.team_id ?? e.teamId ?? 0;
    const type = e.entity_type ?? e.type ?? '';
    const name = e.entity_name ?? e.name ?? '';
    return `${tenantId}:${teamId}:${type}:${name}`;
  }

  private projectSlimEntity(e: any): any {
    const entityType = e.type || e.entity_type;
    const schedule = entityType === 'dag'
      ? (e.dag_schedule || e.entity_schedule || e.table_schedule || null)
      : (e.table_schedule || e.entity_schedule || e.dag_schedule || null);

    // Only include owner reference for non-owners
    const ownerRef = e.is_entity_owner === true
      ? null
      : (e.owner_entity_ref_name || {
          entity_owner_name: e.owner_entity_reference || null,
          entity_owner_tenant_id: e.owner_tenant_id || null,
          entity_owner_tenant_name: e.owner_tenant_name || e.tenant_name || null,
          entity_owner_team_id: e.owner_team_id || null,
          entity_owner_team_name: e.owner_team_name || null,
        });

    // Derive display-name and table/dag names
    let displayName: string | null = null;
    if (entityType === 'table') {
      const schema = e.schema_name || null;
      const table = e.table_name || e.entity_name || e.name || null;
      displayName = schema ? `${schema}.${table}` : (table || null);
    } else {
      displayName = e.entity_display_name || e.dag_name || e.name || null;
    }

    return {
      entity_type: entityType,
      tenant_id: e.tenant_id ?? e.tenantId ?? null,
      tenant_name: e.tenant_name,
      team_id: e.team_id ?? e.teamId,
      team_name: e.team_name,
      entity_name: e.entity_name || e.name,
      entity_display_name: displayName,
      entity_schedule: schedule,
      expected_runtime_minutes: e.expected_runtime_minutes ?? null,
      is_entity_owner: e.is_entity_owner === true,
      is_active: e.is_active !== false,
      owner_entity_ref_name: ownerRef,
      server_name: e.server_name ?? null,
      // Populate last_reported_at from source if provided; new creates/updates can set now()
      last_reported_at: e.last_reported_at || null,
    };
  }

  // Update a slim entity in-place by composite name (team_name + entity_type + entity_name)
  // Only updates fields that exist in the slim schema. Accepts optional schema_name/table_name
  // and will derive entity_display_name accordingly for tables.
  async updateSlimEntityByComposite(params: {
    tenantName?: string; // when provided, enforce tenant match to avoid cross-tenant collisions
    teamName: string;
    entityType: 'table' | 'dag';
    entityName: string;
    updates: Record<string, any>;
  }): Promise<any | null> {
    if (!this.useRedis || !this.redis) return null;
    // O(1) HASH-based lookup by names (case-insensitive)
    const stub = {
      tenant_name: params.tenantName,
      team_name: params.teamName,
      entity_type: params.entityType,
      entity_name: params.entityName,
    } as any;
    const field = this.buildEntitiesHashField(stub);
    const currentRaw = await (this.redis as any).hget(CACHE_KEYS.ENTITIES_HASH, field);
    if (!currentRaw) return null;
    const current = JSON.parse(currentRaw);
    const allowedKeys = new Set([
      'entity_schedule',
      'expected_runtime_minutes',
      'is_entity_owner',
      'is_active',
      'owner_entity_ref_name',
      'entity_display_name',
      'server_name',
    ]);

    const next = { ...current };

    // Map incoming schema_name/table_name into entity_display_name for tables
    if (params.entityType === 'table') {
      const schema = params.updates.schema_name ?? null;
      const table = params.updates.table_name ?? null;
      if (schema || table) {
        const effectiveTable = table || current.entity_name || current.name;
        next.entity_display_name = schema ? `${schema}.${effectiveTable}` : effectiveTable;
      }
    }
    // Map dag_name into entity_display_name for DAGs
    if (params.entityType === 'dag') {
      const dagName = params.updates.dag_name ?? null;
      if (typeof dagName === 'string' && dagName.trim() !== '') {
        next.entity_display_name = dagName.trim();
      }
    }

    // For non-owner updates with a valid owner_entity_reference, mirror owner display_name and runtime/schedule
    if (params.updates && params.updates.owner_entity_reference && next.is_entity_owner === false) {
      try {
        const matches = await this.findSlimEntitiesByNameCI(String(params.updates.owner_entity_reference), params.entityType);
        if (matches && matches.length > 0) {
          const m = matches[0] as any;
          if (m.entity_display_name) next.entity_display_name = m.entity_display_name;
          if (m.entity_schedule) (next as any).entity_schedule = m.entity_schedule;
          if (m.expected_runtime_minutes != null) (next as any).expected_runtime_minutes = m.expected_runtime_minutes;
        }
      } catch {}
    }

    // Apply allowed updates directly if present
    Object.keys(params.updates || {}).forEach(k => {
      if (allowedKeys.has(k)) {
        (next as any)[k] = params.updates[k];
      }
    });

    // Persist (hash-only)
    await (this.redis as any).hset(CACHE_KEYS.ENTITIES_HASH, field, JSON.stringify(next));
    // Apply TTL to the entire hash to match hydrate cadence (best-effort)
    try {
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      await (this.redis as any).expire(CACHE_KEYS.ENTITIES_HASH, expireTime);
    } catch {}

    // Keep entity_index in sync for owner entities
    if (next.is_entity_owner === true) {
      await this.updateEntityIndex(next);
      await this.updateConflictIndexForOwner(next);
    }

    // Track recent change
    await this.appendSlimRecentChange(next, 'updated');

    return next;
  }

  // Delete a slim entity by composite identifiers (tenantName optional for uniqueness)
  async deleteSlimEntityByComposite(params: {
    tenantName?: string;
    teamName: string;
    entityType: 'table' | 'dag';
    entityName: string;
  }): Promise<boolean> {
    if (!this.useRedis || !this.redis) return false;
    const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
    // O(1) hash-based remove
    const stubSlim = { tenant_name: params.tenantName, team_name: params.teamName, entity_type: params.entityType, entity_name: params.entityName } as any;
    const field = this.buildEntitiesHashField(stubSlim);
    const removedRaw = await (this.redis as any).hget(CACHE_KEYS.ENTITIES_HASH, field);
    if (!removedRaw) return false;
    const removed = JSON.parse(removedRaw);
    await (this.redis as any).hdel(CACHE_KEYS.ENTITIES_HASH, field);

    // If the removed entity was an owner, update conflict index accordingly
    try {
      if (removed && removed.is_entity_owner === true) {
        // Remove from fast lookup index for owners
        await this.removeFromEntityIndex(removed);
        await this.removeOwnerFromConflictIndex(removed);
      }
    } catch {}

    // Track recent change
    await this.appendSlimRecentChange(removed, 'deleted');
    return true;
  }

  private async upsertSlimEntity(slim: any): Promise<void> {
    if (!this.useRedis || !this.redis) return;
    try {
      // O(1) upsert into entities HASH
      const field = this.buildEntitiesHashField(slim);
      await (this.redis as any).hset(CACHE_KEYS.ENTITIES_HASH, field, JSON.stringify(slim));
      // Apply TTL to the entire hash to match hydrate cadence
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      await (this.redis as any).expire(CACHE_KEYS.ENTITIES_HASH, expireTime);
      // Maintain indexes for owners
      if (slim.is_entity_owner === true) {
        await this.updateEntityIndex(slim);
        await this.updateConflictIndexForOwner(slim);
      }
    } catch {}
  }

  private async removeSlimEntityByKey(slimKey: string): Promise<void> {
    if (!this.useRedis || !this.redis) return;
    const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
    const dataRaw = await this.redis.get(CACHE_KEYS.ENTITIES);
    const list: any[] = dataRaw ? JSON.parse(dataRaw) : [];
    const out = list.filter((x: any) => this.buildSlimCompositeKey(x) !== slimKey);
    await this.redis.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(out));
    // Best-effort: remove from index by reconstructing a stub slim from key
    try {
      const [tenantId, teamId, type, name] = slimKey.split(':');
      await this.removeFromEntityIndex({ tenant_id: Number(tenantId), team_id: Number(teamId), entity_type: type, entity_name: name });
    } catch {}
  }

  private async appendSlimRecentChange(slim: any, changeType: 'created' | 'updated' | 'deleted'): Promise<void> {
    if (!this.useRedis || !this.redis) return;
    const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
    const dataRaw = await this.redis.get(CACHE_KEYS.RECENT_CHANGES);
    let changes: any[] = dataRaw ? JSON.parse(dataRaw) : [];
    changes.unshift({ ...slim, change_type: changeType, timestamp: new Date(), last_reported_at: slim.last_reported_at || new Date().toISOString() });
    if (changes.length > 50) changes = changes.slice(0, 50);
    await this.redis.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(changes));
  }

  private normalizeRangeKey(input?: string): string {
    if (!input) return 'last_30_days';
    const k = String(input).toLowerCase();
    switch (k) {
      case 'today': return 'today';
      case 'yesterday': return 'yesterday';
      case 'last_7_days':
      case 'last7days': return 'last_7_days';
      case 'last_30_days':
      case 'last30days': return 'last_30_days';
      case 'this_month':
      case 'thismonth': return 'this_month';
      default: return 'last_30_days';
    }
  }

  // ---------- Fast lookup index for slim entities by (type:name) ----------
  private buildEntityIndexKey(entityType: string, entityName: string): string {
    // Store index in lowercase for case-insensitive lookup
    return `${String(entityType).toLowerCase()}:${String(entityName).toLowerCase()}`;
  }

  // ---------- Conflict index (per-entity SET of team names) ----------
  private normalizeKeyPart(v: any): string {
    const s = (v ?? '').toString().trim().toLowerCase();
    return s.length > 0 ? s : 'null';
  }

  private buildConflictField(tenantName: string, entityDisplayName: string, serverName?: string | null): string {
    const t = this.normalizeKeyPart(tenantName);
    const e = this.normalizeKeyPart(entityDisplayName);
    const s = this.normalizeKeyPart(serverName);
    return `${t}:${e}:${s}`;
  }

  // ---------- O(1) HASH for slim entities ----------
  private buildEntitiesHashField(slim: any): string {
    // Use names per request; normalize to lowercase to avoid casing duplication
    const t = this.normalizeKeyPart(slim.tenant_name);
    const team = this.normalizeKeyPart(slim.team_name);
    const type = this.normalizeKeyPart(slim.entity_type || slim.type);
    const name = this.normalizeKeyPart(slim.entity_name || slim.name);
    return `${t}:${team}:${type}:${name}`;
  }

  // Recompute current owners for a conflict key by scanning sla:entities_hash.
  // This ensures we don't remove a team from conflict owners if other owner entries remain.
  private async recomputeOwnersForConflictField(tenantName: string, entityDisplayName: string, serverName?: string | null): Promise<string[]> {
    if (!this.redis) return [];
    try {
      const t = this.normalizeKeyPart(tenantName);
      const e = this.normalizeKeyPart(entityDisplayName);
      const s = this.normalizeKeyPart(serverName);
      const rows: string[] = await (this.redis as any).hvals(CACHE_KEYS.ENTITIES_HASH);
      const owners: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        try {
          const item = JSON.parse(row);
          if (!item || item.is_entity_owner !== true) continue;
          const it = this.normalizeKeyPart(item.tenant_name);
          if (it !== t) continue;
          const ie = this.normalizeKeyPart(item.entity_display_name || item.entity_name);
          if (ie !== e) continue;
          const is = this.normalizeKeyPart(item.server_name ?? null);
          if (is !== s) continue;
          const team = (item.team_name || '').toString();
          const key = team.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            owners.push(team);
          }
        } catch {}
      }
      return owners;
    } catch {
      return [];
    }
  }

  private async upsertSlimIntoEntitiesHash(slim: any): Promise<void> {
    if (!this.redis) return;
    try {
      const field = this.buildEntitiesHashField(slim);
      await (this.redis as any).hset(CACHE_KEYS.ENTITIES_HASH, field, JSON.stringify(slim));
    } catch {}
  }

  private async removeSlimFromEntitiesHash(slim: any): Promise<void> {
    if (!this.redis) return;
    try {
      const field = this.buildEntitiesHashField(slim);
      await (this.redis as any).hdel(CACHE_KEYS.ENTITIES_HASH, field);
    } catch {}
  }

  private async updateConflictIndexForOwner(slim: any): Promise<void> {
    if (!this.redis) return;
    try {
      const field = this.buildConflictField(slim.tenant_name, (slim.entity_display_name || slim.entity_name), slim.server_name);
      const raw = await (this.redis as any).hget(CACHE_KEYS.CONFLICT_HASH, field);
      const owners: string[] = raw ? JSON.parse(raw) : [];
      const teamNameLower = (slim.team_name || '').toString().toLowerCase();
      const existingIdx = owners.findIndex(m => (m || '').toString().toLowerCase() === teamNameLower);
      if (existingIdx >= 0) owners[existingIdx] = slim.team_name; else owners.push(slim.team_name);
      await (this.redis as any).hset(CACHE_KEYS.CONFLICT_HASH, field, JSON.stringify(owners));
      await (this.redis as any).sadd(CACHE_KEYS.CONFLICT_INDEX_KEYS, field);
    } catch {}
  }

  private async removeOwnerFromConflictIndex(slim: any): Promise<void> {
    if (!this.redis) return;
    try {
      const display = (slim.entity_display_name || slim.entity_name);
      const field = this.buildConflictField(slim.tenant_name, display, slim.server_name);
      const owners = await this.recomputeOwnersForConflictField(slim.tenant_name, display, slim.server_name);
      // Persist recomputed owners; keep the registry key even if empty
      await (this.redis as any).hset(CACHE_KEYS.CONFLICT_HASH, field, JSON.stringify(owners));
      await (this.redis as any).sadd(CACHE_KEYS.CONFLICT_INDEX_KEYS, field);
    } catch {}
  }

  async checkOwnershipConflict(params: { tenant_name: string; team_name: string; entity_display_name: string; server_name?: string | null; }): Promise<{ allow: boolean; owners: string[] }>
  {
    if (!this.redis) return { allow: true, owners: [] };
    const field = this.buildConflictField(params.tenant_name, params.entity_display_name, params.server_name);
    const raw = await (this.redis as any).hget(CACHE_KEYS.CONFLICT_HASH, field);
    const owners: string[] = raw ? JSON.parse(raw) : [];
    if (!owners || owners.length === 0) return { allow: true, owners: [] };
    
    // Check if current team is already an owner (case-insensitive)
    const teamNameLower = params.team_name.toLowerCase();
    const isOwner = owners.some(owner => owner.toLowerCase() === teamNameLower);
    
    if (isOwner) return { allow: true, owners: [] };
    
    // Team is not an owner, but other teams are - conflict!
    return { allow: false, owners };
  }

  async appendConflictRecord(record: any): Promise<void> {
    if (!this.redis) return;
    try {
      const now = new Date();
      const owners: string[] = Array.isArray(record.owners) ? record.owners : [];
      const requestTeam = (record.team_name || record.teamName || '').toString();
      const conflictingTeams = [requestTeam, ...owners].filter(Boolean);
      // de-duplicate case-insensitively while preserving first-seen casing
      const dedupTeams = conflictingTeams.filter((t: string, idx: number, arr: string[]) =>
        arr.findIndex(x => (x || '').toLowerCase() === (t || '').toLowerCase()) === idx
      );

      const notificationId = record.notificationId || randomUUID();
      const conflictEntry = {
        id: Date.now(),
        notificationId,
        entityType: (record.entity_type || record.entityType || '').toString() || 'unknown',
        entityName: (record.entity_display_name || record.entityName || record.entity_name || '').toString() || 'Unknown',
        conflictingTeams: dedupTeams,
        conflictDetails: {
          existingOwner: owners.length > 0 ? owners.join(', ') : 'Unknown',
          requestedBy: (record.user_email || record.userEmail || null) as string | null,
          reason: (record.reason || 'Ownership conflict detected') as string,
          tenantName: (record.tenant_name || null) as string | null,
          serverName: (record.server_name ?? null) as string | null,
        },
        originalPayload: (record.originalPayload || record.payload || record.requestPayload || {}) as object,
        status: 'pending',
        createdAt: now.toISOString(),
      };

      await (this.redis as any).lpush('sla:conflicts', JSON.stringify(conflictEntry));
      await (this.redis as any).ltrim('sla:conflicts', 0, 999);
    } catch {}
  }

  // Read recent conflict records for admin panel
  async getConflicts(limit: number = 1000): Promise<any[]> {
    if (!this.redis) return [];
    try {
      const max = Math.max(1, Math.min(limit, 1000));
      const rows: string[] = await (this.redis as any).lrange('sla:conflicts', 0, max - 1);
      const parsed = rows.map((r: string) => {
        try {
          return JSON.parse(r);
        } catch {
          return { raw: r };
        }
      });
      return parsed;
    } catch {
      return [];
    }
  }

  // Fetch only the original payload for a conflict record
  async getConflictPayload(notificationId: string): Promise<any | null> {
    const items = await this.getConflicts(1000);
    const found = items.find((c: any) => c.notificationId === notificationId);
    return found ? (found.originalPayload ?? null) : null;
  }

  // Update the stored original payload for a conflict (admin edit-in-place)
  async updateConflictPayload(notificationId: string, patch: any): Promise<any | null> {
    if (!this.redis) return null;
    const rows: string[] = await (this.redis as any).lrange('sla:conflicts', 0, -1);
    for (let i = 0; i < rows.length; i++) {
      try {
        const parsed = JSON.parse(rows[i]);
        if (parsed && parsed.notificationId === notificationId) {
          const existingPayload = parsed.originalPayload || {};
          const updatedPayload = { ...existingPayload, ...(patch || {}) };
          const updated = { ...parsed, originalPayload: updatedPayload };
          await (this.redis as any).lset('sla:conflicts', i, JSON.stringify(updated));
          return updatedPayload;
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  // Replace a temporary notificationId with the official one from FastAPI
  async replaceConflictNotificationId(tempNotificationId: string, officialNotificationId: string): Promise<boolean> {
    if (!this.redis) return false;
    const rows: string[] = await (this.redis as any).lrange('sla:conflicts', 0, -1);
    for (let i = 0; i < rows.length; i++) {
      try {
        const parsed = JSON.parse(rows[i]);
        if (parsed && parsed.notificationId === tempNotificationId) {
          parsed.notificationId = officialNotificationId;
          await (this.redis as any).lset('sla:conflicts', i, JSON.stringify(parsed));
          return true;
        }
      } catch {
        // continue
      }
    }
    return false;
  }

  // Get a single conflict record by notificationId (with index for updates)
  async getConflictById(notificationId: string): Promise<{ index: number; record: any } | null> {
    if (!this.redis) return null;
    const rows: string[] = await (this.redis as any).lrange('sla:conflicts', 0, -1);
    for (let i = 0; i < rows.length; i++) {
      try {
        const parsed = JSON.parse(rows[i]);
        if (parsed && parsed.notificationId === notificationId) {
          return { index: i, record: parsed };
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  // Patch fields on a conflict record (e.g., status, resolution)
  async patchConflict(notificationId: string, patch: any): Promise<boolean> {
    if (!this.redis) return false;
    const found = await this.getConflictById(notificationId);
    if (!found) return false;
    const next = { ...found.record, ...(patch || {}) };
    await (this.redis as any).lset('sla:conflicts', found.index, JSON.stringify(next));
    return true;
  }

  private async updateEntityIndex(slim: any): Promise<void> {
    if (!this.useRedis || !this.redis) return;
    try {
      // Guard: index only entity owners
      if (slim.is_entity_owner !== true) return;
      const type = (slim.entity_type || slim.type || '').toString();
      const name = (slim.entity_name || slim.name || '').toString();
      if (!type || !name) return;
      const indexKey = this.buildEntityIndexKey(type, name);
      const raw = await this.redis.hget(CACHE_KEYS.ENTITY_INDEX, indexKey);
      const arr: any[] = raw ? JSON.parse(raw) : [];
      const composite = this.buildSlimCompositeKey(slim);
      const idx = arr.findIndex((x: any) => this.buildSlimCompositeKey(x) === composite);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...slim };
      else arr.push(slim);
      await this.redis.hset(CACHE_KEYS.ENTITY_INDEX, indexKey, JSON.stringify(arr));
    } catch {}
  }

  private async removeFromEntityIndex(slim: any): Promise<void> {
    if (!this.useRedis || !this.redis) return;
    try {
      const type = (slim.entity_type || slim.type || '').toString();
      const name = (slim.entity_name || slim.name || '').toString();
      if (!type || !name) return;
      const indexKey = this.buildEntityIndexKey(type, name);
      const raw = await this.redis.hget(CACHE_KEYS.ENTITY_INDEX, indexKey);
      if (!raw) return;
      const arr: any[] = JSON.parse(raw);
      const composite = this.buildSlimCompositeKey(slim);
      const filtered = arr.filter((x: any) => this.buildSlimCompositeKey(x) !== composite);
      if (filtered.length === 0) {
        await this.redis.hdel(CACHE_KEYS.ENTITY_INDEX, indexKey);
      } else {
        await this.redis.hset(CACHE_KEYS.ENTITY_INDEX, indexKey, JSON.stringify(filtered));
      }
    } catch {}
  }

  // Public lookup: find slim entities by type+name using index, fall back to scan
  async findSlimEntitiesByNameAndType(entityName: string, entityType: 'table' | 'dag'): Promise<any[]> {
    if (!this.useRedis || !this.redis) return [];
    try {
      const indexKey = this.buildEntityIndexKey(entityType, entityName);
      const raw = await this.redis.hget(CACHE_KEYS.ENTITY_INDEX, indexKey);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    // Fallback scan of ENTITIES list
    try {
      const listRaw = await this.redis.get(CACHE_KEYS.ENTITIES);
      const list: any[] = listRaw ? JSON.parse(listRaw) : [];
      const lowerRef = String(entityName).toLowerCase();
      return list.filter((x: any) => (x.entity_type || x.type) === entityType && String(x.entity_name || x.name).toLowerCase() === lowerRef);
    } catch {
      return [];
    }
  }

  // Strict case-insensitive finder by entity_name + entity_type only (no tenant/team scoping)
  async findSlimEntitiesByNameCI(entityName: string, entityType: 'table' | 'dag'): Promise<any[]> {
    return this.findSlimEntitiesByNameAndType(entityName, entityType);
  }

  // Public: search owner entities by type from the index, optional substring query, limited results
  async searchOwnerEntitiesByType(entityType: 'table' | 'dag', query?: string, limit: number = 50): Promise<string[]> {
    if (!this.useRedis || !this.redis) return [];
    try {
      const keys: string[] = await (this.redis as any).hkeys(CACHE_KEYS.ENTITY_INDEX);
      const prefix = `${String(entityType).toLowerCase()}:`;
      const q = query ? String(query).toLowerCase() : undefined;
      const out: string[] = [];
      for (const k of keys) {
        if (!k.startsWith(prefix)) continue;
        const name = k.slice(prefix.length);
        if (q && !name.includes(q)) continue;
        out.push(name);
        if (out.length >= limit) break;
      }
      return out.sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  private mapStatusFromCompliance(last_sla_status?: string | null): string {
    const s = (last_sla_status || '').toLowerCase();
    if (s === 'passed' || s === 'pass') return 'Passed';
    if (s === 'failed' || s === 'fail') return 'Failed';
    if (s === 'pending' || s === 'unknown') return 'Unknown';
    return 'Unknown';
  }

  async getSlimEntities(): Promise<any[]> {
    if (!this.useRedis || !this.redis) {
      const env = process.env.NODE_ENV || 'development';
      if (env !== 'development') return [];
      // Dev-only fallback: project from in-memory entities
      const list = this.fallbackData ? this.fallbackData.entities : await storage.getEntities();
      return list.map(e => this.projectSlimEntity(e));
    }
    try {
      const values: string[] = await (this.redis as any).hvals(CACHE_KEYS.ENTITIES_HASH);
      if (!values || values.length === 0) return [];
      return values.map(v => {
        try { return JSON.parse(v); } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  // Entities compliance cache read helper
  async getEntitiesCompliance(): Promise<any[]> {
    // In-memory mode (dev-only): synthesize minimal compliance rows from fallbackData metrics/trends
    if (!this.useRedis || !this.redis) {
      const env = process.env.NODE_ENV || 'development';
      if (env !== 'development') return [];
      // Use storage to generate compliance mock for dev parity
      const generated = await storage.getMockEntitiesCompliance?.();
      return Array.isArray(generated) ? generated : [];
    }

    // Redis mode: read from Redis cache
    try {
      const raw = await this.redis.get(CACHE_KEYS.ENTITIES_COMPLIANCE);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // Enrich slim entities with compliance (status/currentSla/lastRefreshed), used by /api/entities
  async getEntitiesForApi(params: { tenantName?: string; teamId?: number; type?: 'table' | 'dag'; dateFilter?: string }): Promise<any[]> {
    const { tenantName, teamId, type, dateFilter } = params || {} as any;
    const rangeKey = this.normalizeRangeKey(dateFilter);
    const [entities, compliance] = await Promise.all([
      this.getSlimEntities(),
      this.getEntitiesCompliance().catch(() => []),
    ]);

    // Build a lookup for compliance rows by composite key + range
    const compMap = new Map<string, any>();
    for (const c of (compliance as any[])) {
      if (!c || c.range_key !== rangeKey) continue;
      if (c.entity_type !== 'table' && c.entity_type !== 'dag') continue; // only leaf-level for entity rows
      const key = `${c.tenant_id}:${c.team_id}:${c.entity_type}:${c.entity_name || ''}`;
      compMap.set(key, c);
    }

    let out = (entities as any[]).map((e: any) => {
      const key = this.buildSlimCompositeKey(e);
      const comp = compMap.get(key);
      return {
        // keep slim fields for API consumers
        ...e,
        // add compatibility aliases expected by UI
        type: e.entity_type,
        teamId: e.team_id,
        name: e.entity_name,
        // Map display_name for table case to UI table_name field
        table_name: e.entity_type === 'table' ? (e.entity_display_name || e.entity_name) : undefined,
        // Map display_name for dag case to UI dag_name field
        dag_name: e.entity_type === 'dag' ? (e.entity_display_name || e.entity_name) : undefined,
        // Ensure schedule fields are available for UI (entity_schedule OR fallback to dag/table_schedule)
        dag_schedule: e.entity_type === 'dag' ? (e.entity_schedule || e.dag_schedule) : undefined,
        table_schedule: e.entity_type === 'table' ? (e.entity_schedule || e.table_schedule) : undefined,
        // enrich from compliance
        status: this.mapStatusFromCompliance(comp?.last_sla_status),
        currentSla: typeof comp?.last_sla_compliance_pct === 'number' ? comp.last_sla_compliance_pct : null,
        // When FastAPI compliance is unavailable, don't fabricate a shared timestamp.
        // Leave null so UI shows '—' and avoids copying the same time to all entities.
        // Prefer compliance last_reported_at; fallback to slim.last_reported_at so UI always has a timestamp
        lastRefreshed: comp?.last_reported_at
          ? new Date(comp.last_reported_at)
          : (e.last_reported_at ? new Date(e.last_reported_at) : null),
      };
    });

    // Filters identical to existing route logic
    if (typeof teamId === 'number' && !Number.isNaN(teamId)) {
      out = out.filter((e: any) => (e.team_id ?? e.teamId) === teamId);
    }
    if (tenantName) {
      out = out.filter((e: any) => e.tenant_name === tenantName);
    }
    if (type) {
      out = out.filter((e: any) => e.entity_type === type || e.type === type);
    }
    return out;
  }
  // Use centralized event filtering logic
  private shouldReceiveEvent(event: string, componentType: string): boolean {
    return shouldReceiveEvent(event, componentType);
  }

  private setupEventHandlers(): void {
    if (!this.redis || !this.subscriber) return;
    this.redis.on('connect', () => {
      // Redis main client connected
    });

    this.redis.on('error', (err) => {
      console.error('Redis main client error:', err);
    });

    this.subscriber.on('connect', () => {
      // Redis subscriber connected
      this.setupSubscriptions();
    });

    this.subscriber.on('error', (err) => {
      console.error('Redis subscriber error:', err);
    });
  }

  private setupSubscriptions(): void {
    if (!this.subscriber) return;
    // Subscribe to cache refresh notifications
    this.subscriber.subscribe(CACHE_KEYS.REFRESH_CHANNEL);
    this.subscriber.subscribe(CACHE_KEYS.CHANGES_CHANNEL);
    this.subscriber.subscribe(CACHE_KEYS.ADMIN_MESSAGES);

    this.subscriber.on('message', (channel, message) => {
      if (channel === CACHE_KEYS.REFRESH_CHANNEL) {
        // Cache refresh notification received - broadcast as general cache update
        this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.GENERAL, JSON.parse(message));
      } else if (channel === CACHE_KEYS.CHANGES_CHANNEL) {
        // Entity change notification received - filtered broadcast
        const changeEvent: EntityChangeEvent = JSON.parse(message);
        this.enqueueCoalescedBroadcast(changeEvent);
      } else if (channel === CACHE_KEYS.ADMIN_MESSAGES) {
        // Admin message notification received - broadcast to all authenticated clients
        const adminMessageEvent = JSON.parse(message);
        this.broadcastAdminMessageToClients(adminMessageEvent);
      }
    });
  }

  // Compute coalescing key per tenant/team/type bucket
  private getCoalesceKey(e: EntityChangeEvent): string {
    return `${e.tenantName || 'unknown'}::${e.teamName || 'unknown'}::${e.type || 'updated'}`;
  }

  // Buffer change events briefly and broadcast once per bucket
  private enqueueCoalescedBroadcast(e: EntityChangeEvent): void {
    const key = this.getCoalesceKey(e);
    const existing = this.changeCoalesceBuffers.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastEvent = e;
      // timer already scheduled
      return;
    }
    const timer = setTimeout(() => {
      const entry = this.changeCoalesceBuffers.get(key);
      if (!entry) return;
      // Broadcast a single event using the last event payload to preserve shape
      this.broadcastToClients('entity-updated', entry.lastEvent);
      this.changeCoalesceBuffers.delete(key);
    }, 250);
    this.changeCoalesceBuffers.set(key, { count: 1, lastEvent: e, timer });
  }

  private async initialize(): Promise<void> {
    try {
      await this.tryRedisConnection();
    } catch (error: any) {
      console.warn('Redis connection failed, falling back to in-memory cache:', error.message);
      this.initializeFallback();
    }
  }

  private async tryRedisConnection(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      // Test Redis connection with timeout
      this.redis = new Redis(redisUrl);

      this.subscriber = new Redis(redisUrl);

      this.setupEventHandlers();
      
      // Test the connection (ioredis auto-connects, no need for explicit connect())
      // Ping test to verify connection
      await this.redis.ping();
      
      // Redis connection successful
      this.useRedis = true;
      
      // Check if cache exists, if not initialize it
      const cacheExists = await this.redis.exists(CACHE_KEYS.ENTITIES);
      
      if (!cacheExists) {
        // Redis cache not found, initializing
        await this.refreshCacheWithWorker();
      } else {
        // Redis cache found, validating
        await this.validateCache();
      }

      this.startAutoRefresh();
      this.isInitialized = true;
      // Redis cache system initialized successfully
      
    } catch (error: any) {
      // Clean up failed connections
      if (this.redis) {
        this.redis.disconnect();
        this.redis = null;
      }
      if (this.subscriber) {
        this.subscriber.disconnect();
        this.subscriber = null;
      }
      throw error;
    }
  }

  private async initializeFallback(): Promise<void> {
    // Initializing fallback in-memory cache
    this.useRedis = false;
    
    // Initialize fallback data directly
    await this.refreshFallbackData();
    
    this.isInitialized = true;
    // Fallback cache system initialized successfully
  }

  // Wait for cache initialization to complete (for endpoints to prevent race conditions)
  public async waitForInitialization(timeoutMs: number = 30000): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    const startTime = Date.now();
    while (!this.isInitialized) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Cache initialization timeout');
      }
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async refreshFallbackData(): Promise<void> {
    try {
      // Reuse the cache refresh data logic
      this.fallbackData = await this.getCacheRefreshData();
      
      // Fallback cache refreshed successfully
    } catch (error) {
      console.error('Failed to refresh fallback data:', error);
      throw error;
    }
  }

  private calculateMetrics(entities: Entity[], tables: Entity[], dags: Entity[]): DashboardMetrics {
    return calculateMetrics(entities, tables, dags);
  }

  // Generate compliance trend data for a tenant with realistic fluctuations
  private generateComplianceTrendForRange(entities: Entity[], tables: Entity[], dags: Entity[], days: number): ComplianceTrendData {
    const trendData: ComplianceTrendPoint[] = [];
    const now = new Date();
    
    // For new tenants with no entities, return all zeros
    if (entities.length === 0) {
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        trendData.push({
          date: date.toISOString().split('T')[0],
          dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
          overall: 0,
          tables: 0,
          dags: 0
        });
      }
      return { trend: trendData, lastUpdated: new Date() };
    }
    
    // Calculate base compliance rates from actual entities
    const baseTablesCompliance = tables.length > 0 
      ? (tables.filter(t => t.status === 'Passed').length / tables.length) * 100
      : 0;
    
    const baseDAGsCompliance = dags.length > 0
      ? (dags.filter(d => d.status === 'Passed').length / dags.length) * 100
      : 0;
    
    const baseOverallCompliance = entities.length > 0
      ? (entities.filter(e => e.status === 'Passed').length / entities.length) * 100
      : 0;
    
    // Generate realistic fluctuating data for the specified range
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Add realistic fluctuations with some trends
      const dayVariation = Math.sin(i * 0.1) * 3; // Cyclical variation
      const randomNoise = (Math.random() - 0.5) * 4; // Random noise ±2%
      const trendImpact = (days - 1 - i) * 0.1; // Slight improvement trend over time
      
      // Apply variations to each metric
      const tablesCompliance = Math.max(0, Math.min(100, 
        baseTablesCompliance + dayVariation + randomNoise + trendImpact * 0.5
      ));
      
      const dagsCompliance = Math.max(0, Math.min(100, 
        baseDAGsCompliance + dayVariation * 0.8 + randomNoise * 1.2 + trendImpact * 0.3
      ));
      
      const overallCompliance = Math.max(0, Math.min(100, 
        baseOverallCompliance + dayVariation * 0.9 + randomNoise + trendImpact * 0.4
      ));
      
      trendData.push({
        date: date.toISOString().split('T')[0],
        dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
        overall: parseFloat(overallCompliance.toFixed(1)),
        tables: parseFloat(tablesCompliance.toFixed(1)),
        dags: parseFloat(dagsCompliance.toFixed(1))
      });
    }
    
    return {
      trend: trendData,
      lastUpdated: new Date()
    };
  }

  // Legacy method for backward compatibility
  private generateComplianceTrend(entities: Entity[], tables: Entity[], dags: Entity[]): ComplianceTrendData {
    return this.generateComplianceTrendForRange(entities, tables, dags, 30);
  }

  private async validateCache(): Promise<void> {
    try {
      const lastUpdated = this.redis ? await this.redis.get(CACHE_KEYS.LAST_UPDATED) : null;
      if (!lastUpdated) {
        // Cache validation failed: no last updated timestamp
        await this.refreshCacheWithWorker();
        return;
      }

      const lastUpdateTime = new Date(lastUpdated);
      const now = new Date();
      const timeDiff = now.getTime() - lastUpdateTime.getTime();

      if (timeDiff > this.CACHE_DURATION_MS) {
        // Cache validation failed: cache is stale
        await this.refreshCacheWithWorker();
      } else {
        // Cache validation passed: cache is fresh
      }
    } catch (error: any) {
      console.error('Cache validation error:', error);
      await this.refreshCacheWithWorker();
    }
  }

  private startAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval as any);
    }

    this.refreshInterval = setInterval(async () => {
      // Auto-refresh triggered
      await this.refreshCacheWithWorker();
    }, this.CACHE_DURATION_MS);

    // Auto-refresh scheduled
  }

  setupWebSocket(wss: WebSocketServer, authenticatedSockets?: Map<WebSocket, SocketData>): void {
    this.wss = wss;
    this.authenticatedSockets = authenticatedSockets || new Map();
    // WebSocket server attached to Redis cache with authenticated socket tracking
  }

  // Force notification - stores data for next client connection if no clients currently connected
  forceNotifyClients(event: string, data: any) {
    if (!this.wss || this.wss.clients.size === 0) {
      // Store notification for next client that connects
      if (!this.pendingNotifications) {
        this.pendingNotifications = [];
      }
      this.pendingNotifications.push({ event, data, timestamp: new Date() });
      
      // Keep only last 10 notifications
      if (this.pendingNotifications.length > 10) {
        this.pendingNotifications.shift();
      }
      
      return;
    }

    this.broadcastToClients(event, data);
  }

  // Enhanced broadcast with echo-to-origin, versioning, and backpressure safety
  private broadcastToClients(event: string, data: EntityChangeEvent | TeamMemberChangeEvent): void {
    if (!this.wss) return;

    // Add monotonic version for event ordering
    const enhancedData = {
      ...data,
      version: data.version || Date.now(),
      serverTimestamp: new Date().toISOString()
    };

    const message = JSON.stringify({ event, data: enhancedData, timestamp: new Date().toISOString() });
    const subscriptionKey = `${data.tenantName}:${data.teamName}`;
    
    // First, send immediate echo to originator for instant feedback
    if (data.originUserId) {
      this.echoToOriginWithBackpressure(event, enhancedData, data.originUserId);
    }
    
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        const socketData = this.authenticatedSockets.get(client);
        
        // In development mode, apply smart filtering based on component type
        if (isDevelopment) {
          // Skip originator since they already got the echo
          if (!data.originUserId || !socketData || socketData.userId !== data.originUserId) {
            // Smart filtering: use centralized event filtering configuration
            const componentType = socketData?.componentType;
            if (componentType && this.shouldReceiveEvent(event, componentType)) {
              this.sendWithBackpressureProtection(client, message, `${event}:${subscriptionKey}`);
            } else if (!componentType) {
              // Fallback for clients without componentType (backwards compatibility)
              this.sendWithBackpressureProtection(client, message, `${event}:${subscriptionKey}`);
            }
          }
        }
        // Production mode: send to authenticated clients who are subscribed to this tenant:team
        else if (socketData && 
            socketData.subscriptions.has(subscriptionKey) &&
            socketData.userId !== data.originUserId
        ) {
          this.sendWithBackpressureProtection(client, message, `${event}:${subscriptionKey}`);
        }
      }
    });
  }

  // Enhanced echo with backpressure protection
  private echoToOriginWithBackpressure(event: string, data: any, originUserId: string): void {
    if (!this.wss) return;

    const echoMessage = JSON.stringify({ 
      event: 'echo-to-origin', 
      originalEvent: event,
      data,
      timestamp: new Date().toISOString(),
      isEcho: true
    });
    
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        const socketData = this.authenticatedSockets.get(client);
        
        // Send only to the originator with backpressure protection
        if (socketData && socketData.userId === originUserId) {
          this.sendWithBackpressureProtection(client, echoMessage, `echo:${event}`);
        }
      }
    });
  }

  // Backpressure-safe send with event coalescing
  private sendWithBackpressureProtection(client: any, message: string, eventKey: string): void {
    const MAX_BUFFER_SIZE = 64 * 1024; // 64KB threshold
    const MAX_QUEUE_SIZE = 100;
    
    // Check if the client's send buffer is too full
    if ((client as any).bufferedAmount > MAX_BUFFER_SIZE) {
      // Initialize per-client event queue if not exists
      if (!(client as any)._eventQueue) {
        (client as any)._eventQueue = new Map<string, string>();
      }
      
      const eventQueue = (client as any)._eventQueue as Map<string, string>;
      
      // Coalesce events by key (keep only latest for each event type)
      eventQueue.set(eventKey, message);
      
      // Limit queue size to prevent memory leaks
      if (eventQueue.size > MAX_QUEUE_SIZE) {
        // Remove oldest entries
        const entries = Array.from(eventQueue.entries()) as Array<[string, string]>;
        entries.slice(0, eventQueue.size - MAX_QUEUE_SIZE).forEach(([key]) => {
          eventQueue.delete(key);
        });
      }
      
      console.warn(`Backpressure detected for client, queued event: ${eventKey}`);
      
      // Try to flush queue when buffer clears
      this.scheduleQueueFlush(client);
      return;
    }
    
    try {
      client.send(message);
      
      // If send succeeded and we have a queue, try to flush it
      if ((client as any)._eventQueue?.size > 0) {
        this.flushEventQueue(client);
      }
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
    }
  }

  // Schedule queue flush when buffer clears
  private scheduleQueueFlush(client: any): void {
    if ((client as any)._flushScheduled) return;
    
    (client as any)._flushScheduled = true;
    
    // Use setImmediate for next tick scheduling to avoid blocking
    setImmediate(() => {
      (client as any)._flushScheduled = false;
      this.flushEventQueue(client);
    });
  }

  // Flush queued events when buffer clears
  private flushEventQueue(client: any): void {
    const eventQueue = (client as any)._eventQueue;
    if (!eventQueue || eventQueue.size === 0) return;
    
    const MAX_BUFFER_SIZE = 64 * 1024;
    
    // Only flush if buffer is clear enough
    if ((client as any).bufferedAmount > MAX_BUFFER_SIZE) {
      // Still backed up, reschedule
      this.scheduleQueueFlush(client);
      return;
    }
    
    // Send all queued events
    const events = Array.from(eventQueue.values()) as string[];
    eventQueue.clear();
    
    events.forEach(message => {
      try {
        if (client.readyState === 1) { // Still OPEN
          client.send(message);
        }
      } catch (error) {
        console.error('Failed to flush queued message:', error);
      }
    });
    
    console.log(`Flushed ${events.length} queued events`);
  }

  // Centralized cache update broadcast with granular filtering
  public broadcastCacheUpdate(cacheType: string, data: any): void {
    if (!this.wss) {
      return;
    }

    const message = JSON.stringify({ 
      event: 'cache-updated',
      cacheType, // Specific cache type for filtering
      data, 
      timestamp: new Date().toISOString() 
    });
    
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        const socketData = this.authenticatedSockets.get(client);
        const componentType = socketData?.componentType || 'unknown';
        
        // Apply centralized filtering: only send to components that need this cache type
        if (shouldReceiveCacheUpdate(cacheType, componentType)) {
          this.sendWithBackpressureProtection(client, message, `cache:${cacheType}`);
        }
      }
    });
  }

  // Broadcast admin message to all authenticated clients (for multi-instance support)
  private broadcastAdminMessageToClients(adminMessageEvent: any): void {
    if (!this.wss) return;

    const message = JSON.stringify(adminMessageEvent);
    
    // Broadcast to all authenticated WebSocket clients
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        const socketData = this.authenticatedSockets.get(client);
        if (socketData) {
          this.sendWithBackpressureProtection(client, message, `admin-message:broadcast`);
        }
      }
    });
  }

  // Send targeted notification to specific user by userId or email
  sendUserNotification(userIdentifier: string | number, event: string, data: any): boolean {
    if (!this.wss) {
      console.warn(`No WebSocket server available to send ${event} notification to user ${userIdentifier}`);
      return false;
    }

    const userIdString = String(userIdentifier);
    const message = JSON.stringify({ 
      event, 
      data, 
      timestamp: new Date().toISOString() 
    });
    
    let notificationSent = false;
    
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        const socketData = this.authenticatedSockets.get(client);
        
        // Match by userId (as string) - covers both cases where userIdentifier is number or string
        if (socketData && socketData.userId === userIdString) {
          this.sendWithBackpressureProtection(client, message, `user-notification:${event}`);
          notificationSent = true;
        }
      }
    });
    
    if (!notificationSent) {
      console.log(`User ${userIdentifier} not currently connected, storing ${event} notification for next connection`);
      // Store notification for when user connects next
      this.pendingNotifications.push({ 
        event, 
        data: { ...data, targetUserId: userIdString }, 
        timestamp: new Date() 
      });
      
      // Keep only last 10 notifications per method
      if (this.pendingNotifications.length > 10) {
        this.pendingNotifications.shift();
      }
    }
    
    return notificationSent;
  }

  private async refreshCacheWithWorker(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<void> {
    if (!this.useRedis || !this.redis) {
      await this.refreshFallbackData();
      return;
    }

    // Implement distributed locking with stale lock detection
    const lockKey = CACHE_KEYS.CACHE_LOCK;
    const lockValue = `${process.env.POD_NAME || 'unknown'}_${process.pid}_${Date.now()}`;
    
    try {
      // Try to acquire lock with expiration
      const lockAcquired = await this.redis.set(
        lockKey, 
        lockValue, 
        'PX', 
        this.LOCK_TIMEOUT, 
        'NX'
      );

      if (!lockAcquired) {
        // Check if existing lock is stale
        const existingLock = await this.redis.get(lockKey);
        if (existingLock) {
          const lockTimestamp = parseInt(existingLock.split('_')[2]);
          const lockAge = Date.now() - lockTimestamp;
          
          if (lockAge > this.LOCK_TIMEOUT) {
            // Lock is stale, force acquire with conditional delete
            const deletedStale = await this.redis.eval(`
              if redis.call("get", KEYS[1]) == ARGV[1] then
                redis.call("del", KEYS[1])
                return redis.call("set", KEYS[1], ARGV[2], "PX", ARGV[3], "NX")
              else
                return 0
              end
            `, 1, lockKey, existingLock, lockValue, this.LOCK_TIMEOUT);
            
            if (!deletedStale) {
              // Another pod acquired the lock, abort
              return;
            }
          } else {
            // Lock is valid, another pod is refreshing
            return;
          }
        }
      }

      // Lock acquired, prevent multiple worker threads
      if (this.cacheWorker) {
        this.cacheWorker.terminate();
        this.cacheWorker = null;
      }

      // Use worker thread for heavy cache refresh work with timeout
      const refreshPromise = new Promise((resolve, reject) => {
        const workerUrl = new URL('./cache-worker-entry.cjs', import.meta.url);
        this.cacheWorker = new Worker(workerUrl, {
          execArgv: ['--import', 'tsx'],
          workerData: { 
            redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
            buildType // Pass buildType to worker
          }
        });

        // Set worker timeout to prevent hanging
        const workerTimeout = setTimeout(() => {
          if (this.cacheWorker) {
            this.cacheWorker.terminate();
            this.cacheWorker = null;
          }
          reject(new Error('Cache worker timeout'));
        }, this.LOCK_TIMEOUT - 30000); // 30 seconds before lock expires

        this.cacheWorker.on('message', async (message: { type: string; data?: any; error?: string }) => {
          clearTimeout(workerTimeout);
          
          if (message.type === 'success' && message.data) {
            try {
              // Store all cache data atomically
              await this.storeCacheDataAtomic(message.data);
              
              // Broadcast refresh notification
              if (this.redis) await this.redis.publish(CACHE_KEYS.REFRESH_CHANNEL, JSON.stringify({
                type: 'cache_refreshed',
                timestamp: new Date().toISOString(),
                podId: process.env.POD_NAME || 'unknown'
              }));

              // Broadcast to WebSocket clients (simple payload) - use general cache type for full refresh
              this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.GENERAL, {
                lastUpdated: message.data.lastUpdated,
                entitiesCount: message.data.entities.length
              });

              resolve(undefined);
            } catch (error) {
              console.error('Error storing cache data:', error);
              reject(error);
            }
          } else if (message.type === 'error') {
            console.error('Cache worker error:', message.error);
            reject(new Error(message.error));
          }
        });

        this.cacheWorker.on('error', (error) => {
          clearTimeout(workerTimeout);
          console.error('Cache worker error:', error);
          reject(error);
        });
      });

      await refreshPromise;
      
    } catch (error) {
      console.error('Cache refresh error:', error);
      // Fallback to in-memory refresh
      await this.refreshFallbackData();
    } finally {
      // Release lock only if we own it (conditional delete)
      try {
        await this.redis.eval(`
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `, 1, lockKey, lockValue);
      } catch (lockError) {
        console.error('Failed to release cache lock:', lockError);
      }
      
      // Clean up worker
      if (this.cacheWorker) {
        this.cacheWorker.terminate();
        this.cacheWorker = null;
      }
    }
  }

  private async storeCacheDataAtomic(data: any): Promise<void> {
    if (!this.redis) throw new Error('Redis not available');
    
    // Use Redis transaction (MULTI/EXEC) for atomic cache updates
    const multi = this.redis.multi();
    const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300; // Add 5 minute buffer
    
    // Store all cache data atomically with expiration
    // Prefer slim list when provided by FastAPI worker; fallback to full entities
    const entitiesForCache = Array.isArray(data.entitiesSlim) ? data.entitiesSlim : data.entities;
    // Rebuild ENTITIES_HASH (hash-only for O(1) upserts)
    multi.del(CACHE_KEYS.ENTITIES_HASH);
    const slimArr: any[] = [];
    if (Array.isArray(entitiesForCache)) {
      for (const e of entitiesForCache as any[]) {
        const slim = this.projectSlimEntity(e);
        const field = this.buildEntitiesHashField(slim);
        multi.hset(CACHE_KEYS.ENTITIES_HASH, field, JSON.stringify(slim));
        slimArr.push(slim);
      }
    }
    // Apply TTL to the hash key as a whole
    multi.expire(CACHE_KEYS.ENTITIES_HASH, expireTime);
    multi.setex(CACHE_KEYS.TEAMS, expireTime, JSON.stringify(data.teams));
    multi.setex(CACHE_KEYS.TENANTS, expireTime, JSON.stringify(data.tenants));
    multi.setex(CACHE_KEYS.PERMISSIONS, expireTime, JSON.stringify(data.permissions || []));
    multi.setex(CACHE_KEYS.METRICS, expireTime, JSON.stringify(data.metrics));
    multi.setex(CACHE_KEYS.LAST_30_DAY_METRICS, expireTime, JSON.stringify(data.last30DayMetrics));
    multi.setex(CACHE_KEYS.COMPLIANCE_TRENDS, expireTime, JSON.stringify(data.complianceTrends || {}));
    // Optional: entities compliance cache (if provided by hydrator)
    if (data.entitiesCompliance) {
      multi.setex(CACHE_KEYS.ENTITIES_COMPLIANCE, expireTime, JSON.stringify(data.entitiesCompliance));
    }
    multi.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(data.recentChanges || []));
    multi.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(data.lastUpdated));

    // Conflicts: hydrate full history from FastAPI (resolved/rejected/pending)
    try {
      if (Array.isArray(data.conflicts)) {
        // Replace the list atomically: delete then LPUSH in order (newest first is optional)
        multi.del('sla:conflicts');
        // Push newest first to keep UI ordering consistent
        const conflictsArray = data.conflicts as any[];
        for (let i = conflictsArray.length - 1; i >= 0; i--) {
          multi.lpush('sla:conflicts', JSON.stringify(conflictsArray[i]));
        }
        // Trim to a sane upper bound
        multi.ltrim('sla:conflicts', 0, 999);
      }
    } catch {}

    // Atomically rebuild the owner index from the slim list we just wrote
    try {
      const indexMap = new Map<string, any[]>();
      const conflictMap = new Map<string, Set<string>>();
      if (Array.isArray(entitiesForCache)) {
        for (const e of entitiesForCache as any[]) {
          if (!e || e.is_entity_owner !== true) continue; // owners only
          const type = (e.entity_type || e.type || '').toString();
          const name = (e.entity_name || e.name || '').toString();
          if (!type || !name) continue;
          const indexKey = `${type.toLowerCase()}:${name.toLowerCase()}`;
          if (!indexMap.has(indexKey)) indexMap.set(indexKey, []);
          indexMap.get(indexKey)!.push(e);

          // Build conflict index set per entity_display_name/server
          const tenant = (e.tenant_name || '').toString();
          const disp = (e.entity_display_name || e.entity_name || '').toString();
          const server = (e.server_name ?? '').toString();
          const t = tenant.trim().toLowerCase();
          const d = disp.trim().toLowerCase();
          const s = server.trim().toLowerCase() || 'null';
          const conflictKey = `sla:entity_conflicts_index:${t}:${d}:${s}`;
          if (!conflictMap.has(conflictKey)) conflictMap.set(conflictKey, new Set<string>());
          conflictMap.get(conflictKey)!.add(String(e.team_name || '').trim());
        }
      }
      // Clear the hash and set fresh values in the same transaction
      multi.del(CACHE_KEYS.ENTITY_INDEX);
      indexMap.forEach((arr, field) => {
        multi.hset(CACHE_KEYS.ENTITY_INDEX, field, JSON.stringify(arr));
      });

      // Rebuild conflict HASH and keys registry
      multi.del(CACHE_KEYS.CONFLICT_HASH);
      multi.del(CACHE_KEYS.CONFLICT_INDEX_KEYS);
      conflictMap.forEach((teamSet, field) => {
        if (teamSet.size > 0) {
          multi.hset(CACHE_KEYS.CONFLICT_HASH, field, JSON.stringify(Array.from(teamSet)));
          multi.sadd(CACHE_KEYS.CONFLICT_INDEX_KEYS, field);
        }
      });
    } catch (e) {
      // If index rebuild scheduling fails, proceed without blocking hydrate
    }
    
    const results = await multi.exec();
    
    // Check if all operations succeeded
    if (!results || results.some(result => result[0] !== null)) {
      throw new Error('Atomic cache storage failed');
    }
    // Cache data stored atomically in Redis successfully
  }

  // Rebuild sla:entity_index from current sla:entities (owners only)
  private async rebuildEntityIndexFromSlim(): Promise<void> {
    if (!this.redis) return;
    const raw = await this.redis.get(CACHE_KEYS.ENTITIES);
    const list: any[] = raw ? JSON.parse(raw) : [];

    // Clear existing index
    try {
      const keys = await (this.redis as any).hkeys(CACHE_KEYS.ENTITY_INDEX);
      if (Array.isArray(keys) && keys.length > 0) {
        await (this.redis as any).hdel(CACHE_KEYS.ENTITY_INDEX, ...keys);
      }
    } catch (_) {}

    // Re-index owners only
    for (const item of list) {
      if (item && item.is_entity_owner === true) {
        await this.updateEntityIndex(item);
      }
    }
  }

  private async getCacheRefreshData(): Promise<CachedData> {
    // Check if FastAPI integration is enabled
    const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
    
    if (USE_FASTAPI) {
      // TODO: Implement FastAPI integration
      console.log('FastAPI integration enabled - would call FastAPI endpoints here');
      // For now, fallback to mock data even when FastAPI is "enabled"
      // return await this.fetchFromFastAPI();
    }
    
    // Generate mock data (current behavior)
    const entities = await storage.getEntities();
    const teams = await storage.getTeams();
    const tenants = await storage.getTenants();
    
    // Initialize metrics and trends for all predefined ranges
    const todayMetrics: Record<string, DashboardMetrics> = {};
    const yesterdayMetrics: Record<string, DashboardMetrics> = {};
    const last7DayMetrics: Record<string, DashboardMetrics> = {};
    const last30DayMetrics: Record<string, DashboardMetrics> = {};
    const thisMonthMetrics: Record<string, DashboardMetrics> = {};
    
    const todayTrends: Record<string, ComplianceTrendData> = {};
    const yesterdayTrends: Record<string, ComplianceTrendData> = {};
    const last7DayTrends: Record<string, ComplianceTrendData> = {};
    const last30DayTrends: Record<string, ComplianceTrendData> = {};
    const thisMonthTrends: Record<string, ComplianceTrendData> = {};
    
    // Team-specific data structures
    const teamMetrics: Record<string, Record<string, DashboardMetrics>> = {};
    const teamTrends: Record<string, Record<string, ComplianceTrendData>> = {};
    
    // Generate mock data for each tenant and all predefined ranges
    for (const tenant of tenants) {
      const tenantEntities = entities.filter(e => e.tenant_name === tenant.name && e.is_entity_owner === true);
      const tenantTables = tenantEntities.filter(e => e.type === 'table');
      const tenantDags = tenantEntities.filter(e => e.type === 'dag');
      
      // Calculate base metrics
      const baseMetrics = this.calculateMetrics(tenantEntities, tenantTables, tenantDags);
      
      // Use mock data ONLY for Last 30 Days to test date filter functionality
      // All other ranges should be empty/null to verify date filter routing works
      
      // Only populate Last 30 Days data
      last30DayMetrics[tenant.name] = baseMetrics;
      last30DayTrends[tenant.name] = this.generateComplianceTrendForRange(tenantEntities, tenantTables, tenantDags, 30);
      
      // Generate team-specific data for each team in the tenant
      const tenantTeams = teams.filter(t => t.tenant_id === tenant.id);
      for (const team of tenantTeams) {
        // For team dashboard: get ALL entities (active and inactive for visibility)
        const allTeamEntities = entities.filter(e => 
          e.tenant_name === tenant.name && 
          e.teamId === team.id
        );
        
        if (allTeamEntities.length > 0) {
          const teamTables = allTeamEntities.filter(e => e.type === 'table');
          const teamDags = allTeamEntities.filter(e => e.type === 'dag');
          
          // Initialize tenant containers if not exists
          if (!teamMetrics[tenant.name]) teamMetrics[tenant.name] = {};
          if (!teamTrends[tenant.name]) teamTrends[tenant.name] = {};
          
          // Calculate team-specific metrics and trends
          teamMetrics[tenant.name][team.name] = this.calculateMetrics(allTeamEntities, teamTables, teamDags);
          teamTrends[tenant.name][team.name] = this.generateComplianceTrendForRange(allTeamEntities, teamTables, teamDags, 30);
        }
      }
      
      // Leave all other ranges empty for testing
      // todayMetrics[tenant.name] = null; (default empty)
      // yesterdayMetrics[tenant.name] = null; (default empty)
      // last7DayMetrics[tenant.name] = null; (default empty)
      // thisMonthMetrics[tenant.name] = null; (default empty)
      // todayTrends[tenant.name] = null; (default empty)
      // yesterdayTrends[tenant.name] = null; (default empty)
      // last7DayTrends[tenant.name] = null; (default empty)
      // thisMonthTrends[tenant.name] = null; (default empty)
    }
    
    // Create type-segregated Maps for proper cache isolation
    const entitiesById = new Map<number, Entity>();
    const entitiesByTeamType = new Map<string, number[]>();
    const entitiesByName = new Map<string, number>();
    
    // Populate the new Maps from entities array
    entities.forEach(entity => {
      // Store by ID
      entitiesById.set(entity.id, entity);
      
      // Store by team+type (composite key for type isolation)
      const teamTypeKey = `${entity.teamId}:${entity.type}`;
      if (!entitiesByTeamType.has(teamTypeKey)) {
        entitiesByTeamType.set(teamTypeKey, []);
      }
      entitiesByTeamType.get(teamTypeKey)!.push(entity.id);
      
      // Store by team+type+name (composite key for lookup isolation)
      const nameKey = `${entity.teamId}:${entity.type}:${entity.name}`;
      entitiesByName.set(nameKey, entity.id);
    });

    // Build allTasksData from DAG entities using mock service
    const { mockTaskService } = await import('../client/src/features/sla/mockService.js');
    const allTasksData = mockTaskService.getAllTasksData();
    
    // Get permissions from storage
    const permissions = await storage.getPermissions();

    return {
      entities,
      // New type-segregated storage for proper cache isolation
      entitiesById,
      entitiesByTeamType,
      entitiesByName,
      teams,
      tenants,
      permissions,
      // Backward compatibility - use last30DayMetrics as default metrics
      metrics: last30DayMetrics,
      last30DayMetrics,
      complianceTrends: last30DayTrends,
      // New predefined range data
      todayMetrics,
      yesterdayMetrics,
      last7DayMetrics,
      thisMonthMetrics,
      todayTrends,
      yesterdayTrends,
      last7DayTrends,
      last30DayTrends,
      thisMonthTrends,
      // Team-specific data
      teamMetrics,
      teamTrends,
      lastUpdated: new Date(),
      recentChanges: [],
      allTasksData
    };
  }

  // Methods for accessing cached data by range
  async getMetricsByTenantAndRange(tenantName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<DashboardMetrics | null> {
    const rangeKey = this.normalizeRangeKey(range);
    const [compliance, slimEntities] = await Promise.all([
      this.getEntitiesCompliance(),
      this.getSlimEntities(),
    ]);

    // Derive counts from slim entities (owners only as existing logic)
    const ownerEntities = (slimEntities as any[]).filter((e: any) => e.tenant_name === tenantName && e.is_entity_owner === true);
    const tablesCount = ownerEntities.filter((e: any) => (e.entity_type || e.type) === 'table').length;
    const dagsCount = ownerEntities.filter((e: any) => (e.entity_type || e.type) === 'dag').length;
    const entitiesCount = ownerEntities.length;

    let overallPct = 0, tablesPct = 0, dagsPct = 0;
    if (Array.isArray(compliance) && compliance.length > 0) {
      const rows = (compliance as any[]).filter((r: any) => r.tenant_name === tenantName && r.team_id === 0 && r.range_key === rangeKey);
      const overall = rows.find((r: any) => r.entity_type === 'summary_overall');
      const tables  = rows.find((r: any) => r.entity_type === 'summary_table_overall');
      const dags    = rows.find((r: any) => r.entity_type === 'summary_dag_overall');
      overallPct = typeof overall?.last_sla_compliance_pct === 'number' ? overall.last_sla_compliance_pct : 0;
      tablesPct  = typeof tables?.last_sla_compliance_pct  === 'number' ? tables.last_sla_compliance_pct  : 0;
      dagsPct    = typeof dags?.last_sla_compliance_pct    === 'number' ? dags.last_sla_compliance_pct    : 0;
    }

    return {
      overallCompliance: overallPct,
      tablesCompliance: tablesPct,
      dagsCompliance: dagsPct,
      entitiesCount,
      tablesCount,
      dagsCount,
    };
  }
  
  async getComplianceTrendsByTenantAndRange(tenantName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<ComplianceTrendData | null> {
    const rangeKey = this.normalizeRangeKey(range);
    const compliance = await this.getEntitiesCompliance();
    if (Array.isArray(compliance) && compliance.length > 0) {
      const rows = (compliance as any[]).filter((r: any) => r.tenant_name === tenantName && r.team_id === 0 && r.range_key === rangeKey);
      const overall = rows.find((r: any) => r.entity_type === 'summary_overall');
      const tables  = rows.find((r: any) => r.entity_type === 'summary_table_overall');
      const dags    = rows.find((r: any) => r.entity_type === 'summary_dag_overall');

      const dates: string[] = [];
      const pushDates = (arr?: any[]) => {
        if (!Array.isArray(arr)) return;
        for (const obj of arr) {
          const d = Object.keys(obj)[0];
          if (d && !dates.includes(d)) dates.push(d);
        }
      };
      pushDates(overall?.compliance_range_metrics);
      pushDates(tables?.compliance_range_metrics);
      pushDates(dags?.compliance_range_metrics);
      dates.sort();

      const findVal = (arr: any[] | undefined, date: string): number => {
        if (!Array.isArray(arr)) return 0;
        const rec = arr.find((o: any) => Object.prototype.hasOwnProperty.call(o, date));
        const v = rec ? rec[date] : null;
        return typeof v === 'number' ? v : 0;
      };

      const trend = dates.map(date => ({
        date,
        dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date)),
        overall: findVal(overall?.compliance_range_metrics, date),
        tables:  findVal(tables?.compliance_range_metrics,  date),
        dags:    findVal(dags?.compliance_range_metrics,    date),
      }));

      return { trend, lastUpdated: new Date() };
    }
    return { trend: [], lastUpdated: new Date() };
  }

  // Team-specific cache methods
  async getTeamMetricsByRange(tenantName: string, teamName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<DashboardMetrics | null> {
    const rangeKey = this.normalizeRangeKey(range);
    const [compliance, slimEntities] = await Promise.all([
      this.getEntitiesCompliance(),
      this.getSlimEntities(),
    ]);

    // Derive counts from slim entities (all entities for team dashboard)
    const teamEntities = (slimEntities as any[]).filter((e: any) => e.tenant_name === tenantName && e.team_name === teamName);
    const tablesCount = teamEntities.filter((e: any) => (e.entity_type || e.type) === 'table').length;
    const dagsCount = teamEntities.filter((e: any) => (e.entity_type || e.type) === 'dag').length;
    const entitiesCount = teamEntities.length;

    let overallPct = 0, tablesPct = 0, dagsPct = 0;
    if (Array.isArray(compliance) && compliance.length > 0) {
      const rows = (compliance as any[]).filter((r: any) => r.tenant_name === tenantName && r.team_name === teamName && r.range_key === rangeKey);
      const overall = rows.find((r: any) => r.entity_type === 'team_overall');
      const tables  = rows.find((r: any) => r.entity_type === 'team_table_overall');
      const dags    = rows.find((r: any) => r.entity_type === 'team_dag_overall');
      overallPct = typeof overall?.last_sla_compliance_pct === 'number' ? overall.last_sla_compliance_pct : 0;
      tablesPct  = typeof tables?.last_sla_compliance_pct  === 'number' ? tables.last_sla_compliance_pct  : 0;
      dagsPct    = typeof dags?.last_sla_compliance_pct    === 'number' ? dags.last_sla_compliance_pct    : 0;
    }

    return {
      overallCompliance: overallPct,
      tablesCompliance: tablesPct,
      dagsCompliance: dagsPct,
      entitiesCount,
      tablesCount,
      dagsCount,
    };
  }

  async getTeamTrendsByRange(tenantName: string, teamName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<ComplianceTrendData | null> {
    const rangeKey = this.normalizeRangeKey(range);
    const compliance = await this.getEntitiesCompliance();
    if (Array.isArray(compliance) && compliance.length > 0) {
      const rows = (compliance as any[]).filter((r: any) => r.tenant_name === tenantName && r.team_name === teamName && r.range_key === rangeKey);
      const overall = rows.find((r: any) => r.entity_type === 'team_overall');
      const tables  = rows.find((r: any) => r.entity_type === 'team_table_overall');
      const dags    = rows.find((r: any) => r.entity_type === 'team_dag_overall');

      const dates: string[] = [];
      const pushDates = (arr?: any[]) => {
        if (!Array.isArray(arr)) return;
        for (const obj of arr) {
          const d = Object.keys(obj)[0];
          if (d && !dates.includes(d)) dates.push(d);
        }
      };
      pushDates(overall?.compliance_range_metrics);
      pushDates(tables?.compliance_range_metrics);
      pushDates(dags?.compliance_range_metrics);
      dates.sort();

      const findVal = (arr: any[] | undefined, date: string): number => {
        if (!Array.isArray(arr)) return 0;
        const rec = arr.find((o: any) => Object.prototype.hasOwnProperty.call(o, date));
        const v = rec ? rec[date] : null;
        return typeof v === 'number' ? v : 0;
      };

      const trend = dates.map(date => ({
        date,
        dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date)),
        overall: findVal(overall?.compliance_range_metrics, date),
        tables:  findVal(tables?.compliance_range_metrics,  date),
        dags:    findVal(dags?.compliance_range_metrics,    date),
      }));

      return { trend, lastUpdated: new Date() };
    }
    return { trend: [], lastUpdated: new Date() };
  }

  async calculateTeamMetricsForDateRange(tenantName: string, teamName: string, startDate: Date, endDate: Date): Promise<DashboardMetrics | null> {
    try {
      // Get all entities for the tenant
      const allEntities = await this.getAllEntities();
      if (!allEntities || allEntities.length === 0) return null;
      
      // Filter entities by tenant and team for the date range
      // For team dashboard: include ALL entities (active and inactive for visibility)
      const teamEntities = allEntities.filter(entity => 
        entity.tenant_name === tenantName && 
        entity.team_name === teamName &&
        entity.lastRefreshed &&
        entity.lastRefreshed >= startDate &&
        entity.lastRefreshed <= endDate
      );
      
      if (teamEntities.length === 0) return null;
      
      // Calculate metrics for team entities
      const tables = teamEntities.filter(e => e.type === 'table');
      const dags = teamEntities.filter(e => e.type === 'dag');
      
      return this.calculateMetrics(teamEntities, tables, dags);
    } catch (error) {
      console.error('Error calculating team metrics for date range:', error);
      return null;
    }
  }
  
  private getCacheKeyForRange(range: string, type: 'metrics' | 'trends'): string {
    const prefix = type === 'metrics' ? 'METRICS' : 'TRENDS';
    switch (range) {
      case 'today': return `TODAY_${prefix}`;
      case 'yesterday': return `YESTERDAY_${prefix}`;
      case 'last7Days': return `LAST7DAY_${prefix}`;
      case 'last30Days': return `LAST30DAY_${prefix}`;
      case 'thisMonth': return `THISMONTH_${prefix}`;
      default: return `LAST30DAY_${prefix}`;
    }
  }

  // Public methods for accessing cached data
  async getAllEntities(): Promise<Entity[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.entities : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.ENTITIES);

      // Redis-first: If key doesn't exist, return empty array (don't populate from storage)
      if (!data) {
          return [];
        }
      
      const cachedEntities: Entity[] = JSON.parse(data);
      return cachedEntities;
    } catch (error) {
      console.error('Error getting entities from Redis:', error);
      return this.fallbackData ? this.fallbackData.entities : [];
    }
  }

  async getAllTeams(): Promise<Team[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.teams : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.TEAMS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting teams from Redis:', error);
      return this.fallbackData ? this.fallbackData.teams : [];
    }
  }

  async getAllTenants(): Promise<Array<{ id: number; name: string; description?: string; isActive?: boolean; teamsCount?: number; createdAt?: string; updatedAt?: string }>> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.tenants : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.TENANTS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting tenants from Redis:', error);
      return this.fallbackData ? this.fallbackData.tenants : [];
    }
  }

  async getEntitiesByTenant(tenantName: string): Promise<Entity[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.entities.filter(entity => entity.tenant_name === tenantName) : [];
    }
    
    try {
      const entities = await this.getAllEntities();
      return entities.filter(entity => entity.tenant_name === tenantName);
    } catch (error) {
      console.error('Error filtering entities by tenant:', error);
      return this.fallbackData ? this.fallbackData.entities.filter(entity => entity.tenant_name === tenantName) : [];
    }
  }

  async getTeamsByTenant(tenantName: string): Promise<Team[]> {
    try {
      const teams = await this.getAllTeams();
      return teams.filter(team => {
        // Support both shapes: { tenant: string } or { tenant_id: number } with name lookup
        if ((team as any).tenant) return (team as any).tenant === tenantName;
        const tenantObj = (this.fallbackData ? this.fallbackData.tenants : [])
          .find(t => t.id === (team as any).tenant_id);
        return tenantObj ? tenantObj.name === tenantName : false;
      });
    } catch (error) {
      console.error('Error filtering teams by tenant:', error);
      return [];
    }
  }

  async getDashboardMetrics(tenantName: string): Promise<DashboardMetrics | null> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.metrics[tenantName] || null : null;
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.METRICS);
      if (!data) return null;
      
      const metrics = JSON.parse(data);
      return metrics[tenantName] || null;
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      return this.fallbackData ? this.fallbackData.metrics[tenantName] || null : null;
    }
  }

  // ============================================
  // TASK CACHE METHODS - 6-hour cache integration
  // ============================================

  async getAllTasks(): Promise<any[]> {
    try {
      if (this.useRedis && this.redis) {
        const data = await this.redis.get(CACHE_KEYS.TASKS);
        if (data) {
          return JSON.parse(data);
        }
        
        // If no cached tasks, generate and cache
        const tasks = await this.generateTasksFallback();
        await this.setTasks(tasks); // Cache with 6-hour TTL
        return tasks;
      } else {
        // Use fallback data or generate from storage entities  
        if (this.fallbackData && (this.fallbackData as any).tasks) {
          return (this.fallbackData as any).tasks;
        }
        
        const tasks = await this.generateTasksFallback();
        await this.setTasks(tasks); // Update fallback cache
        return tasks;
      }
    } catch (error) {
      console.error('Error getting tasks from cache:', error);
      return await this.generateTasksFallback();
    }
  }

  async getTasksByDAG(dagId: number): Promise<any[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter(task => task.dag_id === dagId);
    } catch (error) {
      console.error('Error filtering tasks by DAG ID:', error);
      return [];
    }
  }

  async getTasksByDAGName(dagName: string): Promise<any[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter(task => task.dag_name === dagName);
    } catch (error) {
      console.error('Error filtering tasks by DAG name:', error);
      return [];
    }
  }

  async getTasksByTeam(teamName: string): Promise<any[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter(task => task.team_name === teamName);
    } catch (error) {
      console.error('Error filtering tasks by team:', error);
      return [];
    }
  }

  async getTasksByTenant(tenantName: string): Promise<any[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter(task => task.tenant_name === tenantName);
    } catch (error) {
      console.error('Error filtering tasks by tenant:', error);
      return [];
    }
  }

  // Generate tasks from current entities (DAGs) for fallback
  private async generateTasksFallback(): Promise<any[]> {
    try {
      const entities = this.fallbackData ? this.fallbackData.entities : [];
      const dagEntities = entities.filter(e => e.type === 'dag');
      
      const allTasks: any[] = [];
      let taskIdCounter = 1;

      // Load task templates from mock data
      const { loadMockTaskTemplates } = await import('./test/mockData.js');
      const dagTaskTemplates = await loadMockTaskTemplates();

      dagEntities.forEach(dag => {
        const dagName = dag.name;
        const teamName = dag.team_name || 'Unknown';
        const tenantName = dag.tenant_name || 'Data Engineering';
        
        // Get task template for this DAG
        const taskTemplate = dagTaskTemplates[dagName] || dagTaskTemplates.default;
        
        taskTemplate.forEach((template: any) => {
          allTasks.push({
            id: taskIdCounter++,
            task_name: template.name,
            task_type: template.type,
            dag_name: dagName,
            dag_id: dag.id, // CRITICAL: Add DAG ID for instant cross-linking
            team_name: teamName,
            team_id: dag.teamId || 1,
            tenant_name: tenantName,
            tenant_id: dag.tenant_name === 'Ad Engineering' ? 2 : 1,
            task_preference: template.preference as 'regular' | 'AI',
            status: ['pending', 'running', 'completed', 'failed'][Math.floor(Math.random() * 4)],
            priority: ['low', 'normal', 'high'][Math.floor(Math.random() * 3)],
            duration_minutes: Math.floor(Math.random() * 120) + 5,
            last_run: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            next_run: new Date(Date.now() + Math.random() * 24 * 60 * 60 * 1000).toISOString(),
            dependencies: template.name === 'data_extraction' || template.name === 'raw_data_ingestion' ? [] : 
                         [taskTemplate[taskTemplate.indexOf(template) - 1]?.name || 'previous_task']
          });
        });
      });

      return allTasks;
    } catch (error) {
      console.error('Error generating tasks fallback:', error);
      return [];
    }
  }

  // Cache tasks data with 6-hour expiration
  async setTasks(tasks: any[]): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        // Set with 6-hour TTL in Redis
        const ttlMs = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
        await this.redis.set(CACHE_KEYS.TASKS, JSON.stringify(tasks), 'PX', ttlMs);
        console.log(`[Task Cache] Cached ${tasks.length} tasks in Redis for 6 hours`);
      } else {
        // Update fallback data for in-memory cache
        if (!this.fallbackData) {
          this.fallbackData = {
            entities: [], teams: [], tenants: [], permissions: [], metrics: {}, complianceTrends: {},
            // Initialize new type-segregated Maps for proper cache isolation
            entitiesById: new Map(),
            entitiesByTeamType: new Map(),
            entitiesByName: new Map(),
            last30DayMetrics: {}, todayMetrics: {}, yesterdayMetrics: {}, last7DayMetrics: {},
            thisMonthMetrics: {}, todayTrends: {}, yesterdayTrends: {}, last7DayTrends: {},
            last30DayTrends: {}, thisMonthTrends: {}, teamMetrics: {}, teamTrends: {},
            lastUpdated: new Date(), recentChanges: [],
            allTasksData: null
          };
        }
        (this.fallbackData as any).tasks = tasks;
        console.log(`[Task Cache] Updated ${tasks.length} tasks in fallback memory`);
      }
    } catch (error) {
      console.error('Error setting tasks cache:', error);
    }
  }

  // Set allTasksData in cache (AllTasksData format from schema)
  async setAllTasksData(allTasksData: any): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        // Store in Redis with 6-hour TTL
        const ttlMs = 6 * 60 * 60 * 1000;
        await this.redis.set('sla:allTasksData', JSON.stringify(allTasksData), 'PX', ttlMs);
        console.log(`[AllTasksData Cache] Updated cache with ${allTasksData.dagTasks?.length || 0} DAGs`);
      } else {
        // Update fallback in-memory cache
        if (this.fallbackData) {
          this.fallbackData.allTasksData = allTasksData;
          console.log(`[AllTasksData Cache] Updated fallback with ${allTasksData.dagTasks?.length || 0} DAGs`);
        }
      }
    } catch (error) {
      console.error('Error setting allTasksData cache:', error);
    }
  }

  // Invalidate task cache (for preference updates)
  async invalidateTaskCache(): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        await this.redis.del(CACHE_KEYS.TASKS);
        await this.redis.del('sla:allTasksData'); // Also invalidate allTasksData
        console.log('[Task Cache] Redis task cache invalidated');
      }
      
      // Also clear from fallback data
      if (this.fallbackData) {
        if ((this.fallbackData as any).tasks) {
          delete (this.fallbackData as any).tasks;
        }
        this.fallbackData.allTasksData = null;
        console.log('[Task Cache] Fallback task cache invalidated');
      }
    } catch (error) {
      console.error('Error invalidating task cache:', error);
    }
  }

  async getComplianceTrends(tenantName: string): Promise<ComplianceTrendData | null> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.complianceTrends[tenantName] || null : null;
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.COMPLIANCE_TRENDS);
      if (!data) return null;
      
      const trends = JSON.parse(data);
      return trends[tenantName] || null;
    } catch (error) {
      console.error('Error getting compliance trends:', error);
      return this.fallbackData ? this.fallbackData.complianceTrends[tenantName] || null : null;
    }
  }

  async calculateMetricsForDateRange(tenantName: string, startDate: Date, endDate: Date): Promise<DashboardMetrics | null> {
    if (!this.useRedis || !this.redis) {
      // TEST MODE: Only return data for "Last 30 Days" range  
      const now = new Date();
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysFromNow = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if this is the "Last 30 Days" range (allow some flexibility)
      const isLast30Days = daysDiff >= 29 && daysDiff <= 31 && daysFromNow <= 31;
      
      if (!isLast30Days) {
        console.log(`Date range ${startDate.toDateString()} to ${endDate.toDateString()} - Not Last 30 Days, returning null (404)`);
        return null; // This will trigger 404 response
      }
      
      console.log(`Date range ${startDate.toDateString()} to ${endDate.toDateString()} - Is Last 30 Days, returning cached data`);
      return this.fallbackData ? this.fallbackData.last30DayMetrics[tenantName] || null : null;
    }
    
    // For date range queries, we need to calculate fresh metrics
    // This bypasses the cache and calculates from current data
    try {
      const allEntities = await this.getEntitiesByTenant(tenantName);
      // Only consider entity owners for metrics calculations
      const entities = allEntities.filter(e => e.is_entity_owner === true);
      
      const tables = entities.filter(e => e.type === 'table');
      const dags = entities.filter(e => e.type === 'dag');
      
      const calcAvgSla = (items: Entity[]) => {
        if (items.length === 0) return 0;
        const sum = items.reduce((acc, item) => acc + (item.currentSla || 0), 0);
        return parseFloat((sum / items.length).toFixed(1));
      };
      
      return {
        overallCompliance: calcAvgSla(entities),
        tablesCompliance: calcAvgSla(tables),
        dagsCompliance: calcAvgSla(dags),
        entitiesCount: entities.length,
        tablesCount: tables.length,
        dagsCount: dags.length
      };
    } catch (error) {
      console.error('Error calculating date range metrics:', error);
      return this.fallbackData ? this.fallbackData.metrics[tenantName] || null : null;
    }
  }

  // Incremental cache update for pollers
  async createEntity(entityData: any): Promise<Entity> {
    if (!this.useRedis || !this.redis) {
      // Fallback to in-memory cache for creation if Redis unavailable
      const entities = this.fallbackData ? [...this.fallbackData.entities] : [];
      const newId = Math.max(...entities.map(e => e.id), 0) + 1;
      const now = new Date();
      
      const entity: Entity = {
        ...entityData,
        // New entities should start with Unknown status until scheduler updates
        status: 'Unknown',
        id: newId,
        createdAt: now,
        updatedAt: now,
        description: entityData.description || null,
        currentSla: entityData.currentSla || null,
        lastRefreshed: entityData.lastRefreshed || null
      };
      
      // CRITICAL FIX: Save to persistent storage first
      const storedEntity = await storage.createEntity(entity);
      
      console.log(`[DEBUG] createEntity - Created entity: id=${storedEntity.id}, teamId=${storedEntity.teamId}, type=${storedEntity.type}, name=${storedEntity.name}`);
      
      entities.push(storedEntity);
      
      // Update fallback data with persisted entity (deep clone to prevent shared references)
      if (this.fallbackData) {
        this.fallbackData.entities = structuredClone(entities);
        
        // CRITICAL FIX: Also update the indexed Maps for cache invalidation to work
        // Update entitiesById
        this.fallbackData.entitiesById.set(storedEntity.id, storedEntity);
        
        // Update entitiesByTeamType
        const teamTypeKey = `${storedEntity.teamId}:${storedEntity.type}`;
        if (!this.fallbackData.entitiesByTeamType.has(teamTypeKey)) {
          this.fallbackData.entitiesByTeamType.set(teamTypeKey, []);
        }
        this.fallbackData.entitiesByTeamType.get(teamTypeKey)!.push(storedEntity.id);
        
        console.log(`[DEBUG] createEntity - Updated fallback cache Maps: teamTypeKey=${teamTypeKey}, entitiesByTeamType size=${this.fallbackData.entitiesByTeamType.get(teamTypeKey)?.length}`);
        
        // Update entitiesByName
        const nameKey = `${storedEntity.teamId}:${storedEntity.type}:${storedEntity.name}`;
        this.fallbackData.entitiesByName.set(nameKey, storedEntity.id);
      }
      
      // Direct WebSocket broadcast in fallback mode with race condition protection
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'created',
        entityId: entity.id.toString(),
        entityName: entity.name,
        tenantName: entity.tenant_name || 'Unknown',
        teamName: entity.team_name || 'Unknown',
        ts: Date.now(),
        version: Date.now(), // Use timestamp as version for ordering
        updatedAt: entity.updatedAt.toISOString(),
        data: {
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type,
          teamName: entity.team_name || 'Unknown',
          tenantName: entity.tenant_name || 'Unknown',
          type: 'created',
          entity,
          timestamp: new Date()
        }
      };
      
      this.broadcastToClients('entity-updated', changeEvent);
      
      return entity;
    }
    
    try {
      // Get current entities and generate new ID
      const entities = await this.getAllEntities();
      const newId = Math.max(...entities.map(e => e.id), 0) + 1;
      const now = new Date();
      
      const entity: Entity = {
        ...entityData,
        // New entities should start with Unknown status until scheduler updates
        status: 'Unknown',
        id: newId,
        createdAt: now,
        updatedAt: now,
        description: entityData.description || null,
        currentSla: entityData.currentSla || null,
        lastRefreshed: entityData.lastRefreshed || null
      };
      
      // Add entity to Redis (pipelined with RECENT_CHANGES & LAST_UPDATED later)
      entities.push(entity);
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;

      // Also update slim cache immediately (ensure tenant_id via team lookup if missing)
      let slim = this.projectSlimEntity(entity);
      // Enrich owner reference for non-owners using flexible lookup when missing
      try {
        if (slim.is_entity_owner === false) {
          const refName = (entity as any).owner_entity_reference || (slim as any).owner_entity_reference || (slim as any).owner_entity_ref_name?.entity_owner_name;
          const refType: 'table' | 'dag' = (entity as any).type === 'table' ? 'table' : 'dag';
          if (refName) {
            const matches = await this.findSlimEntitiesByNameCI(refName, refType);
            if (matches && matches.length > 0) {
              const m = matches[0];
              if (!slim.owner_entity_ref_name || !slim.owner_entity_ref_name.entity_owner_name) {
                slim.owner_entity_ref_name = {
                  entity_owner_name: m.entity_name,
                  entity_owner_tenant_id: m.tenant_id ?? null,
                  entity_owner_tenant_name: m.tenant_name ?? null,
                  entity_owner_team_id: m.team_id ?? null,
                  entity_owner_team_name: m.team_name ?? null,
                };
              }
              // Persist owner_entity_reference for downstream consumers
              (slim as any).owner_entity_reference = refName;
              if ((m as any).entity_schedule) slim.entity_schedule = (m as any).entity_schedule;
              if ((m as any).expected_runtime_minutes != null) slim.expected_runtime_minutes = (m as any).expected_runtime_minutes;
              if ((m as any).entity_display_name) (slim as any).entity_display_name = (m as any).entity_display_name;
            }
          }
        }
      } catch {}
      if (!slim.tenant_id) {
        try {
          const teams = await this.getAllTeams();
          const team = teams.find(t => (t as any).id === entity.teamId || (t as any).name === entity.team_name);
          if (team && (team as any).tenant_id) {
            slim = { ...slim, tenant_id: (team as any).tenant_id };
          }
        } catch {}
      }
      // Ensure last_reported_at exists for newly created/updated entities
      if (!slim.last_reported_at) {
        slim.last_reported_at = new Date().toISOString();
      }
      await this.upsertSlimEntity(slim);
      if (slim.is_entity_owner === true) {
        await this.updateConflictIndexForOwner(slim);
      }
      
      // Record the change
      const change: EntityChange = {
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.type,
        teamName: entity.team_name || 'Unknown',
        tenantName: entity.tenant_name || 'Unknown',
        type: 'created',
        entity,
        timestamp: new Date()
      };
      
      // Add to recent changes (slim version only per new design)
      const recentChanges = await this.getRecentChanges();
      recentChanges.unshift({
        ...(slim as any),
        change_type: 'created',
        timestamp: new Date(),
        last_reported_at: (slim as any).last_reported_at || new Date().toISOString(),
      } as any);
      
      // Keep only last 50 changes
      if (recentChanges.length > 50) {
        recentChanges.splice(50);
      }
      
      // Pipeline writes for ENTITIES (slim list), RECENT_CHANGES, LAST_UPDATED
      const pipe1 = this.redis.pipeline();
      // Ensure slim ENTITIES stores only slim projection list
    try {
      // O(1) upsert into hash
      const field = this.buildEntitiesHashField(slim);
      await (this.redis as any).hset(CACHE_KEYS.ENTITIES_HASH, field, JSON.stringify(slim));
    } catch {}
      pipe1.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      pipe1.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(new Date()));
      await pipe1.exec();

      // Slim cache recent change already mirrored via RECENT_CHANGES write above
      
      // Create standardized event envelope for filtering with race condition protection  
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'created',
        entityId: entity.id.toString(),
        entityName: entity.name,
        tenantName: entity.tenant_name || 'Unknown',
        teamName: entity.team_name || 'Unknown',
        ts: Date.now(),
        version: Date.now(), // Use timestamp as version for ordering
        updatedAt: entity.updatedAt.toISOString(),
        data: change
      };

      // Broadcast change to all pods
      await this.redis.publish(CACHE_KEYS.CHANGES_CHANNEL, JSON.stringify(changeEvent));
      
      return entity;
    } catch (error) {
      console.error('Error creating entity in Redis:', error);
      // Fallback to storage
      return await storage.createEntity(entityData);
    }
  }

  async getEntity(entityId: number): Promise<Entity | undefined> {
    const entities = await this.getAllEntities();
    return entities.find(e => e.id === entityId);
  }

  async deleteEntity(entityId: number): Promise<boolean> {
    if (!this.useRedis || !this.redis) {
      // Fallback to in-memory cache for deletion if Redis unavailable
      if (!this.fallbackData) return false;
      
      const entities = [...this.fallbackData.entities];
      const entityIndex = entities.findIndex(e => e.id === entityId);
      
      if (entityIndex === -1) {
        return false; // Entity not found
      }
      
      const entityToDelete = entities[entityIndex];
      
      // Remove entity from array
      entities.splice(entityIndex, 1);
      
      // Update fallback data (deep clone to prevent shared references)
      this.fallbackData.entities = structuredClone(entities);
      
      // CRITICAL FIX: Also remove from the indexed Maps to keep cache consistent
      // Remove from entitiesById
      this.fallbackData.entitiesById.delete(entityToDelete.id);
      
      // Remove from entitiesByTeamType
      const teamTypeKey = `${entityToDelete.teamId}:${entityToDelete.type}`;
      if (this.fallbackData.entitiesByTeamType.has(teamTypeKey)) {
        const entityIds = this.fallbackData.entitiesByTeamType.get(teamTypeKey)!;
        const updatedIds = entityIds.filter(id => id !== entityToDelete.id);
        if (updatedIds.length > 0) {
          this.fallbackData.entitiesByTeamType.set(teamTypeKey, updatedIds);
        } else {
          this.fallbackData.entitiesByTeamType.delete(teamTypeKey);
        }
      }
      
      // Remove from entitiesByName
      const nameKey = `${entityToDelete.teamId}:${entityToDelete.type}:${entityToDelete.name}`;
      this.fallbackData.entitiesByName.delete(nameKey);
      
      console.log(`[DEBUG] deleteEntity - Removed entity from fallback cache Maps: id=${entityToDelete.id}, teamTypeKey=${teamTypeKey}`);
      
      // Direct WebSocket broadcast in fallback mode (standard envelope)
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'deleted',
        entityId: entityToDelete.id.toString(),
        entityName: entityToDelete.name,
        tenantName: entityToDelete.tenant_name || 'Unknown',
        teamName: entityToDelete.team_name || 'Unknown',
        ts: Date.now(),
        version: Date.now(),
        updatedAt: new Date().toISOString(),
        data: {
          entityId: entityToDelete.id,
          entityName: entityToDelete.name,
          entityType: entityToDelete.type,
          teamName: entityToDelete.team_name || 'Unknown',
          tenantName: entityToDelete.tenant_name || 'Unknown',
          type: 'deleted',
          entity: entityToDelete,
          timestamp: new Date()
        }
      };
      
      this.broadcastToClients('entity-updated', changeEvent);

      // Mirror deletion into in-memory storage as well to keep fallback refresh consistent
      try {
        await storage.deleteEntity(entityToDelete.id);
      } catch (mirrorErr) {
        console.warn('Storage mirror delete (fallback) failed (non-fatal):', mirrorErr);
      }

      return true;
    }
    
    try {
      const entities = await this.getAllEntities();
      const entityIndex = entities.findIndex(e => e.id === entityId);
      
      if (entityIndex === -1) {
        return false; // Entity not found
      }
      
      const entity = entities[entityIndex];
      
      // Remove entity from array
      entities.splice(entityIndex, 1);
      
      // Update entities in Redis (pipelined with RECENT_CHANGES & LAST_UPDATED)
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      
      // Record the change
      const change: EntityChange = {
        entityId: entity.id,
        entityName: resolveEntityIdentifier(entity, { fallback: entity.name ?? undefined }),
        entityType: entity.type,
        teamName: entity.team_name || 'Unknown',
        tenantName: entity.tenant_name || 'Unknown',
        type: 'deleted',
        entity,
        timestamp: new Date()
      };
      
      // Add to recent changes
      const recentChanges = await this.getRecentChanges();
      recentChanges.unshift(change);
      
      // Keep only last 50 changes
      if (recentChanges.length > 50) {
        recentChanges.splice(50);
      }
      
      const pipe2 = this.redis.pipeline();
      // Update slim list stored in ENTITIES (deletion)
      try {
        const existingSlimRaw = await this.redis.get(CACHE_KEYS.ENTITIES);
        const slimList: any[] = existingSlimRaw ? JSON.parse(existingSlimRaw) : [];
        // Remove any entry matching team/type/name regardless of tenant_id (handle tenant_id missing)
        const filtered = slimList.filter((x: any) => {
          const sameTeam = (x.team_id ?? x.teamId) === ((entity as any).team_id ?? entity.teamId);
          const sameType = (x.entity_type || x.type) === entity.type;
          const sameName = (x.entity_name || x.name) === entity.name;
          return !(sameTeam && sameType && sameName);
        });
        pipe2.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(filtered));
      } catch {
        // If read fails, just write current slim snapshot minus deleted
        pipe2.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify([]));
      }
      pipe2.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      pipe2.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(new Date()));
      await pipe2.exec();

      // Slim cache updates (in-place)
      const deleteKey = this.buildSlimCompositeKey({
        tenant_id: (entity as any).tenant_id ?? (entity as any).tenantId ?? 0,
        team_id: (entity as any).team_id ?? entity.teamId,
        entity_type: entity.type,
        entity_name: entity.name,
      });
      await this.removeSlimEntityByKey(deleteKey);
      await this.appendSlimRecentChange(this.projectSlimEntity(entity), 'deleted');
      
      // Create standardized event envelope for filtering with race condition protection
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'deleted',
        entityId: entity.id.toString(),
        entityName: change.entityName,
        tenantName: change.tenantName,
        teamName: change.teamName,
        ts: Date.now(),
        version: Date.now(), // Use timestamp as version for ordering
        updatedAt: entity.updatedAt?.toISOString() || new Date().toISOString(),
        data: change
      };

      // Broadcast change to all pods
      await this.redis.publish(CACHE_KEYS.CHANGES_CHANNEL, JSON.stringify(changeEvent));

      // NOTE: In Redis-first mode, we don't touch storage to avoid cross-contamination
      // Storage is only used when Redis is unavailable (fallback mode)

      return true;
    } catch (error) {
      console.error('Error deleting entity in Redis:', error);
      return await storage.deleteEntity(entityId);
    }
  }

  async getEntityByName({ name, type, teamName }: { name: string; type?: Entity['type']; teamName?: string }): Promise<Entity | undefined> {
    const entities = await this.getAllEntities();
    return entities.find((entity) => {
      if (type && entity.type !== type) return false;
      const candidates = [
        resolveEntityIdentifier(entity, { fallback: entity.name ?? undefined }),
        (entity as any).name,
        (entity as any).entity_name,
        (entity as any).table_name,
        (entity as any).dag_name,
      ].filter(Boolean) as string[];
      if (!candidates.includes(name)) return false;
      if (teamName && entity.team_name !== teamName) return false;
      return true;
    });
  }

  async deleteEntityByName(params: { name: string; type?: Entity['type']; teamName?: string }): Promise<boolean> {
    const entity = await this.getEntityByName(params);
    if (!entity) return false;
    return this.deleteEntity(entity.id);
  }

  async updateEntityById(entityId: number, updates: Partial<Entity>): Promise<Entity | undefined> {
    if (!this.useRedis || !this.redis) {
      // Fallback to in-memory cache for update if Redis unavailable
      if (!this.fallbackData) return undefined;
      
      const entities = [...this.fallbackData.entities];
      const entityIndex = entities.findIndex(e => e.id === entityId);
      
      if (entityIndex === -1) {
        return undefined; // Entity not found
      }
      
      const entity = entities[entityIndex];
      
      // Apply updates
      const updatedEntity: Entity = {
        ...entity,
        ...updates,
        updatedAt: new Date(),
        lastRefreshed: (updates as any).lastRefreshed || entity.lastRefreshed
      };
      
      entities[entityIndex] = updatedEntity;
      
      // Update fallback data - legacy entities array (deep clone to prevent shared references)
      this.fallbackData.entities = structuredClone(entities);
      
      // CRITICAL: Update the new type-segregated Maps for proper cache isolation (deep clone to prevent shared references)
      if (this.fallbackData.entitiesById) {
        this.fallbackData.entitiesById.set(entityId, structuredClone(updatedEntity));
      }
      
      // Update name lookup map if name changed
      if (this.fallbackData.entitiesByName && updates.name && updates.name !== entity.name) {
        // Remove old name mapping
        const oldNameKey = `${entity.teamId}:${entity.type}:${entity.name}`;
        this.fallbackData.entitiesByName.delete(oldNameKey);
        
        // Add new name mapping
        const newNameKey = `${entity.teamId}:${entity.type}:${updates.name}`;
        this.fallbackData.entitiesByName.set(newNameKey, entityId);
      }
      
      // Direct WebSocket broadcast in fallback mode with race condition protection
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'updated',
        entityId: entity.id.toString(),
        entityName: entity.name,
        tenantName: entity.tenant_name || 'Unknown',
        teamName: entity.team_name || 'Unknown',
        ts: Date.now(),
        version: Date.now(), // Use timestamp as version for ordering
        updatedAt: updatedEntity.updatedAt.toISOString(),
        data: {
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type,
          teamName: entity.team_name || 'Unknown',
          tenantName: entity.tenant_name || 'Unknown',
          type: 'updated',
          entity: updatedEntity,
          previousSla: entity.currentSla,
          newSla: (updates as any)?.currentSla ?? undefined,
          timestamp: new Date()
        }
      };
      
      this.broadcastToClients('entity-updated', changeEvent);

      // Mirror update into in-memory storage so fallback refresh remains consistent
      try {
        await storage.updateEntity(entity.id, updates as any);
      } catch (mirrorErr) {
        console.warn('Storage mirror update failed (non-fatal):', mirrorErr);
      }

      return updatedEntity;
    }
    
    try {
      const entities = await this.getAllEntities();
      const entityIndex = entities.findIndex(e => e.id === entityId);
      
      if (entityIndex === -1) {
        return undefined; // Entity not found
      }
      
      const entity = entities[entityIndex];
      const previousSla: number | undefined = (entity.currentSla ?? undefined) as any;
      
      // Apply updates
      const updatedEntity: Entity = {
        ...entity,
        ...updates,
        updatedAt: new Date(),
        lastRefreshed: typeof (updates as any).lastRefreshed === 'string'
          ? new Date((updates as any).lastRefreshed)
          : ((updates as any).lastRefreshed || entity.lastRefreshed)
      };
      
      entities[entityIndex] = updatedEntity;
      
      // Update entities in Redis (pipelined with RECENT_CHANGES & LAST_UPDATED)
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      
      // Record the change
      const change: EntityChange = {
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.type,
        teamName: entity.team_name || 'Unknown',
        tenantName: entity.tenant_name || 'Unknown',
        type: 'updated',
        entity: updatedEntity,
        previousSla: (previousSla ?? undefined) as any,
        newSla: ((updates as any)?.currentSla ?? undefined) as any,
        timestamp: new Date()
      };
      
      // Add to recent changes
      const recentChanges = await this.getRecentChanges();
      recentChanges.unshift(change);
      
      // Keep only last 50 changes
      if (recentChanges.length > 50) {
        recentChanges.splice(50);
      }
      
      const pipe3 = this.redis.pipeline();
      // Update slim list in ENTITIES
      try {
        const existingSlimRaw = await this.redis.get(CACHE_KEYS.ENTITIES);
        const slimList: any[] = existingSlimRaw ? JSON.parse(existingSlimRaw) : [];
        const slim = this.projectSlimEntity(updatedEntity);
        const key = this.buildSlimCompositeKey(slim);
        const idx = slimList.findIndex((x: any) => this.buildSlimCompositeKey(x) === key);
        if (idx >= 0) slimList[idx] = { ...slimList[idx], ...slim };
        else slimList.push(slim);
        pipe3.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(slimList));
      } catch {
        const slim = this.projectSlimEntity(updatedEntity);
        pipe3.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify([slim]));
      }
      pipe3.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      pipe3.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(new Date()));
      await pipe3.exec();

      // Slim cache updates (in-place)
      const slim = this.projectSlimEntity(updatedEntity);
      await this.upsertSlimEntity(slim);
      await this.appendSlimRecentChange(slim, 'updated');
      
      // Create standardized event envelope for filtering with race condition protection  
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'updated',
        entityId: entity.id.toString(),
        entityName: entity.name,
        tenantName: entity.tenant_name || 'Unknown',
        teamName: entity.team_name || 'Unknown',
        ts: Date.now(),
        version: Date.now(), // Use timestamp as version for ordering
        updatedAt: updatedEntity.updatedAt.toISOString(),
        data: change
      };

      // Broadcast change to all pods
      await this.redis.publish(CACHE_KEYS.CHANGES_CHANNEL, JSON.stringify(changeEvent));
      
      return updatedEntity;
    } catch (error) {
      console.error('Error updating entity by ID in Redis:', error);
      return await storage.updateEntity(entityId, updates);
    }
  }

  async updateEntity(entityName: string, entityType: string, teamName: string, updates: Partial<Entity>): Promise<boolean> {
    if (!this.useRedis || !this.redis) {
      // For fallback mode, we can't update entities (read-only)
      // Cannot update entity in fallback mode
      return false;
    }
    
    try {
      const entities = await this.getAllEntities();
      const teams = await this.getAllTeams();
      
      // Find the team
      const team = teams.find(t => t.name === teamName);
      if (!team) {
        console.error(`Team not found: ${teamName}`);
        return false;
      }
      
      // Find the entity
      const entityIndex = entities.findIndex(e => 
        e.name === entityName && 
        e.type === entityType && 
        e.teamId === team.id
      );
      
      if (entityIndex === -1) {
        console.error(`Entity not found: ${entityName} (${entityType}) in team ${teamName}`);
        return false;
      }
      
      const entity = entities[entityIndex];
      const previousSla = entity.currentSla != null ? entity.currentSla : undefined;
      
      // Apply updates
      entities[entityIndex] = {
        ...entity,
        ...updates,
        lastRefreshed: new Date()
      };
      
      // Update entities in Redis (pipelined with RECENT_CHANGES & LAST_UPDATED)
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      
      // Record the change
      const newSlaRaw = (updates as any)?.currentSla;
      const newSlaVal: number | undefined = typeof newSlaRaw === 'number' ? newSlaRaw : undefined;
      const change: EntityChange = {
        entityId: entity.id,
        entityName,
        entityType,
        teamName,
        tenantName: entity.tenant_name || 'Unknown',
        type: 'updated',
        entity: entities[entityIndex],
        previousSla: previousSla,
        newSla: newSlaVal,
        timestamp: new Date()
      };
      
      // Add to recent changes
      const recentChanges = await this.getRecentChanges();
      recentChanges.unshift(change);
      
      // Keep only last 50 changes
      if (recentChanges.length > 50) {
        recentChanges.splice(50);
      }
      
      const pipe4 = this.redis.pipeline();
      pipe4.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      pipe4.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      pipe4.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(new Date()));
      await pipe4.exec();
      
      // Broadcast change to all pods
      await this.redis.publish(CACHE_KEYS.CHANGES_CHANNEL, JSON.stringify(change));
      
      // Entity updated successfully in Redis cache
      return true;
    } catch (error) {
      console.error('Error updating entity in Redis:', error);
      return false;
    }
  }

  async getRecentChanges(tenantName?: string, teamName?: string): Promise<EntityChange[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.recentChanges : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.RECENT_CHANGES);
      let changes: EntityChange[] = data ? JSON.parse(data) : [];
      
      // Apply filters
      if (tenantName) {
        changes = changes.filter(change => change.tenantName === tenantName);
      }
      
      if (teamName) {
        changes = changes.filter(change => change.teamName === teamName);
      }
      
      // Filter changes within the last 6 hours
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      changes = changes.filter(change => new Date(change.timestamp) > sixHoursAgo);
      
      return changes;
    } catch (error) {
      console.error('Error getting recent changes:', error);
      return [];
    }
  }

  async getCacheStatus(): Promise<any> {
    if (!this.useRedis || !this.redis) {
      return {
        isInitialized: this.isInitialized,
        mode: 'fallback',
        fallbackCache: this.fallbackData ? {
          isLoaded: true,
          lastUpdated: this.fallbackData.lastUpdated,
          entitiesCount: this.fallbackData.entities.length,
          teamsCount: this.fallbackData.teams.length,
          tenantsCount: this.fallbackData.tenants.length
        } : null,
        redis: 'not_connected'
      };
    }
    
    try {
      const lastUpdated = await this.redis.get(CACHE_KEYS.LAST_UPDATED);
      const entitiesCount = await this.redis.exists(CACHE_KEYS.ENTITIES);
      const teamsCount = await this.redis.exists(CACHE_KEYS.TEAMS);
      
      return {
        isInitialized: this.isInitialized,
        mode: 'redis',
        lastUpdated: lastUpdated ? JSON.parse(lastUpdated) : null,
        cacheExists: {
          entities: entitiesCount > 0,
          teams: teamsCount > 0
        },
        redisConnection: this.redis.status,
        subscriberConnection: this.subscriber ? this.subscriber.status : 'not_connected'
      };
    } catch (error: any) {
      console.error('Error getting cache status:', error);
      return {
        isInitialized: false,
        mode: 'error',
        error: error.message
      };
    }
  }

  async forceRefresh(): Promise<void> {
    // Force refresh requested
    if (!this.useRedis || !this.redis) {
      await this.refreshFallbackData();
      return;
    }
    await this.refreshCacheWithWorker();
  }

  // Generic cache methods for additional data
  async get(key: string): Promise<any> {
    try {
      if (!this.useRedis || !this.redis) {
        return null;
      }
      
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      if (!this.useRedis || !this.redis) {
        return;
      }
      
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!this.useRedis || !this.redis) {
        return;
      }
      
      await this.redis.del(key);
    } catch (error) {
      console.error(`Cache del error for key ${key}:`, error);
    }
  }

  // Extensible cache invalidation system following centralized pattern
  async invalidateCache(invalidationConfig: {
    keys?: string[];
    patterns?: string[];
    mainCacheKeys?: (keyof typeof CACHE_KEYS)[];
    refreshAffectedData?: boolean;
    cacheTypes?: string[]; // Optional explicit cache types, auto-detected if not provided
    buildType?: 'Regular' | 'Forced'; // Cache build type for FastAPI awareness
  }): Promise<void> {
    const { keys = [], patterns = [], mainCacheKeys = [], refreshAffectedData = true, cacheTypes, buildType = 'Forced' } = invalidationConfig;

    try {
      // Invalidate specific cache keys
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.del(key)));
      }

      // Invalidate cache keys by patterns (useful for wildcard invalidation)
      if (patterns.length > 0) {
        for (const pattern of patterns) {
          const matchingKeys = await this.getKeysByPattern(pattern);
          if (matchingKeys.length > 0) {
            await Promise.all(matchingKeys.map(key => this.del(key)));
          }
        }
      }

      // Invalidate main cache entries and refresh them immediately
      if (mainCacheKeys.length > 0) {
        await this.invalidateAndRefreshMainCache(mainCacheKeys, refreshAffectedData, buildType);
      }

      // Auto-detect and broadcast cache update types based on what was invalidated
      const detectedCacheTypes = cacheTypes || this.detectCacheTypes(keys, patterns, mainCacheKeys);
      detectedCacheTypes.forEach(cacheType => {
        this.broadcastCacheUpdate(cacheType, {
          timestamp: new Date().toISOString()
        });
      });

    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  // Auto-detect which cache types were affected by the invalidation
  private detectCacheTypes(keys: string[], patterns: string[], mainCacheKeys: (keyof typeof CACHE_KEYS)[]): string[] {
    const cacheTypes = new Set<string>();

    // Check patterns and keys for specific cache types
    const allPatterns = [...keys, ...patterns].join(' ').toLowerCase();

    if (allPatterns.includes('team') || allPatterns.includes('member')) {
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_MEMBERS);
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_DETAILS);
    }
    if (allPatterns.includes('notification')) {
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_NOTIFICATIONS);
    }
    if (allPatterns.includes('entit')) {
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES);
    }
    if (allPatterns.includes('user')) {
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.USERS);
    }
    if (allPatterns.includes('tenant')) {
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.TENANTS);
    }
    if (allPatterns.includes('conflict')) {
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.CONFLICTS);
    }

    // Check main cache keys
    mainCacheKeys.forEach(key => {
      if (key === 'ENTITIES') cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES);
      if (key === 'TEAMS') {
        cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_DETAILS);
        cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_MEMBERS);
      }
      if (key === 'TENANTS') cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.TENANTS);
      if (key === 'METRICS') cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.METRICS);
    });

    // If no specific types detected, use general cache update
    if (cacheTypes.size === 0) {
      cacheTypes.add(WEBSOCKET_CONFIG.cacheUpdateTypes.GENERAL);
    }

    return Array.from(cacheTypes);
  }

  private async getKeysByPattern(pattern: string): Promise<string[]> {
    if (!this.useRedis || !this.redis) {
      return [];
    }

    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      console.error(`Error getting keys by pattern ${pattern}:`, error);
      return [];
    }
  }

  private async invalidateAndRefreshMainCache(
    mainCacheKeys: (keyof typeof CACHE_KEYS)[],
    refreshData: boolean = true,
    buildType: 'Regular' | 'Forced' = 'Forced'
  ): Promise<void> {
    // Handle fallback mode when Redis is unavailable
    if (!this.useRedis || !this.redis) {
      if (refreshData) {
        await this.refreshFallbackDataForKeys(mainCacheKeys);
      }
      return;
    }

    try {
      // Delete specified main cache keys
      const keysToDelete = mainCacheKeys.map(key => CACHE_KEYS[key]);
      await Promise.all(keysToDelete.map(key => this.del(key)));

      // Immediately refresh affected data if requested
      if (refreshData) {
        await this.refreshAffectedMainCacheData(mainCacheKeys, buildType);
      }

    } catch (error) {
      console.error('Error in main cache invalidation:', error);
    }
  }

  private async refreshAffectedMainCacheData(affectedKeys: (keyof typeof CACHE_KEYS)[], buildType: 'Regular' | 'Forced' = 'Forced'): Promise<void> {
    const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300; // Add 5 minute buffer

    try {
      // Refresh each affected cache key individually for immediate consistency
      for (const key of affectedKeys) {
        switch (key) {
          case 'TEAMS':
            const teams = await storage.getTeams();
            await this.set(CACHE_KEYS.TEAMS, teams, expireTime);
            break;
          case 'ENTITIES':
            const entities = await storage.getEntities();
            await this.set(CACHE_KEYS.ENTITIES, entities, expireTime);
            break;
          case 'TENANTS':
            const tenants = await storage.getTenants();
            await this.set(CACHE_KEYS.TENANTS, tenants, expireTime);
            break;
          case 'METRICS':
            // Recalculate metrics after data changes
            const refreshedData = await this.getCacheRefreshData();
            await this.set(CACHE_KEYS.METRICS, refreshedData.metrics, expireTime);
            await this.set(CACHE_KEYS.LAST_30_DAY_METRICS, refreshedData.last30DayMetrics, expireTime);
            break;
        }
      }

      // Update last refresh timestamp
      await this.set(CACHE_KEYS.LAST_UPDATED, new Date(), expireTime);

    } catch (error) {
      console.error('Error refreshing main cache data:', error);
    }
  }

  private async refreshFallbackDataForKeys(affectedKeys: (keyof typeof CACHE_KEYS)[]): Promise<void> {
    if (!this.fallbackData) {
      await this.refreshFallbackData();
      return;
    }

    try {
      // Update specific parts of fallback data based on the keys
      for (const key of affectedKeys) {
        switch (key) {
          case 'TEAMS':
            this.fallbackData.teams = await storage.getTeams();
            break;
          case 'ENTITIES':
            this.fallbackData.entities = structuredClone(await storage.getEntities());
            break;
          case 'TENANTS':
            this.fallbackData.tenants = await storage.getTenants();
            break;
          case 'METRICS':
            // Recalculate all fallback data to get fresh metrics
            const refreshedData = await this.getCacheRefreshData();
            this.fallbackData = refreshedData;
            break;
        }
      }
    } catch (error) {
      console.error('Error refreshing fallback data for keys:', error);
      // Fallback to full refresh if specific update fails
      await this.refreshFallbackData();
    }
  }

  // Centralized cache invalidation patterns for common operations
  async invalidateTeamData(teamName?: string, memberChangeData?: { action: string, memberId?: string, memberName?: string, tenantName?: string }): Promise<void> {
    const tenantName = memberChangeData?.tenantName;
    const invalidationKeys = [
      'all_users',
      ...(teamName && tenantName ? [
        `team_members_${tenantName}_${teamName}`,
        `team_details_${tenantName}_${teamName}`,
        // Also clear old-style keys for backward compatibility
        `team_members_${teamName}`,
        `team_details_${teamName}`
      ] : teamName ? [
        `team_members_${teamName}`,
        `team_details_${teamName}`
      ] : [])
    ];

    // In Redis mode, don't touch mainCacheKeys (teams are managed by direct writes)
    // Only invalidate in memory mode where we need to refresh from storage
    const status = await this.getCacheStatus();
    const isRedisMode = status && status.mode === 'redis';

    await this.invalidateCache({
      keys: invalidationKeys,
      patterns: teamName ? [] : ['team_members_*', 'team_details_*'],
      mainCacheKeys: isRedisMode ? [] : ['TEAMS'], // Only invalidate TEAMS in memory mode
      refreshAffectedData: !isRedisMode // Only refresh from storage in memory mode
    });

    // Broadcast specific cache updates based on what changed
    this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_MEMBERS, {
      teamName,
      action: memberChangeData?.action,
      timestamp: new Date().toISOString()
    });

    // Broadcast team member change if details provided
    if (teamName && memberChangeData) {
      const changeEvent: TeamMemberChangeEvent = {
        event: 'team-members-updated',
        type: memberChangeData.action === 'add' ? 'member-added' : 'member-removed',
        teamName,
        tenantName: memberChangeData.tenantName || 'Unknown',
        memberId: memberChangeData.memberId,
        memberName: memberChangeData.memberName,
        ts: Date.now(),
        version: Date.now(),
        updatedAt: new Date().toISOString(),
        data: memberChangeData
      };

      // Broadcast in both Redis and fallback modes
      if (this.useRedis && this.redis) {
        await this.redis.publish(CACHE_KEYS.CHANGES_CHANNEL, JSON.stringify(changeEvent));
      } else {
        this.broadcastToClients('team-members-updated', changeEvent);
      }
    }
  }

  async invalidateEntityData(teamId?: number): Promise<void> {
    const invalidationKeys = teamId ? [`entities_team_${teamId}`] : [];

    await this.invalidateCache({
      keys: invalidationKeys,
      patterns: teamId ? [] : ['entities_team_*'],
      mainCacheKeys: ['ENTITIES', 'TEAMS', 'METRICS'],
      refreshAffectedData: true
    });

    // Broadcast entities cache update
    this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES, {
      teamId,
      timestamp: new Date().toISOString()
    });

    // Broadcast metrics update
    this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.METRICS, {
      teamId,
      timestamp: new Date().toISOString()
    });
  }

  // Entity-type-specific cache invalidation (selective targeting)
  async invalidateEntityDataByType(
    teamId: number, 
    entityType: 'table' | 'dag',
    refreshSummaryCache: boolean = false
  ): Promise<void> {
    // Handle Redis cache invalidation
    if (this.useRedis && this.redis) {
      const invalidationKeys = [
        `entities_team_${teamId}`,
        `entities_type_${entityType}`,
        `entities_team_${teamId}_type_${entityType}`
      ];

      // Only refresh summary cache if explicitly requested (not the default)
      const mainCacheKeys: (keyof typeof CACHE_KEYS)[] = refreshSummaryCache 
        ? ['ENTITIES', 'TEAMS', 'METRICS'] 
        : ['ENTITIES']; // Don't refresh metrics/summary by default

      await this.invalidateCache({
        keys: invalidationKeys,
        patterns: [], // Target specific keys only, no broad patterns
        mainCacheKeys,
        refreshAffectedData: true
      });
    } else {
      // Handle fallback cache with proper type isolation
      await this.invalidateFallbackCacheByType(teamId, entityType, refreshSummaryCache);
    }
  }

  // Type-isolated fallback cache invalidation to prevent cross-contamination
  private async invalidateFallbackCacheByType(
    teamId: number, 
    entityType: 'table' | 'dag',
    refreshSummaryCache: boolean = false
  ): Promise<void> {
    if (!this.fallbackData) return;

    try {
      // Get fresh entities for this specific team and type from storage
      const allEntities = await storage.getEntities();
      console.log(`[DEBUG] invalidateFallbackCacheByType - All entities count: ${allEntities.length}, looking for teamId=${teamId}, type=${entityType}`);
      
      const teamEntities = allEntities
        .filter(e => e.teamId === teamId && e.type === entityType)
        .map(entity => structuredClone(entity));
      
      console.log(`[DEBUG] invalidateFallbackCacheByType - Found ${teamEntities.length} entities for team ${teamId}, type ${entityType}`);
      
      // Update only the specific team+type entries in the segregated Maps
      const teamTypeKey = `${teamId}:${entityType}`;
      
      // Clear old entries for this team+type combination
      this.fallbackData.entitiesByTeamType.delete(teamTypeKey);
      
      // Remove old name mappings for this team+type
      const keysToDelete: string[] = [];
      this.fallbackData.entitiesByName.forEach((entityId, nameKey) => {
        if (nameKey.startsWith(`${teamId}:${entityType}:`)) {
          keysToDelete.push(nameKey);
        }
      });
      keysToDelete.forEach(key => this.fallbackData!.entitiesByName.delete(key));
      
      // Add fresh entities to the type-segregated Maps
      const entityIds: number[] = [];
      teamEntities.forEach(entity => {
        // Update entities by ID map
        this.fallbackData!.entitiesById.set(entity.id, entity);
        
        // Update team+type index
        entityIds.push(entity.id);
        
        // Update name lookup map with composite key
        const nameKey = `${entity.teamId}:${entity.type}:${entity.name}`;
        this.fallbackData!.entitiesByName.set(nameKey, entity.id);
      });
      
      // Update team+type index with fresh entity IDs
      if (entityIds.length > 0) {
        this.fallbackData.entitiesByTeamType.set(teamTypeKey, entityIds);
      }
      
      // Update legacy entities array for backward compatibility (rebuild from Maps)
      this.rebuildLegacyEntitiesArray();
      
      console.log(`[CACHE] Invalidated fallback cache for team ${teamId}, type ${entityType} - updated ${teamEntities.length} entities`);
      
      if (refreshSummaryCache) {
        // If summary cache refresh is requested, refresh full cache data
        const freshData = await this.getCacheRefreshData();
        this.fallbackData = freshData;
        console.log(`[CACHE] Full fallback cache refreshed for team ${teamId}, type ${entityType}`);
      }
    } catch (error) {
      console.error(`Failed to invalidate fallback cache for team ${teamId}, type ${entityType}:`, error);
      // On error, do a full refresh to ensure consistency
      try {
        this.fallbackData = await this.getCacheRefreshData();
        console.log(`[CACHE] Full fallback cache refresh after error for team ${teamId}, type ${entityType}`);
      } catch (refreshError) {
        console.error('Failed to refresh fallback cache after invalidation error:', refreshError);
      }
    }
  }

  // Rebuild the legacy entities array from the new type-segregated Maps
  private rebuildLegacyEntitiesArray(): void {
    if (!this.fallbackData) return;
    
    const entities: Entity[] = [];
    this.fallbackData.entitiesById.forEach(entity => {
      entities.push(entity);
    });
    
    this.fallbackData.entities = structuredClone(entities);
  }

  // Background cache rebuilding for specific entity types
  async rebuildEntityCacheByType(
    teamId: number, 
    entityType: 'table' | 'dag'
  ): Promise<void> {
    try {
      // Get fresh data for this specific team and entity type
      const teamEntities = await storage.getEntitiesByTeam(teamId);
      const typeEntities = teamEntities.filter(e => e.type === entityType);
      
      if (this.useRedis && this.redis) {
        const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
        
        // Update team cache
        await this.redis.setex(`entities_team_${teamId}`, expireTime, JSON.stringify(teamEntities));
        
        // Update type-specific cache
        await this.redis.setex(`entities_team_${teamId}_type_${entityType}`, expireTime, JSON.stringify(typeEntities));
      }
      
      // Background rebuild completed successfully
    } catch (error) {
      console.warn(`Background cache rebuild failed for team ${teamId}, type ${entityType}:`, error);
      // Fail silently - next request will rebuild via lazy loading
    }
  }

  async invalidateTeamMetricsCache(tenantName: string, teamName: string): Promise<void> {
    try {
      if (!this.useRedis || !this.redis) {
        // For fallback mode, trigger a full cache refresh
        this.fallbackData = await this.getCacheRefreshData();
        console.log(`Team metrics cache invalidated for ${tenantName}/${teamName} (fallback mode)`);
        return;
      }

      // Invalidate all team metrics cache keys for this team
      const ranges = ['TODAY_METRICS', 'YESTERDAY_METRICS', 'LAST_7_DAYS_METRICS', 'LAST_30_DAYS_METRICS', 'THIS_MONTH_METRICS'];
      const teamKey = `${tenantName}:${teamName}`;
      
      for (const range of ranges) {
        const cacheKey = `${range}:TEAMS`;
        try {
          await this.redis.hdel(cacheKey, teamKey);
        } catch (error) {
          console.warn(`Failed to invalidate team metrics cache ${cacheKey}:${teamKey}:`, error);
        }
      }
      
      // Also invalidate team trends cache
      const trendRanges = ['TODAY_TRENDS', 'YESTERDAY_TRENDS', 'LAST_7_DAYS_TRENDS', 'LAST_30_DAYS_TRENDS', 'THIS_MONTH_TRENDS'];
      for (const range of trendRanges) {
        const cacheKey = `${range}:TEAMS`;
        try {
          await this.redis.hdel(cacheKey, teamKey);
        } catch (error) {
          console.warn(`Failed to invalidate team trends cache ${cacheKey}:${teamKey}:`, error);
        }
      }
      
      console.log(`Team metrics cache invalidated for ${tenantName}/${teamName}`);
    } catch (error) {
      console.error(`Failed to invalidate team metrics cache for ${tenantName}/${teamName}:`, error);
      // Non-fatal error - cache will refresh on next scheduled cycle
    }
  }

  async invalidateUserData(): Promise<void> {
    await this.invalidateCache({
      keys: ['all_users'],
      patterns: ['team_members_*'],
      mainCacheKeys: ['TEAMS'],
      refreshAffectedData: true
    });

    // Broadcast users cache update
    this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.USERS, {
      timestamp: new Date().toISOString()
    });
  }

  // New: Invalidate tenants comprehensively (dev + prod compatible)
  async invalidateTenants(): Promise<void> {
    // If Redis is available, clear main TENANTS cache and bump timestamp
    if (this.useRedis && this.redis) {
      try {
        await this.del(CACHE_KEYS.TENANTS);
        await this.set(CACHE_KEYS.LAST_UPDATED, new Date(), Math.floor(this.CACHE_DURATION_MS / 1000) + 300);
      } catch (err) {
        // Fallback to generic invalidation
        await this.invalidateCache({
          keys: ['all_tenants'],
          patterns: ['tenants_*'],
          mainCacheKeys: ['TENANTS'],
          refreshAffectedData: true
        });
      }
      return;
    }
    // Fallback mode
    await this.invalidateCache({
      keys: ['all_tenants'],
      patterns: ['tenants_*'],
      mainCacheKeys: ['TENANTS'],
      refreshAffectedData: true
    });

    // Broadcast tenants cache update
    this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TENANTS, {
      timestamp: new Date().toISOString()
    });

    // Broadcast metrics update
    this.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.METRICS, {
      timestamp: new Date().toISOString()
    });
  }

  // Hybrid approach: Invalidate targeted cache + optional background rebuild
  async invalidateAndRebuildEntityCache(
    teamId: number,
    entityType: Entity['type'],
    backgroundRebuild: boolean = true
  ): Promise<void> {
    // Step 1: Immediate targeted invalidation (fast response)
    await this.invalidateEntityDataByType(teamId, entityType as 'table' | 'dag', false);
    
    // Step 2: Optional background rebuild (non-blocking)
    if (backgroundRebuild) {
      // Run in background without awaiting
      this.rebuildEntityCacheByType(teamId, entityType as 'table' | 'dag');
    }
  }

  // Broadcast rollback event using existing entity update pattern
  async broadcastEntityRollback(rollbackData: {
    entityId: string;
    entityName: string;
    entityType: string;
    teamName: string;
    tenantName: string;
    toVersion: number;
    userEmail: string;
    reason: string;
    originUserId?: string;
  }): Promise<void> {
    try {
      const now = new Date();
      
      // Create standardized event envelope for filtering with race condition protection
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'rollback',
        entityId: rollbackData.entityId,
        entityName: rollbackData.entityName,
        tenantName: rollbackData.tenantName,
        teamName: rollbackData.teamName,
        originUserId: rollbackData.originUserId || rollbackData.userEmail,
        ts: Date.now(),
        version: Date.now(), // Use timestamp as version for ordering
        updatedAt: now.toISOString(),
        data: {
          entityId: rollbackData.entityId,
          entityName: rollbackData.entityName,
          entityType: rollbackData.entityType,
          teamName: rollbackData.teamName,
          tenantName: rollbackData.tenantName,
          type: 'rollback',
          toVersion: rollbackData.toVersion,
          userEmail: rollbackData.userEmail,
          reason: rollbackData.reason,
          timestamp: now
        }
      };

      // Broadcast change to all pods via Redis pub/sub if available
      if (this.useRedis && this.redis) {
        await this.redis.publish(CACHE_KEYS.CHANGES_CHANNEL, JSON.stringify(changeEvent));
      }
      
      // Also broadcast directly to WebSocket clients for immediate updates
      this.broadcastToClients('entity-updated', changeEvent);
      
      console.log(`Rollback event broadcasted for entity ${rollbackData.entityName} (${rollbackData.entityType}) to version ${rollbackData.toVersion}`);
      
    } catch (error) {
      console.error('Error broadcasting rollback event:', error);
      throw error;
    }
  }

  // Broadcast admin message to all connected clients
  async broadcastAdminMessage(messageData: {
    id: number;
    message: string;
    deliveryType: 'immediate' | 'login_triggered' | 'immediate_and_login_triggered';
    createdAt: Date;
    expiresAt: Date | null;
  }): Promise<void> {
    try {
      if (!this.wss) return;

      const broadcastData = {
        event: 'admin-message',
        data: {
          id: messageData.id,
          message: messageData.message,
          deliveryType: messageData.deliveryType,
          createdAt: messageData.createdAt.toISOString(),
          expiresAt: messageData.expiresAt ? messageData.expiresAt.toISOString() : null,
          timestamp: new Date().toISOString()
        }
      };

      const message = JSON.stringify(broadcastData);
      
      // Broadcast to all authenticated WebSocket clients
      this.wss.clients.forEach((client: any) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          const socketData = this.authenticatedSockets.get(client);
          if (socketData) {
            this.sendWithBackpressureProtection(client, message, `admin-message:${messageData.id}`);
          }
        }
      });

      // Also publish to Redis channel for multi-instance deployments
      if (this.useRedis && this.redis) {
        await this.redis.publish(CACHE_KEYS.ADMIN_MESSAGES, JSON.stringify(broadcastData));
      }

      console.log(`Admin message broadcasted: ${messageData.message.substring(0, 50)}...`);
      
    } catch (error) {
      console.error('Error broadcasting admin message:', error);
      throw error;
    }
  }

  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    if (this.cacheWorker) {
      this.cacheWorker.terminate();
    }
    
    if (this.redis) {
      this.redis.disconnect();
    }
    
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
    
    // Redis cache destroyed
  }
}

// Export singleton instance
export const redisCache = new RedisCache();