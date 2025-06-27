// Task Status Types
export type TaskStatus = 
  | 'success'   // Task completed successfully
  | 'failed'    // Task failed to complete
  | 'running'   // Task is currently running
  | 'warning'   // Task completed with warnings
  | 'retry'     // Task is being retried after failure
  | 'pending';  // Task is scheduled but not yet running

// Task Priority Types  
export type TaskPriority = 
  | 'high'      // High priority tasks (critical path)
  | 'normal';   // Normal priority tasks

// Task Interface
export interface Task {
  id: number;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  duration?: number;         // Runtime in seconds
  dependencies?: number[];   // IDs of tasks that this task depends on
  description?: string;      // Optional description
  errorMessage?: string;     // Error message if status is 'failed'
  startTime?: Date;          // When the task started
  endTime?: Date;            // When the task completed
}

// SLA Alert Level Types
export type AlertLevel = 
  | 'critical' 
  | 'warning' 
  | 'info' 
  | 'none';

// Task Filter Options
export interface TaskFilterOptions {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  search?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// Date Range Interface for Dashboard
export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

// Dashboard Types
export interface DashboardMetrics {
  totalEntities: number;
  slaCompliance: number;
  criticalIssues: number;
  avgResponseTime: number;
  entitiesAtRisk: number;
  // Additional metrics from API response
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
  trendsData?: {
    date: string;
    compliance: number;
  }[];
}

export interface TeamPerformance {
  teamId: number;
  teamName: string;
  slaCompliance: number;
  totalEntities: number;
  criticalIssues: number;
  avgResponseTime: number;
}

// Entity Types - Aligned with shared schema
export interface Entity {
  id: number;
  name: string;
  type: string;
  description: string | null;
  status: string;
  teamId: number;
  slaTarget: number;
  currentSla: number | null;
  refreshFrequency: string;
  lastRefreshed: Date | null;
  nextRefresh: Date | null;
  owner: string | null;
  ownerEmail: string | null;
  tenant_name: string | null;
  team_name: string | null;
  dag_name: string | null;
  dag_description: string | null;
  dag_schedule: string | null;
  expected_runtime_minutes: number | null;
  dag_dependency: string[] | null;
  notification_preferences: string[] | null;
  donemarker_location: string | null;
  donemarker_lookback: number | null;
  user_name: string | null;
  user_email: string | null;
  is_active: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  // Additional legacy properties for compatibility
  team?: string;
  lastUpdated?: Date;
  tags?: string[];
  dependencies?: number[];
  issues?: number;
  lastRun: Date | null;
  lastStatus: string | null;
}

export interface CreateEntityPayload {
  name: string;
  type: 'table' | 'dag';
  slaTarget: number;
  team: string;
  teamId: number;
  description?: string;
  tags?: string[];
  owner?: string;
}

export interface UpdateEntityPayload extends Partial<CreateEntityPayload> {
  id: number;
  status?: 'healthy' | 'warning' | 'critical' | 'unknown';
  currentSla?: number;
  lastUpdated?: Date;
}

export interface EntityFilter {
  type?: 'table' | 'dag' | 'all';
  status?: 'healthy' | 'warning' | 'critical' | 'unknown' | 'all';
  team?: string;
  teamId?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// Team Types
export interface Team {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
}