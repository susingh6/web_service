import { Worker } from 'worker_threads';
import { parentPort, workerData } from 'worker_threads';
import { storage } from './storage';
import { Entity, Team } from '@shared/schema';

interface DashboardMetrics {
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
}

interface CacheRefreshData {
  entities: Entity[];
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  metrics: Record<string, DashboardMetrics>;
  last30DayMetrics: Record<string, DashboardMetrics>;
  lastUpdated: Date;
}

// Worker thread main function
async function refreshCacheData(): Promise<CacheRefreshData> {
  try {
    console.log('[Cache Worker] Starting cache refresh...');
    
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

    console.log(`[Cache Worker] Cache refresh completed: ${entities.length} entities, ${teams.length} teams, ${tenants.length} tenants`);
    return cacheData;
    
  } catch (error) {
    console.error('[Cache Worker] Failed to refresh cache:', error);
    throw error;
  }
}

function calculateMetrics(entities: Entity[], tables: Entity[], dags: Entity[]): DashboardMetrics {
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