import { z } from 'zod';

// Entity Types
export const entityTypes = ['table', 'dag'] as const;
export type EntityType = typeof entityTypes[number];

// Notification Types
export const notificationTypes = ['email', 'slack', 'teams', 'sms'] as const;
export type NotificationType = typeof notificationTypes[number];

// Base Schema for common fields between Tables and DAGs
export const baseEntitySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  teamId: z.number().int().positive('Team is required'),
  tenant: z.string().min(1, 'Tenant is required'),
  owner: z.string().min(1, 'Owner is required'),
  ownerEmail: z.string().email('Invalid email format'),
  isActive: z.boolean().default(true),
  notificationPreferences: z.array(
    z.enum(notificationTypes)
  ).default([]),
  type: z.enum(entityTypes),
  tags: z.array(z.string()).optional().default([]),
});

// Table-specific schema
export const tableEntitySchema = baseEntitySchema.extend({
  type: z.literal('table'),
  schema: z.string().min(1, 'Schema is required'),
  table: z.string().min(1, 'Table name is required'),
  donemarkerLocation: z.string().min(1, 'Donemarker location is required'),
  donemarkerLookbackHours: z.number().int().positive('Lookback hours must be positive'),
  minRowCount: z.number().int().nonnegative('Minimum row count must be non-negative').optional(),
  refreshSchedule: z.string().optional(),
});

// DAG-specific schema
export const dagEntitySchema = baseEntitySchema.extend({
  type: z.literal('dag'),
  dagId: z.string().min(1, 'DAG ID is required'),
  schedule: z.string().min(1, 'Schedule is required'),
  expectedRuntime: z.number().positive('Expected runtime must be positive'),
  airflowInstance: z.string().min(1, 'Airflow instance is required'),
  maxRetries: z.number().int().nonnegative('Max retries must be non-negative').optional(),
});

// Combined schema with discriminated union
export const entitySchema = z.discriminatedUnion('type', [
  tableEntitySchema,
  dagEntitySchema,
]);

// Schema for entity creation/updates
export const createEntitySchema = entitySchema;
export const updateEntitySchema = entitySchema.partial();

// Type definitions
export type BaseEntity = z.infer<typeof baseEntitySchema>;
export type TableEntity = z.infer<typeof tableEntitySchema>;
export type DagEntity = z.infer<typeof dagEntitySchema>;
export type Entity = z.infer<typeof entitySchema>;
export type CreateEntityInput = z.infer<typeof createEntitySchema>;
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;