export type NotificationTriggerType = 
  | 'daily_schedule'
  | 'sla_threshold_breached'
  | 'entity_success'
  | 'entity_failure'
  | 'ai_tasks_status'
  | 'regular_tasks_status';

export interface DailyScheduleTrigger {
  type: 'daily_schedule';
  time: string; // HH:MM format in UTC
}

export interface SlaThresholdBreachedTrigger {
  type: 'sla_threshold_breached';
  threshold?: number; // Optional SLA threshold percentage
}

export interface EntitySuccessTrigger {
  type: 'entity_success';
}

export interface EntityFailureTrigger {
  type: 'entity_failure';
}

export interface AiTasksStatusTrigger {
  type: 'ai_tasks_status';
  condition: 'all_passed' | 'all_failed';
  taskNames?: string[]; // Specific AI tasks to monitor, empty means all
  notificationBehavior?: 'notify_all' | 'notify_each'; // How to notify when tasks pass
}

export interface RegularTasksStatusTrigger {
  type: 'regular_tasks_status';
  condition: 'all_passed' | 'all_failed';
  taskNames?: string[]; // Specific regular tasks to monitor, empty means all
  notificationBehavior?: 'notify_all' | 'notify_each'; // How to notify when tasks pass
}

export type NotificationTrigger = 
  | DailyScheduleTrigger
  | SlaThresholdBreachedTrigger
  | EntitySuccessTrigger
  | EntityFailureTrigger
  | AiTasksStatusTrigger
  | RegularTasksStatusTrigger;

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
  daily_schedule: 'DAILY',
  sla_threshold_breached: 'SLA THRESHOLD BREACHED',
  entity_success: 'SLA MET',
  entity_failure: 'SLA FAILED',
  ai_tasks_status: 'AI TASKS STATUS CHANGE',
  regular_tasks_status: 'REGULAR TASKS STATUS CHANGE'
};

export const AI_TASK_CONDITIONS = [
  { value: 'all_passed', label: 'AI TASKS PASSED' },
  { value: 'all_failed', label: 'AI TASKS FAILED' }
] as const;