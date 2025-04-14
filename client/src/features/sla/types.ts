import { Entity } from '@shared/schema';

export interface Team {
  id: number;
  name: string;
  description: string;
  createdAt: Date;
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