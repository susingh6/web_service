import Redis from 'ioredis';
import { WebSocketServer } from 'ws';
import { Worker } from 'worker_threads';
import { config } from './config';
import { Entity, Team } from '@shared/schema';
import { storage } from './storage';
import { DashboardMetrics, EntityChange, CachedData, calculateMetrics } from '@shared/cache-types';

// Standardized event envelope for real-time updates with race condition protection
interface EntityChangeEvent {
  event: 'entity-updated';
  type: 'created' | 'updated' | 'deleted';
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
  LAST_UPDATED: 'sla:lastUpdated',
  RECENT_CHANGES: 'sla:recentChanges',
  CACHE_LOCK: 'sla:cache_lock',
  REFRESH_CHANNEL: 'sla:refresh',
  CHANGES_CHANNEL: 'sla:changes'
};

export class RedisCache {
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private refreshInterval: NodeJS.Timer | null = null;
  private readonly CACHE_DURATION_MS = config.cache.refreshIntervalHours * 60 * 60 * 1000;
  private readonly LOCK_TIMEOUT = 300000; // 5 minutes lock timeout
  private wss: WebSocketServer | null = null;
  private authenticatedSockets: Map<any, SocketData> = new Map();
  private pendingNotifications: Array<{event: string, data: any, timestamp: Date}> = [];
  private cacheWorker: Worker | null = null;
  private isInitialized = false;
  private fallbackData: CachedData | null = null;
  private useRedis = false;

  constructor() {
    this.initialize();
  }

  private setupEventHandlers(): void {
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
        this.broadcastToClients('entity-updated', changeEvent);
      }
    });
  }

  private async initialize(): Promise<void> {
    try {
      await this.tryRedisConnection();
    } catch (error) {
      console.warn('Redis connection failed, falling back to in-memory cache:', error.message);
      this.initializeFallback();
    }
  }

  private async tryRedisConnection(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      // Test Redis connection with timeout
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        keyPrefix: '',
        db: 0,
        connectTimeout: 5000
      });

      this.subscriber = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        keyPrefix: '',
        db: 0,
        connectTimeout: 5000
      });

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
      
    } catch (error) {
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

  private async validateCache(): Promise<void> {
    try {
      const lastUpdated = await this.redis.get(CACHE_KEYS.LAST_UPDATED);
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
    } catch (error) {
      console.error('Cache validation error:', error);
      await this.refreshCacheWithWorker();
    }
  }

  private startAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
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
    
    this.wss.clients.forEach((client) => {
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
    
    this.wss.clients.forEach((client) => {
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
  private sendWithBackpressureProtection(client: WebSocket, message: string, eventKey: string): void {
    const MAX_BUFFER_SIZE = 64 * 1024; // 64KB threshold
    const MAX_QUEUE_SIZE = 100;
    
    // Check if the client's send buffer is too full
    if ((client as any).bufferedAmount > MAX_BUFFER_SIZE) {
      // Initialize per-client event queue if not exists
      if (!(client as any)._eventQueue) {
        (client as any)._eventQueue = new Map<string, string>();
      }
      
      const eventQueue = (client as any)._eventQueue;
      
      // Coalesce events by key (keep only latest for each event type)
      eventQueue.set(eventKey, message);
      
      // Limit queue size to prevent memory leaks
      if (eventQueue.size > MAX_QUEUE_SIZE) {
        // Remove oldest entries
        const entries = Array.from(eventQueue.entries());
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
  private scheduleQueueFlush(client: WebSocket): void {
    if ((client as any)._flushScheduled) return;
    
    (client as any)._flushScheduled = true;
    
    // Use setImmediate for next tick scheduling to avoid blocking
    setImmediate(() => {
      (client as any)._flushScheduled = false;
      this.flushEventQueue(client);
    });
  }

  // Flush queued events when buffer clears
  private flushEventQueue(client: WebSocket): void {
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
    const events = Array.from(eventQueue.values());
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
              await this.redis.publish(CACHE_KEYS.REFRESH_CHANNEL, JSON.stringify({
                type: 'cache_refreshed',
                timestamp: new Date().toISOString(),
                podId: process.env.POD_NAME || 'unknown'
              }));

              // Broadcast to WebSocket clients
              this.broadcastToClients('cache-updated', {
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
    // Reuse the same logic as refreshFallbackData but return structured data
    const entities = await storage.getEntities();
    const teams = await storage.getTeams();
    const tenants = await storage.getTenants();
    
    // Calculate metrics for each tenant
    const metrics: Record<string, DashboardMetrics> = {};
    const last30DayMetrics: Record<string, DashboardMetrics> = {};
    
    for (const tenant of tenants) {
      const tenantEntities = entities.filter(e => e.tenant_name === tenant.name);
      const tenantTables = tenantEntities.filter(e => e.type === 'table');
      const tenantDags = tenantEntities.filter(e => e.type === 'dag');
      
      const tenantMetrics = this.calculateMetrics(tenantEntities, tenantTables, tenantDags);
      metrics[tenant.name] = tenantMetrics;
      last30DayMetrics[tenant.name] = tenantMetrics;
    }
    
    return {
      entities,
      teams,
      tenants,
      metrics,
      last30DayMetrics,
      lastUpdated: new Date(),
      recentChanges: []
    };
  }

  // Public methods for accessing cached data
  async getAllEntities(): Promise<Entity[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackData ? this.fallbackData.entities : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.ENTITIES);
      return data ? JSON.parse(data) : [];
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
      return teams.filter(team => team.tenant === tenantName);
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

  async calculateMetricsForDateRange(tenantName: string, startDate: Date, endDate: Date): Promise<DashboardMetrics | null> {
    if (!this.useRedis || !this.redis) {
      // For fallback, use the same metrics as we don't have date range calculation
      return this.fallbackData ? this.fallbackData.metrics[tenantName] || null : null;
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
      
      entities.push(entity);
      
      // Update fallback data
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
      
      // Add entity to Redis
      entities.push(entity);
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      await this.redis.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      
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
      
      await this.redis.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      
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
      
      // Direct WebSocket broadcast in fallback mode
      const change = {
        entityId: entityToDelete.id,
        entityName: entityToDelete.name,
        entityType: entityToDelete.type,
        teamName: entityToDelete.team_name || 'Unknown',
        tenantName: entityToDelete.tenant_name || 'Unknown',
        type: 'deleted',
        entity: entityToDelete,
        timestamp: new Date()
      };
      
      this.broadcastToClients('entity-updated', change);
      
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
      
      // Update entities in Redis
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      await this.redis.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      
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
      
      await this.redis.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      
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
      const updatedEntity = {
        ...entity,
        ...updates,
        updatedAt: new Date(),
        lastRefreshed: updates.lastRefreshed || entity.lastRefreshed
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
          newSla: updates.currentSla,
          timestamp: new Date()
        }
      };
      
      this.broadcastToClients('entity-updated', changeEvent);
      
      return updatedEntity;
    }
    
    try {
      const entities = await this.getAllEntities();
      const entityIndex = entities.findIndex(e => e.id === entityId);
      
      if (entityIndex === -1) {
        return undefined; // Entity not found
      }
      
      const entity = entities[entityIndex];
      const previousSla = entity.currentSla;
      
      // Apply updates
      const updatedEntity = {
        ...entity,
        ...updates,
        updatedAt: new Date(),
        lastRefreshed: updates.lastRefreshed || entity.lastRefreshed
      };
      
      entities[entityIndex] = updatedEntity;
      
      // Update entities in Redis
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      await this.redis.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      
      // Record the change
      const change: EntityChange = {
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.type,
        teamName: entity.team_name || 'Unknown',
        tenantName: entity.tenant_name || 'Unknown',
        type: 'updated',
        entity: updatedEntity,
        previousSla,
        newSla: updates.currentSla,
        timestamp: new Date()
      };
      
      // Add to recent changes
      const recentChanges = await this.getRecentChanges();
      recentChanges.unshift(change);
      
      // Keep only last 50 changes
      if (recentChanges.length > 50) {
        recentChanges.splice(50);
      }
      
      await this.redis.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      
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
      const previousSla = entity.currentSla;
      
      // Apply updates
      entities[entityIndex] = {
        ...entity,
        ...updates,
        lastRefreshed: new Date().toISOString()
      };
      
      // Update entities in Redis
      const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300;
      await this.redis.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(entities));
      
      // Record the change
      const change: EntityChange = {
        entityId: entity.id,
        entityName,
        entityType,
        teamName,
        tenantName: entity.tenant_name || 'Unknown',
        type: 'updated',
        entity: entities[entityIndex],
        previousSla,
        newSla: updates.currentSla,
        timestamp: new Date()
      };
      
      // Add to recent changes
      const recentChanges = await this.getRecentChanges();
      recentChanges.unshift(change);
      
      // Keep only last 50 changes
      if (recentChanges.length > 50) {
        recentChanges.splice(50);
      }
      
      await this.redis.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(recentChanges));
      
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
    } catch (error) {
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
    if (!this.useRedis || !this.redis) {
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
    const mainCacheKeys = refreshSummaryCache 
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