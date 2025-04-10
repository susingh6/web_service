// Type definitions for the SLA monitoring application

export type EntityType = 'table' | 'dag';
export type EntityStatus = 'healthy' | 'warning' | 'critical';
export type RefreshFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueType = 'delay' | 'quality' | 'failure' | 'other';

// Basic entity interface
export interface Entity {
  id: number;
  name: string;
  type: EntityType;
  teamId: number;
  description?: string;
  slaTarget: number;
  currentSla?: number;
  status: EntityStatus;
  refreshFrequency: RefreshFrequency;
  lastRefreshed?: Date;
  nextRefresh?: Date;
  owner?: string;
  ownerEmail?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // DAG specific fields
  tenant_name?: string;
  team_name?: string;
  dag_name?: string;
  dag_description?: string;
  dag_donemarker_location?: string;
  dag_dependency?: any; // JSON type
  dag_schedule?: string;
  expected_runtime_minutes?: number;
  notify_preference_id?: any; // JSON type
  is_active?: boolean;
  donemarker_lookback?: number;
  user_name?: string;
  user_email?: string;
}

// Interface for creating a new entity
export interface CreateEntityPayload {
  name: string;
  type: EntityType;
  teamId: number;
  description?: string;
  slaTarget: number;
  status: EntityStatus;
  refreshFrequency: RefreshFrequency;
  owner?: string;
  ownerEmail?: string;
  
  // DAG specific fields
  tenant_name?: string;
  team_name?: string;
  dag_name?: string;
  dag_description?: string;
  dag_donemarker_location?: string;
  dag_dependency?: any; // JSON type
  dag_schedule?: string;
  expected_runtime_minutes?: number;
  notify_preference_id?: any; // JSON type
  is_active?: boolean;
  donemarker_lookback?: number;
  user_name?: string;
  user_email?: string;
}

// Interface for updating an entity
export interface UpdateEntityPayload {
  id: number;
  updates: Partial<Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>>;
}

// Team interface
export interface Team {
  id: number;
  name: string;
  description?: string;
  createdAt: Date;
}

// Entity history item
export interface EntityHistory {
  id: number;
  entityId: number;
  date: Date;
  slaValue: number;
  status: EntityStatus;
}

// Issue interface
export interface Issue {
  id: number;
  entityId: number;
  type: IssueType;
  description: string;
  severity: IssueSeverity;
  date: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

// Dashboard metrics
export interface DashboardMetrics {
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
}

// Chart data point
export interface DataPoint {
  date: string;
  value: number;
}

// Chart dataset
export interface ChartDataset {
  name: string;
  data: DataPoint[];
}

// Team performance data
export interface TeamPerformance {
  teamId: number;
  teamName: string;
  tablesCompliance: number;
  dagsCompliance: number;
}

// Dashboard summary response
export interface DashboardSummaryResponse {
  metrics: DashboardMetrics;
}

// Date range for filtering
export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

// User account from Azure AD
export interface UserAccount {
  name?: string;
  username: string;
  email?: string;
  id: string;
  teamId?: number;
}

// Filter options for entities
export interface EntityFilter {
  search?: string;
  status?: EntityStatus | 'all';
  teamId?: number;
  type?: EntityType;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}
