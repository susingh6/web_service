import Redis from 'ioredis';
import { WebSocketServer } from 'ws';
import { Worker } from 'worker_threads';
import { config } from './config';
import { Entity, Team } from '@shared/schema';
import { storage } from './storage';
import { DashboardMetrics, EntityChange, CachedData, calculateMetrics } from '@shared/cache-types';

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
        // Cache refresh notification received
        this.broadcastToClients('cache_refreshed', JSON.parse(message));
      } else if (channel === CACHE_KEYS.CHANGES_CHANNEL) {
        // Entity change notification received
        this.broadcastToClients('entity_changed', JSON.parse(message));
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

  setupWebSocket(wss: WebSocketServer): void {
    this.wss = wss;
    // WebSocket server attached to Redis cache
  }

  private broadcastToClients(event: string, data: any): void {
    if (!this.wss) return;

    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
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
              this.broadcastToClients('cache_refreshed', {
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
      const entities = await this.getEntitiesByTenant(tenantName);
      
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