import Redis from 'ioredis';
import { WebSocketServer } from 'ws';
import { Worker } from 'worker_threads';
import { config } from './config';
import { Entity, Team } from '@shared/schema';
import { DataCache } from './cache';

// Types
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
  last30DayMetrics: Record<string, DashboardMetrics>;
  lastUpdated: Date;
  recentChanges: EntityChange[];
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
  private cacheWorker: Worker | null = null;
  private isInitialized = false;
  private fallbackCache: DataCache | null = null;
  private useRedis = false;

  constructor() {
    this.initialize();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      console.log('Redis main client connected');
    });

    this.redis.on('error', (err) => {
      console.error('Redis main client error:', err);
    });

    this.subscriber.on('connect', () => {
      console.log('Redis subscriber connected');
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
        console.log('Cache refresh notification received');
        this.broadcastToClients('cache_refreshed', JSON.parse(message));
      } else if (channel === CACHE_KEYS.CHANGES_CHANNEL) {
        console.log('Entity change notification received');
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
      
      console.log('Redis connection successful');
      this.useRedis = true;
      
      // Check if cache exists, if not initialize it
      const cacheExists = await this.redis.exists(CACHE_KEYS.ENTITIES);
      
      if (!cacheExists) {
        console.log('Redis cache not found, initializing...');
        await this.refreshCacheWithWorker();
      } else {
        console.log('Redis cache found, validating...');
        await this.validateCache();
      }

      this.startAutoRefresh();
      this.isInitialized = true;
      console.log('Redis cache system initialized successfully');
      
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

  private initializeFallback(): void {
    console.log('Initializing fallback in-memory cache...');
    this.fallbackCache = new DataCache();
    this.useRedis = false;
    this.isInitialized = true;
    console.log('Fallback cache system initialized successfully');
  }

  private async validateCache(): Promise<void> {
    try {
      const lastUpdated = await this.redis.get(CACHE_KEYS.LAST_UPDATED);
      if (!lastUpdated) {
        console.log('Cache validation failed: no last updated timestamp');
        await this.refreshCacheWithWorker();
        return;
      }

      const lastUpdateTime = new Date(lastUpdated);
      const now = new Date();
      const timeDiff = now.getTime() - lastUpdateTime.getTime();

      if (timeDiff > this.CACHE_DURATION_MS) {
        console.log('Cache validation failed: cache is stale');
        await this.refreshCacheWithWorker();
      } else {
        console.log('Cache validation passed: cache is fresh');
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
      console.log('Auto-refresh triggered');
      await this.refreshCacheWithWorker();
    }, this.CACHE_DURATION_MS);

    console.log(`Auto-refresh scheduled every ${config.cache.refreshIntervalHours} hours`);
  }

  setupWebSocket(wss: WebSocketServer): void {
    this.wss = wss;
    if (this.fallbackCache) {
      this.fallbackCache.setupWebSocket(wss);
    }
    console.log('WebSocket server attached to Redis cache');
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
    // Implement distributed locking to prevent multiple pods from refreshing simultaneously
    const lockKey = CACHE_KEYS.CACHE_LOCK;
    const lockValue = `${process.pid}-${Date.now()}`;
    
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
        console.log('Cache refresh already in progress by another instance');
        return;
      }

      console.log('Cache refresh lock acquired, starting refresh...');
      
      // Use worker thread for heavy cache refresh work
      return new Promise((resolve, reject) => {
        if (this.cacheWorker) {
          this.cacheWorker.terminate();
        }

        this.cacheWorker = new Worker('./server/cache-worker.ts', {
          workerData: { redisUrl: process.env.REDIS_URL || 'redis://localhost:6379' }
        });

        this.cacheWorker.on('message', async (message: { type: string; data?: any; error?: string }) => {
          if (message.type === 'success' && message.data) {
            try {
              // Store all cache data in Redis
              await this.storeCacheData(message.data);
              
              // Broadcast refresh notification
              await this.redis.publish(CACHE_KEYS.REFRESH_CHANNEL, JSON.stringify({
                type: 'cache_refreshed',
                timestamp: new Date().toISOString(),
                podId: process.pid
              }));

              console.log('Cache refreshed successfully and broadcast to all pods');
              resolve();
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
          console.error('Cache worker error:', error);
          reject(error);
        });
      });
    } catch (error) {
      console.error('Cache refresh error:', error);
      throw error;
    } finally {
      // Release lock
      const currentLock = await this.redis.get(lockKey);
      if (currentLock === lockValue) {
        await this.redis.del(lockKey);
        console.log('Cache refresh lock released');
      }
    }
  }

  private async storeCacheData(data: any): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    // Store all cache data with expiration
    const expireTime = Math.floor(this.CACHE_DURATION_MS / 1000) + 300; // Add 5 minute buffer
    
    pipeline.setex(CACHE_KEYS.ENTITIES, expireTime, JSON.stringify(data.entities));
    pipeline.setex(CACHE_KEYS.TEAMS, expireTime, JSON.stringify(data.teams));
    pipeline.setex(CACHE_KEYS.TENANTS, expireTime, JSON.stringify(data.tenants));
    pipeline.setex(CACHE_KEYS.METRICS, expireTime, JSON.stringify(data.metrics));
    pipeline.setex(CACHE_KEYS.LAST_30_DAY_METRICS, expireTime, JSON.stringify(data.last30DayMetrics));
    pipeline.setex(CACHE_KEYS.RECENT_CHANGES, expireTime, JSON.stringify(data.recentChanges || []));
    pipeline.setex(CACHE_KEYS.LAST_UPDATED, expireTime, JSON.stringify(data.lastUpdated));
    
    await pipeline.exec();
    console.log('Cache data stored in Redis successfully');
  }

  // Public methods for accessing cached data
  async getAllEntities(): Promise<Entity[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackCache ? this.fallbackCache.getAllEntities() : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.ENTITIES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting entities from Redis:', error);
      return this.fallbackCache ? this.fallbackCache.getAllEntities() : [];
    }
  }

  async getAllTeams(): Promise<Team[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackCache ? this.fallbackCache.getAllTeams() : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.TEAMS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting teams from Redis:', error);
      return this.fallbackCache ? this.fallbackCache.getAllTeams() : [];
    }
  }

  async getAllTenants(): Promise<Array<{ id: number; name: string; description?: string }>> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackCache ? this.fallbackCache.getAllTenants() : [];
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.TENANTS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting tenants from Redis:', error);
      return this.fallbackCache ? this.fallbackCache.getAllTenants() : [];
    }
  }

  async getEntitiesByTenant(tenantName: string): Promise<Entity[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackCache ? this.fallbackCache.getEntitiesByTenant(tenantName) : [];
    }
    
    try {
      const entities = await this.getAllEntities();
      return entities.filter(entity => entity.tenant_name === tenantName);
    } catch (error) {
      console.error('Error filtering entities by tenant:', error);
      return this.fallbackCache ? this.fallbackCache.getEntitiesByTenant(tenantName) : [];
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
      return this.fallbackCache ? this.fallbackCache.getDashboardMetrics(tenantName) : null;
    }
    
    try {
      const data = await this.redis.get(CACHE_KEYS.METRICS);
      if (!data) return null;
      
      const metrics = JSON.parse(data);
      return metrics[tenantName] || null;
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      return this.fallbackCache ? this.fallbackCache.getDashboardMetrics(tenantName) : null;
    }
  }

  async calculateMetricsForDateRange(tenantName: string, startDate: Date, endDate: Date): Promise<DashboardMetrics | null> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackCache ? this.fallbackCache.calculateMetricsForDateRange(tenantName, startDate, endDate) : null;
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
      return this.fallbackCache ? this.fallbackCache.calculateMetricsForDateRange(tenantName, startDate, endDate) : null;
    }
  }

  // Incremental cache update for pollers
  async updateEntity(entityName: string, entityType: string, teamName: string, updates: Partial<Entity>): Promise<boolean> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackCache ? this.fallbackCache.updateEntity(entityName, entityType, teamName, updates) : false;
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
      
      console.log(`Entity ${entityName} updated successfully in Redis cache`);
      return true;
    } catch (error) {
      console.error('Error updating entity in Redis:', error);
      return false;
    }
  }

  async getRecentChanges(tenantName?: string, teamName?: string): Promise<EntityChange[]> {
    if (!this.useRedis || !this.redis) {
      return this.fallbackCache ? this.fallbackCache.getRecentChanges(tenantName, teamName) : [];
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
        fallbackCache: this.fallbackCache ? this.fallbackCache.getCacheStatus() : null,
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
    console.log('Force refresh requested');
    if (!this.useRedis || !this.redis) {
      if (this.fallbackCache) {
        return this.fallbackCache.forceRefresh();
      }
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
    
    console.log('Redis cache destroyed');
  }
}

// Export singleton instance
export const redisCache = new RedisCache();