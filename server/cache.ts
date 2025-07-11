import { storage } from "./storage";
import { Entity, Team } from "@shared/schema";
import { config } from "./config";
import { WebSocketServer, WebSocket } from "ws";
import { Worker } from 'worker_threads';
import path from 'path';
import type { CacheRefreshData } from './cache-worker';

interface DashboardMetrics {
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
}

interface EntityChange {
  entityId: number;
  entityName: string;
  entityType: string;
  teamName: string;
  tenantName: string;
  type: 'updated' | 'created' | 'deleted';
  entity: Entity;
  previousSla?: number;
  newSla?: number;
  timestamp: Date;
}

interface CachedData {
  entities: Entity[];
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  metrics: Record<string, DashboardMetrics>;
  last30DayMetrics: Record<string, DashboardMetrics>; // Default 30-day cache
  lastUpdated: Date;
  recentChanges: EntityChange[]; // Track changes within 6-hour window
}

class DataCache {
  private cache: CachedData | null = null;
  private refreshInterval: NodeJS.Timer | null = null;
  private readonly CACHE_DURATION_MS = config.cache.refreshIntervalHours * 60 * 60 * 1000; // Configurable hours
  private wss: WebSocketServer | null = null;
  private cacheWorker: Worker | null = null;

  constructor() {
    this.initializeCache();
    this.startAutoRefresh();
  }

  private async initializeCache(): Promise<void> {
    console.log("Initializing data cache for all tenants and teams...");
    await this.refreshCache();
  }

  private startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => {
      console.log(`Auto-refreshing cache (${config.cache.refreshIntervalHours}-hour interval)...`);
      this.refreshCacheWithWorker();
    }, this.CACHE_DURATION_MS);
  }

  // WebSocket management
  setupWebSocket(wss: WebSocketServer): void {
    this.wss = wss;
    console.log('WebSocket server attached to cache system');
  }

  private broadcastToClients(event: string, data: any): void {
    if (!this.wss) return;

    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Worker thread cache refresh (non-blocking)
  private async refreshCacheWithWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.cacheWorker) {
        this.cacheWorker.terminate();
      }

      const workerPath = path.join(__dirname, 'cache-worker.ts');
      this.cacheWorker = new Worker(workerPath);

      this.cacheWorker.on('message', (message: { type: string; data?: CacheRefreshData; error?: string }) => {
        if (message.type === 'success' && message.data) {
          // Update cache with worker data
          const oldCache = this.cache;
          this.cache = {
            ...message.data,
            recentChanges: this.cache?.recentChanges || []
          };

          console.log(`[Worker] Cache refreshed successfully: ${message.data.entities.length} entities, ${message.data.teams.length} teams, ${message.data.tenants.length} tenants`);
          
          // Broadcast cache update to all connected clients
          this.broadcastToClients('cache-updated', {
            entitiesCount: message.data.entities.length,
            teamsCount: message.data.teams.length,
            tenantsCount: message.data.tenants.length,
            lastUpdated: message.data.lastUpdated
          });

          this.cacheWorker?.terminate();
          this.cacheWorker = null;
          resolve();
        } else if (message.type === 'error') {
          console.error('[Worker] Cache refresh failed:', message.error);
          this.cacheWorker?.terminate();
          this.cacheWorker = null;
          reject(new Error(message.error || 'Cache refresh failed'));
        }
      });

      this.cacheWorker.on('error', (error) => {
        console.error('[Worker] Cache worker error:', error);
        this.cacheWorker?.terminate();
        this.cacheWorker = null;
        reject(error);
      });

      // Start the worker
      this.cacheWorker.postMessage({ type: 'refresh' });
    });
  }

  // Fallback synchronous cache refresh for initial load
  private async refreshCache(): Promise<void> {
    try {
      // Load all entities, teams, and tenants
      const entities = await storage.getEntities();
      const teams = await storage.getTeams();
      const tenants = await storage.getTenants();

      // Calculate metrics for each tenant (default 30-day cache)
      const last30DayMetrics: Record<string, DashboardMetrics> = {};
      
      for (const tenant of tenants) {
        const tenantEntities = entities.filter(e => e.tenant_name === tenant.name);
        const tenantTables = tenantEntities.filter(e => e.type === 'table');
        const tenantDags = tenantEntities.filter(e => e.type === 'dag');

        last30DayMetrics[tenant.name] = this.calculateMetrics(tenantEntities, tenantTables, tenantDags);
      }

      // Update cache
      this.cache = {
        entities,
        teams,
        tenants,
        metrics: {}, // Empty for dynamic calculations
        last30DayMetrics,
        lastUpdated: new Date(),
        recentChanges: [] // Initialize empty recent changes
      };

      console.log(`Cache refreshed successfully: ${entities.length} entities, ${teams.length} teams, ${tenants.length} tenants`);
    } catch (error) {
      console.error("Failed to refresh cache:", error);
    }
  }

  private calculateMetrics(entities: Entity[], tables: Entity[], dags: Entity[]): DashboardMetrics {
    const calculateCompliance = (entityList: Entity[]) => {
      if (entityList.length === 0) return 0;
      const total = entityList.reduce((sum, entity) => sum + (entity.currentSla || 0), 0);
      return Math.round((total / entityList.length) * 10) / 10;
    };

    return {
      overallCompliance: calculateCompliance(entities),
      tablesCompliance: calculateCompliance(tables),
      dagsCompliance: calculateCompliance(dags),
      entitiesCount: entities.length,
      tablesCount: tables.length,
      dagsCount: dags.length
    };
  }

  // Incremental cache updates for poller notifications
  updateEntity(entityName: string, entityType: string, teamName: string, updates: Partial<Entity>): boolean {
    if (!this.cache) return false;

    // Find the team
    const team = this.cache.teams.find(t => t.name === teamName);
    if (!team) return false;

    // Find the entity
    const entityIndex = this.cache.entities.findIndex(e => 
      e.name === entityName && 
      e.type === entityType &&
      e.teamId === team.id
    );

    if (entityIndex === -1) return false;

    const oldEntity = this.cache.entities[entityIndex];
    const updatedEntity = { ...oldEntity, ...updates };
    
    // Update the entity in cache
    this.cache.entities[entityIndex] = updatedEntity;

    // Track the change
    const change: EntityChange = {
      entityId: oldEntity.id,
      entityName,
      entityType,
      teamName,
      tenantName: oldEntity.tenant_name || '',
      type: 'updated',
      entity: updatedEntity,
      previousSla: oldEntity.currentSla,
      newSla: updatedEntity.currentSla,
      timestamp: new Date()
    };

    // Add to recent changes (keep only last 6 hours)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    this.cache.recentChanges = this.cache.recentChanges.filter(c => c.timestamp >= sixHoursAgo);
    this.cache.recentChanges.push(change);

    // Broadcast to WebSocket clients
    this.broadcastToClients('entity-updated', {
      entityId: oldEntity.id,
      entityName,
      entityType,
      teamName,
      tenantName: oldEntity.tenant_name,
      changes: updates,
      timestamp: new Date().toISOString()
    });

    console.log(`[Incremental Update] Entity ${entityName} (${entityType}) updated for team ${teamName}`);
    return true;
  }

  // Get recent changes for dashboard updates
  getRecentChanges(tenantName?: string, teamName?: string): EntityChange[] {
    if (!this.cache) return [];

    let changes = this.cache.recentChanges;

    // Filter by tenant if specified
    if (tenantName) {
      changes = changes.filter(c => c.tenantName === tenantName);
    }

    // Filter by team if specified
    if (teamName) {
      changes = changes.filter(c => c.teamName === teamName);
    }

    return changes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Public methods to get cached data
  getAllEntities(): Entity[] {
    return this.cache?.entities || [];
  }

  getAllTeams(): Team[] {
    return this.cache?.teams || [];
  }

  getAllTenants() {
    return this.cache?.tenants || [];
  }

  getEntitiesByTenant(tenantName: string): Entity[] {
    if (!this.cache) return [];
    return this.cache.entities.filter(e => e.tenant_name === tenantName);
  }

  getTeamsByTenant(tenantName: string): Team[] {
    if (!this.cache) return [];
    const tenantEntities = this.getEntitiesByTenant(tenantName);
    const teamIds = [...new Set(tenantEntities.map(e => e.teamId))];
    return this.cache.teams.filter(t => teamIds.includes(t.id));
  }

  getDashboardMetrics(tenantName: string): DashboardMetrics | null {
    return this.cache?.last30DayMetrics[tenantName] || null;
  }

  // Calculate metrics for specific date range (not cached)
  calculateMetricsForDateRange(tenantName: string, startDate: Date, endDate: Date): DashboardMetrics | null {
    if (!this.cache) return null;
    
    const tenantEntities = this.cache.entities.filter(e => e.tenant_name === tenantName);
    const tenantTables = tenantEntities.filter(e => e.type === 'table');
    const tenantDags = tenantEntities.filter(e => e.type === 'dag');

    // In a real implementation, you would filter entities by date range
    // For now, return calculated metrics for all entities
    return this.calculateMetrics(tenantEntities, tenantTables, tenantDags);
  }

  getCacheStatus() {
    return {
      isLoaded: !!this.cache,
      lastUpdated: this.cache?.lastUpdated,
      entitiesCount: this.cache?.entities.length || 0,
      teamsCount: this.cache?.teams.length || 0,
      tenantsCount: this.cache?.tenants.length || 0
    };
  }

  // Force refresh cache (useful for testing or manual refresh)
  async forceRefresh(): Promise<void> {
    await this.refreshCache();
  }

  // Cleanup on server shutdown
  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

// Export both class and singleton instance
export { DataCache };
export const dataCache = new DataCache();