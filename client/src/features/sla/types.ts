import { z } from "zod";

// Entity types
export const EntityTypeEnum = z.enum(['table', 'dag']);
export type EntityType = z.infer<typeof EntityTypeEnum>;

// Entity status types
export const EntityStatusEnum = z.enum([
  'healthy', 
  'warning', 
  'critical', 
  'running', 
  'success', 
  'failed',
  'passed',
  'unknown'
]);
export type EntityStatus = z.infer<typeof EntityStatusEnum>;

// Task priority types
export const TaskPriorityEnum = z.enum(['normal', 'high']);
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;

// Task status types
export const TaskStatusEnum = z.enum(['pending', 'running', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

// Entity model
export interface Entity {
  id: number;
  name: string;
  type: EntityType;
  status: EntityStatus;
  description: string | null;
  createdAt: Date;
  teamId: number;
  slaTarget: number;
  currentSla: number | null;
  refreshFrequency: string;
  tenant?: string;
  owner?: string;
  dataSource?: string;
  tags?: string;
  nextRefresh?: Date | null;
  lastRefreshed?: Date | null;
  avgLoadTime?: number;
  lastRun?: Date | null;
  lastRunDuration?: number;
  lastStatus?: string;
  failureCount?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  updatedAt: Date;
}

// Task model
export interface Task {
  id: number;
  entityId: number;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  duration?: number;
  startTime?: Date | null;
  endTime?: Date | null;
  dependsOn?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Team model
export interface Team {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
}

// Issue model
export interface Issue {
  id: number;
  entityId: number;
  type: string;
  severity: string;
  description: string;
  date: Date;
  resolved: boolean | null;
  resolvedAt: Date | null;
}

// EntityHistory model
export interface EntityHistory {
  id: number;
  entityId: number;
  date: Date;
  status: string;
  slaValue?: number;
  details?: string;
  type: string;
}

// Dashboard summary metrics
export interface DashboardSummary {
  metrics: {
    overallCompliance: number;
    tablesCount: number;
    dagsCount: number;
    issuesCount: number;
    criticalEntities: number;
  };
  recentIssues: Issue[];
  teamCompliance: { team: string; compliance: number }[];
}