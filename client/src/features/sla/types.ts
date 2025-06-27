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

// Entity Types
export interface Entity {
  id: number;
  name: string;
  type: 'table' | 'dag';
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  slaTarget: number;
  currentSla: number;
  team: string;
  teamId: number;
  lastUpdated: Date;
  description?: string;
  tags?: string[];
  dependencies?: number[];
  owner?: string;
  issues?: number;
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
  search?: string;
}