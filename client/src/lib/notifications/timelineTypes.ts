export type NotificationTriggerType = 
  | 'daily_schedule'
  | 'sla_failed'
  | 'ai_task_failed'
  | 'entity_success'
  | 'ai_tasks_status';

export interface DailyScheduleTrigger {
  type: 'daily_schedule';
  time: string; // HH:MM format in UTC
}

export interface SlaFailedTrigger {
  type: 'sla_failed';
  threshold?: number; // Optional SLA threshold percentage
}

export interface AiTaskFailedTrigger {
  type: 'ai_task_failed';
  taskNames?: string[]; // Specific AI tasks to monitor, empty means all
}

export interface EntitySuccessTrigger {
  type: 'entity_success';
}

export interface AiTasksStatusTrigger {
  type: 'ai_tasks_status';
  condition: 'all_passed' | 'any_passed' | 'all_failed' | 'any_failed';
  taskNames?: string[]; // Specific AI tasks to monitor, empty means all
}

export type NotificationTrigger = 
  | DailyScheduleTrigger
  | SlaFailedTrigger
  | AiTaskFailedTrigger
  | EntitySuccessTrigger
  | AiTasksStatusTrigger;

export interface NotificationTimeline {
  id: string;
  entityId: number;
  name: string;
  description?: string;
  triggers: NotificationTrigger[];
  channels: string[]; // email, slack, pagerduty
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertNotificationTimeline {
  entityId: number;
  name: string;
  description?: string;
  triggers: NotificationTrigger[];
  channels: string[];
  isActive: boolean;
}

export const TRIGGER_TYPE_LABELS: Record<NotificationTriggerType, string> = {
  daily_schedule: 'Daily at Specific Time',
  sla_failed: 'SLA Status Failed',
  ai_task_failed: 'AI Task Failed',
  entity_success: 'Entity Completed Successfully',
  ai_tasks_status: 'AI Tasks Status Change'
};

export const AI_TASK_CONDITIONS = [
  { value: 'all_passed', label: 'All AI Tasks Passed' },
  { value: 'any_passed', label: 'Any AI Task Passed' },
  { value: 'all_failed', label: 'All AI Tasks Failed' },
  { value: 'any_failed', label: 'Any AI Task Failed' }
] as const;