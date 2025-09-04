import { Entity, Team } from './schema';

export interface DashboardMetrics {
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
}

export interface EntityChange {
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

export interface CachedData {
  entities: Entity[];
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  metrics: Record<string, DashboardMetrics>;
  last30DayMetrics: Record<string, DashboardMetrics>;
  lastUpdated: Date;
  recentChanges: EntityChange[];
}

export interface CacheRefreshData {
  entities: Entity[];
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  metrics: Record<string, DashboardMetrics>;
  last30DayMetrics: Record<string, DashboardMetrics>;
  lastUpdated: Date;
}

// Shared utility function for calculating metrics
export function calculateMetrics(entities: Entity[], tables: Entity[], dags: Entity[]): DashboardMetrics {
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