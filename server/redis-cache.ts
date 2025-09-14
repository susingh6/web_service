import Redis from 'ioredis';
import { WebSocketServer } from 'ws';
import { Worker } from 'worker_threads';
import { config } from './config';
import { Entity, Team } from '@shared/schema';
import { storage } from './storage';
import { DashboardMetrics, EntityChange, CachedData, calculateMetrics, ComplianceTrendData, ComplianceTrendPoint } from '@shared/cache-types';

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

interface SocketData {
  sessionId: string;
  userId: string;
  subscriptions: Set<string>; // tenant:team format
}

// Cache keys
const CACHE_KEYS = {
  ENTITIES: 'sla:entities',
  TEAMS: 'sla:teams',
  TENANTS: 'sla:tenants',
  METRICS: 'sla:metrics',
  LAST_30_DAY_METRICS: 'sla:last30DayMetrics',
  COMPLIANCE_TRENDS: 'sla:complianceTrends',
  LAST_UPDATED: 'sla:lastUpdated',
  RECENT_CHANGES: 'sla:recentChanges',
  CACHE_LOCK: 'sla:cache_lock',
  REFRESH_CHANNEL: 'sla:refresh',
  CHANGES_CHANNEL: 'sla:changes'
};

export class RedisCache {
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private readonly CACHE_DURATION_MS = config.cache.refreshIntervalHours * 60 * 60 * 1000;
  private readonly LOCK_TIMEOUT = 300000; // 5 minutes lock timeout
  private wss: WebSocketServer | null = null;
  private authenticatedSockets: Map<any, SocketData> = new Map();
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

    this.subscriber.on('message', (channel, message) => {
      if (channel === CACHE_KEYS.REFRESH_CHANNEL) {
        // Cache refresh notification received - broadcast to all
        this.broadcastCacheUpdate('cache-updated', JSON.parse(message));
      } else if (channel === CACHE_KEYS.CHANGES_CHANNEL) {
        // Entity change notification received - filtered broadcast
        const changeEvent: EntityChangeEvent = JSON.parse(message);
        this.enqueueCoalescedBroadcast(changeEvent);
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
      
      // Test the connection
      await this.redis.connect();
      await this.subscriber.connect();
      
      // Ping test
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

  setupWebSocket(wss: WebSocketServer, authenticatedSockets?: Map<WebSocket, {
    sessionId: string;
    userId: string;
    subscriptions: Set<string>;
  }>): void {
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
    
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        const socketData = this.authenticatedSockets.get(client);
        
        // Send to authenticated clients who are subscribed to this tenant:team
        // Skip originator since they already got the echo
        if (socketData && 
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

  // Legacy broadcast for cache updates with backpressure protection
  private broadcastCacheUpdate(event: string, data: any): void {
    if (!this.wss) return;

    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        this.sendWithBackpressureProtection(client, message, `cache:${event}`);
      }
    });
  }

  private async refreshCacheWithWorker(): Promise<void> {
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
        this.cacheWorker = new Worker('./server/cache-worker.ts', {
          workerData: { redisUrl: process.env.REDIS_URL || 'redis://localhost:6379' }
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

              // Broadcast to WebSocket clients (simple payload)
              this.broadcastCacheUpdate('cache-updated', {
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
    multi.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(data.entities));
    multi.setex(CACHE_KEYS.TEAMS, expireTime, JSON.stringify(data.teams));
    multi.setex(CACHE_KEYS.TENANTS, expireTime, JSON.stringify(data.tenants));
    multi.setex(CACHE_KEYS.METRICS, expireTime, JSON.stringify(data.metrics));
    multi.setex(CACHE_KEYS.LAST_30_DAY_METRICS, expireTime, JSON.stringify(data.last30DayMetrics));
    multi.setex(CACHE_KEYS.COMPLIANCE_TRENDS, expireTime, JSON.stringify(data.complianceTrends || {}));
    multi.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(data.recentChanges || []));
    multi.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(data.lastUpdated));
    
    const results = await multi.exec();
    
    // Check if all operations succeeded
    if (!results || results.some(result => result[0] !== null)) {
      throw new Error('Atomic cache storage failed');
    }
    
    // Cache data stored atomically in Redis successfully
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
        const teamEntities = tenantEntities.filter(e => e.teamId === team.id);
        if (teamEntities.length > 0) {
          const teamTables = teamEntities.filter(e => e.type === 'table');
          const teamDags = teamEntities.filter(e => e.type === 'dag');
          
          // Initialize tenant containers if not exists
          if (!teamMetrics[tenant.name]) teamMetrics[tenant.name] = {};
          if (!teamTrends[tenant.name]) teamTrends[tenant.name] = {};
          
          // Calculate team-specific metrics and trends
          teamMetrics[tenant.name][team.name] = this.calculateMetrics(teamEntities, teamTables, teamDags);
          teamTrends[tenant.name][team.name] = this.generateComplianceTrendForRange(teamEntities, teamTables, teamDags, 30);
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
    
    return {
      entities,
      teams,
      tenants,
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
      recentChanges: []
    };
  }

  // Methods for accessing cached data by range
  async getMetricsByTenantAndRange(tenantName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<DashboardMetrics | null> {
    if (!this.useRedis || !this.redis) {
      const data = this.fallbackData;
      if (!data) return null;
      
      switch (range) {
        case 'today': return data.todayMetrics[tenantName] || null;
        case 'yesterday': return data.yesterdayMetrics[tenantName] || null;
        case 'last7Days': return data.last7DayMetrics[tenantName] || null;
        case 'last30Days': return data.last30DayMetrics[tenantName] || null;
        case 'thisMonth': return data.thisMonthMetrics[tenantName] || null;
        default: return data.last30DayMetrics[tenantName] || null;
      }
    }
    
    try {
      const cacheKey = this.getCacheKeyForRange(range, 'metrics');
      const metricsData = await this.redis.hget(cacheKey, tenantName);
      return metricsData ? JSON.parse(metricsData) : null;
    } catch (error) {
      console.error('Error getting metrics by tenant and range:', error);
      return null;
    }
  }
  
  async getComplianceTrendsByTenantAndRange(tenantName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<ComplianceTrendData | null> {
    if (!this.useRedis || !this.redis) {
      const data = this.fallbackData;
      if (!data) return null;
      
      switch (range) {
        case 'today': return data.todayTrends[tenantName] || null;
        case 'yesterday': return data.yesterdayTrends[tenantName] || null;
        case 'last7Days': return data.last7DayTrends[tenantName] || null;
        case 'last30Days': return data.last30DayTrends[tenantName] || null;
        case 'thisMonth': return data.thisMonthTrends[tenantName] || null;
        default: return data.last30DayTrends[tenantName] || null;
      }
    }
    
    try {
      const cacheKey = this.getCacheKeyForRange(range, 'trends');
      const trendsData = await this.redis.hget(cacheKey, tenantName);
      return trendsData ? JSON.parse(trendsData) : null;
    } catch (error) {
      console.error('Error getting trends by tenant and range:', error);
      return null;
    }
  }

  // Team-specific cache methods
  async getTeamMetricsByRange(tenantName: string, teamName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<DashboardMetrics | null> {
    if (!this.useRedis || !this.redis) {
      const data = this.fallbackData;
      if (!data || !(data as any).teamMetrics) return null;
      
      const teamMetrics = (data as any).teamMetrics[tenantName];
      if (!teamMetrics || !teamMetrics[teamName]) return null;
      
      // For fallback, we only have last30Days team metrics currently
      // Only return data for last30Days range, null for all others
      return range === 'last30Days' ? (teamMetrics[teamName] || null) : null;
    }
    
    try {
      const cacheKey = `${this.getCacheKeyForRange(range, 'metrics')}:TEAMS`;
      const teamKey = `${tenantName}:${teamName}`;
      const metricsData = await this.redis.hget(cacheKey, teamKey);
      return metricsData ? JSON.parse(metricsData) : null;
    } catch (error) {
      console.error('Error getting team metrics by range:', error);
      return null;
    }
  }

  async getTeamTrendsByRange(tenantName: string, teamName: string, range: 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth'): Promise<ComplianceTrendData | null> {
    if (!this.useRedis || !this.redis) {
      const data = this.fallbackData;
      if (!data || !(data as any).teamTrends) return null;
      
      const teamTrends = (data as any).teamTrends[tenantName];
      if (!teamTrends || !teamTrends[teamName]) return null;
      
      // For fallback, we only have last30Days team trends currently
      // Only return data for last30Days range, null for all others
      return range === 'last30Days' ? (teamTrends[teamName] || null) : null;
    }
    
    try {
      const cacheKey = `${this.getCacheKeyForRange(range, 'trends')}:TEAMS`;
      const teamKey = `${tenantName}:${teamName}`;
      const trendsData = await this.redis.hget(cacheKey, teamKey);
      return trendsData ? JSON.parse(trendsData) : null;
    } catch (error) {
      console.error('Error getting team trends by range:', error);
      return null;
    }
  }

  async calculateTeamMetricsForDateRange(tenantName: string, teamName: string, startDate: Date, endDate: Date): Promise<DashboardMetrics | null> {
    try {
      // Get all entities for the tenant
      const allEntities = await this.getAllEntities();
      if (!allEntities || allEntities.length === 0) return null;
      
      // Filter entities by tenant and team for the date range
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
      const entities: Entity[] = data ? JSON.parse(data) : [];
      // Defensive filter: remove any entities that were deleted in storage but lingered in cache
      try {
        const storageEntities = await storage.getEntities();
        const storageIds = new Set(storageEntities.map(e => e.id));
        return entities.filter(e => storageIds.has(e.id));
      } catch (_err) {
        return entities;
      }
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

  async getAllTenants(): Promise<Array<{ id: number; name: string; description?: string }>> {
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
        id: newId,
        createdAt: now,
        updatedAt: now,
        description: entityData.description || null,
        currentSla: entityData.currentSla || null,
        lastRefreshed: entityData.lastRefreshed || null
      };
      
      // CRITICAL FIX: Save to persistent storage first
      const storedEntity = await storage.createEntity(entity);
      
      entities.push(storedEntity);
      
      // Update fallback data with persisted entity
      if (this.fallbackData) {
        this.fallbackData.entities = entities;
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
      
      // Add to recent changes
      const recentChanges = await this.getRecentChanges();
      recentChanges.unshift(change);
      
      // Keep only last 50 changes
      if (recentChanges.length > 50) {
        recentChanges.splice(50);
      }
      
      // Pipeline writes for ENTITIES, RECENT_CHANGES, LAST_UPDATED
      const pipe1 = this.redis.pipeline();
      pipe1.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      pipe1.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      pipe1.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(new Date()));
      await pipe1.exec();
      
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
      
      // Update fallback data
      this.fallbackData.entities = entities;
      
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
        entityName: entity.name,
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
      pipe2.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      pipe2.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      pipe2.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(new Date()));
      await pipe2.exec();
      
      // Create standardized event envelope for filtering with race condition protection
      const changeEvent: EntityChangeEvent = {
        event: 'entity-updated',
        type: 'deleted',
        entityId: entity.id.toString(),
        entityName: entity.name,
        tenantName: entity.tenant_name || 'Unknown',
        teamName: entity.team_name || 'Unknown',
        ts: Date.now(),
        version: Date.now(), // Use timestamp as version for ordering
        updatedAt: entity.updatedAt?.toISOString() || new Date().toISOString(),
        data: change
      };

      // Broadcast change to all pods
      await this.redis.publish(CACHE_KEYS.CHANGES_CHANNEL, JSON.stringify(changeEvent));

      // Mirror deletion to in-memory storage so fallback refresh doesn't resurrect it
      try {
        await storage.deleteEntity(entity.id);
      } catch (mirrorErr) {
        console.warn('Storage mirror delete failed (non-fatal):', mirrorErr);
      }

      return true;
    } catch (error) {
      console.error('Error deleting entity in Redis:', error);
      return await storage.deleteEntity(entityId);
    }
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
      
      // Update fallback data
      this.fallbackData.entities = entities;
      
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
      pipe3.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      pipe3.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      pipe3.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(new Date()));
      await pipe3.exec();
      
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
  }): Promise<void> {
    const { keys = [], patterns = [], mainCacheKeys = [], refreshAffectedData = true } = invalidationConfig;

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
        await this.invalidateAndRefreshMainCache(mainCacheKeys, refreshAffectedData);
      }

    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
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
    refreshData: boolean = true
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
        await this.refreshAffectedMainCacheData(mainCacheKeys);
      }

    } catch (error) {
      console.error('Error in main cache invalidation:', error);
    }
  }

  private async refreshAffectedMainCacheData(affectedKeys: (keyof typeof CACHE_KEYS)[]): Promise<void> {
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
            this.fallbackData.entities = await storage.getEntities();
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
    const invalidationKeys = [
      'all_users',
      ...(teamName ? [`team_members_${teamName}`, `team_details_${teamName}`] : [])
    ];

    await this.invalidateCache({
      keys: invalidationKeys,
      patterns: teamName ? [] : ['team_members_*', 'team_details_*'],
      mainCacheKeys: ['TEAMS', 'METRICS'],
      refreshAffectedData: true
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
  }

  // Entity-type-specific cache invalidation (selective targeting)
  async invalidateEntityDataByType(
    teamId: number, 
    entityType: 'table' | 'dag',
    refreshSummaryCache: boolean = false
  ): Promise<void> {
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

  async invalidateUserData(): Promise<void> {
    await this.invalidateCache({
      keys: ['all_users'],
      patterns: ['team_members_*'],
      mainCacheKeys: ['TEAMS'],
      refreshAffectedData: true
    });
  }

  // New: Invalidate tenants comprehensively (dev + prod compatible)
  async invalidateTenants(): Promise<void> {
    console.log('[CACHE] Invalidating tenants cache...');
    
    // If Redis is available, clear main TENANTS cache and bump timestamp
    if (this.useRedis && this.redis) {
      try {
        await this.del(CACHE_KEYS.TENANTS);
        await this.set(CACHE_KEYS.LAST_UPDATED, new Date(), Math.floor(this.CACHE_DURATION_MS / 1000) + 300);
        console.log('[CACHE] Redis tenants cache cleared successfully');
      } catch (err) {
        console.log('[CACHE] Redis tenant invalidation failed, using fallback:', err);
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
    console.log('[CACHE] Using fallback tenant cache invalidation');
    await this.invalidateCache({
      keys: ['all_tenants'],
      patterns: ['tenants_*'],
      mainCacheKeys: ['TENANTS'],
      refreshAffectedData: true
    });
  }

  // Hybrid approach: Invalidate targeted cache + optional background rebuild
  async invalidateAndRebuildEntityCache(
    teamId: number,
    entityType: 'table' | 'dag',
    backgroundRebuild: boolean = true
  ): Promise<void> {
    // Step 1: Immediate targeted invalidation (fast response)
    await this.invalidateEntityDataByType(teamId, entityType, false);
    
    // Step 2: Optional background rebuild (non-blocking)
    if (backgroundRebuild) {
      // Run in background without awaiting
      this.rebuildEntityCacheByType(teamId, entityType);
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