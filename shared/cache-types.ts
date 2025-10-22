import { Entity, Team, Permission } from './schema';

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

// Redis-first slim entity projection used in sla:entities
export interface SlimEntity {
  entity_type: 'table' | 'dag';
  tenant_id: number;
  tenant_name: string;
  team_id: number;
  team_name: string;
  entity_name: string;
  entity_display_name: string | null;
  entity_schedule: string | null;
  expected_runtime_minutes: number | null;
  is_entity_owner: boolean;
  is_active: boolean;
  owner_entity_ref_name: null | {
    entity_owner_name: string | null;
    entity_owner_tenant_id: number | null;
    entity_owner_tenant_name: string | null;
    entity_owner_team_id: number | null;
    entity_owner_team_name: string | null;
  };
}

// Redis-first compliance payload item used in sla:entitiescompliance
export interface EntitiesComplianceData {
  entity_type:
    | 'dag'
    | 'table'
    | 'team_dag_overall'
    | 'team_table_overall'
    | 'team_summary_overall'
    | 'team_overall'
    | 'summary_overall'
    | 'summary_dag_overall'
    | 'summary_table_overall';
  tenant_id: number;
  tenant_name: string;
  team_id: number; // 0 for summary
  team_name: string | null;
  entity_name: string | null;
  entity_display_name: string | null;
  is_entity_owner: boolean;
  is_active: boolean;
  range_key: string; // e.g., last_30_days, this_month
  sla_stats_pct: number | null;
  trend_pp: number | null;
  last_sla_status: 'passed' | 'failed' | 'unknown' | string | null;
  donemarkers_received: number | null;
  donemarkers_total: number | null;
  last_sla_compliance_pct: number | null;
  compliance_range_metrics: Array<Record<string, number | null>>;
  last_reported_at: string | null; // ISO timestamp
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

// DAG Task data structures for cache
export interface DagTask {
  task_name: string;
  task_type: string; // e.g., "SparkTask", "HiveTask"
}

export interface DagTaskData {
  dag_name: string;
  tasks: DagTask[];
}

export interface AllTasksData {
  dagTasks: DagTaskData[];
  lastUpdated: Date;
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
  permissions: Permission[];
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
  // DAG task data cached from FastAPI
  allTasksData: AllTasksData | null;
  lastUpdated: Date;
  recentChanges: EntityChange[];
}

export interface CacheRefreshData {
  entities: Entity[];
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  permissions: Permission[];
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
  // DAG task data for cache refresh
  allTasksData: AllTasksData | null;
  lastUpdated: Date;
  // New Redis-first caches
  entitiesSlim?: SlimEntity[];
  entitiesCompliance?: EntitiesComplianceData[];
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