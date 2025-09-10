import { Worker } from 'worker_threads';
import { parentPort, workerData } from 'worker_threads';
import { storage } from './storage';
import { Entity, Team } from '@shared/schema';
import { DashboardMetrics, CacheRefreshData, calculateMetrics, ComplianceTrendData, ComplianceTrendPoint } from '@shared/cache-types';

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
    const complianceTrends: Record<string, ComplianceTrendData> = {};
    
    for (const tenant of tenants) {
      const allTenantEntities = entities.filter(e => e.tenant_name === tenant.name);
      // Only consider entity owners for metrics calculations
      const tenantEntities = allTenantEntities.filter(e => e.is_entity_owner === true);
      const tenantTables = tenantEntities.filter(e => e.type === 'table');
      const tenantDags = tenantEntities.filter(e => e.type === 'dag');

      last30DayMetrics[tenant.name] = calculateMetrics(tenantEntities, tenantTables, tenantDags);
      complianceTrends[tenant.name] = generateComplianceTrend(tenantEntities, tenantTables, tenantDags);
    }

    const cacheData: CacheRefreshData = {
      entities,
      teams,
      tenants,
      metrics: {}, // Empty for dynamic calculations
      last30DayMetrics,
      complianceTrends,
      lastUpdated: new Date()
    };

    // [Cache Worker] Cache refresh completed
    return cacheData;
    
  } catch (error) {
    console.error('[Cache Worker] Failed to refresh cache:', error);
    throw error;
  }
}

// Generate 30-day compliance trend data for a tenant
function generateComplianceTrend(entities: Entity[], tables: Entity[], dags: Entity[]): ComplianceTrendData {
  const trendData: ComplianceTrendPoint[] = [];
  const now = new Date();
  
  // Generate 30 days of compliance data
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // For new tenants with no entities, return all zeros
    if (entities.length === 0) {
      trendData.push({
        date: date.toISOString().split('T')[0],
        dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
        overall: 0,
        tables: 0,
        dags: 0
      });
      continue;
    }
    
    // Calculate compliance based on entity SLA status
    const tablesCompliance = tables.length > 0 
      ? (tables.filter(t => t.sla_status === 'compliant').length / tables.length) * 100
      : 0;
    
    const dagsCompliance = dags.length > 0
      ? (dags.filter(d => d.sla_status === 'compliant').length / dags.length) * 100
      : 0;
    
    const overallCompliance = entities.length > 0
      ? (entities.filter(e => e.sla_status === 'compliant').length / entities.length) * 100
      : 0;
    
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