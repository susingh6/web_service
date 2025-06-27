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