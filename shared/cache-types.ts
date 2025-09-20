import { Entity, Team } from './schema';

export interface DashboardMetrics {
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
}

export interface ComplianceTrendPoint {
  date: string;
  dateFormatted: string;
  overall: number;
  tables: number;
  dags: number;
}

export interface ComplianceTrendData {
  trend: ComplianceTrendPoint[];
  lastUpdated: Date;
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

// Predefined date range types
export type PredefinedRange = 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth';

export interface CachedData {
  // Legacy single entities array for backward compatibility (read-only, deprecated)
  entities: Entity[];
  // New type-segregated storage for proper cache isolation
  entitiesById: Map<number, Entity>;
  entitiesByTeamType: Map<string, number[]>; // Key: `${teamId}:${entityType}`
  entitiesByName: Map<string, number>; // Key: `${teamId}:${entityType}:${name}`
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  // Backward compatibility - map to last30DayMetrics
  metrics: Record<string, DashboardMetrics>;
  last30DayMetrics: Record<string, DashboardMetrics>;
  complianceTrends: Record<string, ComplianceTrendData>;
  // New fields for all predefined ranges
  todayMetrics: Record<string, DashboardMetrics>;
  yesterdayMetrics: Record<string, DashboardMetrics>;
  last7DayMetrics: Record<string, DashboardMetrics>;
  thisMonthMetrics: Record<string, DashboardMetrics>;
  // Compliance trends for all predefined ranges by tenant
  todayTrends: Record<string, ComplianceTrendData>;
  yesterdayTrends: Record<string, ComplianceTrendData>;
  last7DayTrends: Record<string, ComplianceTrendData>;
  last30DayTrends: Record<string, ComplianceTrendData>;
  thisMonthTrends: Record<string, ComplianceTrendData>;
  // Team-specific data
  teamMetrics: Record<string, Record<string, DashboardMetrics>>;
  teamTrends: Record<string, Record<string, ComplianceTrendData>>;
  lastUpdated: Date;
  recentChanges: EntityChange[];
}

export interface CacheRefreshData {
  entities: Entity[];
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  // Backward compatibility
  metrics: Record<string, DashboardMetrics>;
  last30DayMetrics: Record<string, DashboardMetrics>;
  complianceTrends: Record<string, ComplianceTrendData>;
  // New fields for all predefined ranges
  todayMetrics: Record<string, DashboardMetrics>;
  yesterdayMetrics: Record<string, DashboardMetrics>;
  last7DayMetrics: Record<string, DashboardMetrics>;
  thisMonthMetrics: Record<string, DashboardMetrics>;
  // Compliance trends for all predefined ranges by tenant
  todayTrends: Record<string, ComplianceTrendData>;
  yesterdayTrends: Record<string, ComplianceTrendData>;
  last7DayTrends: Record<string, ComplianceTrendData>;
  last30DayTrends: Record<string, ComplianceTrendData>;
  thisMonthTrends: Record<string, ComplianceTrendData>;
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