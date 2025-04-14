import { Entity } from '@shared/schema';

export interface Team {
  id: number;
  name: string;
  description: string;
  createdAt: Date;
}

// Status type for entities
export type EntityStatus = 'healthy' | 'warning' | 'critical';

// Dashboard metrics type
export interface DashboardMetrics {
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
}

// Date range for charts and data filtering
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// Team performance for comparisons
export interface TeamPerformance {
  teamId: number;
  teamName: string;
  compliance: number;
  trend: 'up' | 'down' | 'flat';
  entityCount: number;
}

// Extend the Entity type to explicitly include DAG-specific properties
export interface DagEntity extends Entity {
  // DAG specific properties that might be optional in Entity
  dag_name: string;
  dag_description: string | null;
  dag_schedule: string;
  expected_runtime_minutes: number;
  dag_dependency: string[];
  notification_preferences: string[];
  donemarker_location: string;
  donemarker_lookback: number;
  user_name: string;
  user_email: string;
  lastRun: Date | null;
  lastStatus: string;
}