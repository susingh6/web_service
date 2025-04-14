// Re-export types from schema
export * from '@shared/schema';

// Entity types more specific to the frontend
export interface EntityWithDetails {
  id: number;
  name: string;
  description?: string;
  type: string;
  teamId: number;
  status: string;
  refreshFrequency?: string;
  lastRun?: string;
  owner?: string;
  ownerEmail?: string;
  currentSla?: number;
  history: EntityHistoryItem[];
  issues: EntityIssue[];
}

export interface EntityHistoryItem {
  id: number;
  entityId: number;
  timestamp: string;
  status: string;
  details?: string;
}

export interface EntityIssue {
  id: number;
  entityId: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface TeamWithStats {
  id: number;
  name: string;
  description?: string;
  entities: number;
  avgCompliance: number;
  criticalIssues: number;
}

export interface DashboardSummary {
  metrics: {
    overallCompliance: number;
    tablesCompliance: number;
    dagsCompliance: number;
    totalEntities: number;
    openIssues: number;
    criticalIssues: number;
  };
  recentHistory: EntityHistoryItem[];
  topIssues: EntityIssue[];
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
}

// Task related types for DAG details
export type TaskStatus = 'success' | 'failed' | 'running' | 'warning' | 'retry' | 'pending';
export type TaskPriority = 'normal' | 'high';

export interface Task {
  id: number;
  name: string;
  description?: string;
  dagId: number;
  status: TaskStatus;
  priority: TaskPriority;
  duration?: number;
  lastRun?: string;
  dependencies?: number[];
}