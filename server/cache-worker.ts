import { Worker } from 'worker_threads';
import { parentPort, workerData } from 'worker_threads';
import { storage } from './storage';
import { Entity, Team } from '@shared/schema';
import { DashboardMetrics, CacheRefreshData, calculateMetrics } from '@shared/cache-types';

// Worker thread main function
async function refreshCacheData(): Promise<CacheRefreshData> {
  try {
    // [Cache Worker] Starting cache refresh
    
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

      last30DayMetrics[tenant.name] = calculateMetrics(tenantEntities, tenantTables, tenantDags);
    }

    const cacheData: CacheRefreshData = {
      entities,
      teams,
      tenants,
      metrics: {}, // Empty for dynamic calculations
      last30DayMetrics,
      lastUpdated: new Date()
    };

    // [Cache Worker] Cache refresh completed
    return cacheData;
    
  } catch (error) {
    console.error('[Cache Worker] Failed to refresh cache:', error);
    throw error;
  }
}

// calculateMetrics function now imported from shared/cache-types.ts

// Worker thread message handler
if (parentPort) {
  parentPort.on('message', async (message: { type: string }) => {
    if (message.type === 'refresh') {
      try {
        const cacheData = await refreshCacheData();
        parentPort!.postMessage({ type: 'success', data: cacheData });
      } catch (error) {
        parentPort!.postMessage({ 
          type: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
  });
}

// Export for type checking
export type { CacheRefreshData };