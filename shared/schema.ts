import { pgTable, text, serial, integer, boolean, timestamp, doublePrecision, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema for authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  displayName: text("display_name"),
  team: text("team"),
  role: text("role").default("user"), // admin, user
  azureObjectId: text("azure_object_id"), // Azure AD object ID
  user_slack: json("user_slack").$type<string[]>(), // Slack handles for notifications
  user_pagerduty: json("user_pagerduty").$type<string[]>(), // PagerDuty contacts for notifications
  is_active: boolean("is_active").default(true), // Active status for admin management
});

// Teams schema
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  tenant_id: integer("tenant_id").notNull(),
  name: text("name").notNull().unique(),
  description: text("description"),
  team_members_ids: json("team_members_ids").$type<string[]>(),
  team_email: json("team_email").$type<string[]>(),
  team_slack: json("team_slack").$type<string[]>(),
  team_pagerduty: json("team_pagerduty").$type<string[]>(),
  team_notify_preference_id: integer("team_notify_preference_id"),
  isActive: boolean("is_active").notNull().default(true), // Active status for admin management
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// SLA Entities schema (covers both Tables and DAGs)
export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'table' or 'dag'
  teamId: integer("team_id").notNull(),
  description: text("description"),
  slaTarget: doublePrecision("sla_target").notNull(), // percentage value
  currentSla: doublePrecision("current_sla"), // percentage value
  status: text("status").notNull(), // 'Passed', 'Pending', 'Failed'
  refreshFrequency: text("refresh_frequency").notNull(), // 'hourly', 'daily', 'weekly', 'monthly'
  lastRefreshed: timestamp("last_refreshed"),
  nextRefresh: timestamp("next_refresh"),
  owner: text("owner"),
  ownerEmail: text("owner_email"),
  
  // Additional fields for both Tables and DAGs
  tenant_name: text("tenant_name"),
  team_name: text("team_name"),
  
  // Table-specific fields
  schema_name: text("schema_name"),
  table_name: text("table_name"),
  table_description: text("table_description"),
  table_schedule: text("table_schedule"),
  table_dependency: json("table_dependency").$type<string[]>(), // Array of dependencies
  
  // DAG-specific fields
  dag_name: text("dag_name"),
  dag_description: text("dag_description"),
  dag_schedule: text("dag_schedule"),
  dag_dependency: json("dag_dependency").$type<string[]>(), // Array of dependencies
  server_name: text("server_name"), // Airflow server name for DAGs
  
  // Common fields
  expected_runtime_minutes: integer("expected_runtime_minutes"),
  notification_preferences: json("notification_preferences").$type<string[]>(), // Array of preferences
  donemarker_location: text("donemarker_location"),
  donemarker_lookback: integer("donemarker_lookback"),
  owner_email: text("owner_email"),
  user_email: text("user_email"),
  is_active: boolean("is_active").notNull().default(true), // Active status for admin management
  is_entity_owner: boolean("is_entity_owner").notNull().default(false), // Entity owner flag for frontend permissions
  lastRun: timestamp("last_run"),
  lastStatus: text("last_status"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Entity Performance History
export const entityHistory = pgTable("entity_history", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  date: timestamp("date").notNull(),
  slaValue: doublePrecision("sla_value").notNull(), // percentage value
  status: text("status").notNull(), // 'Passed', 'Pending', 'Failed'
});

// Issues and alerts related to entities
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  type: text("type").notNull(), // 'delay', 'quality', 'failure', etc.
  description: text("description").notNull(),
  severity: text("severity").notNull(), // 'low', 'medium', 'high', 'critical'
  date: timestamp("date").defaultNow().notNull(),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
});

// Notification Timelines for storing timeline configurations
export const notificationTimelines = pgTable("notification_timelines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityId: integer("entity_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  triggers: json("triggers").$type<any[]>().notNull(), // Array of NotificationTrigger objects
  channels: json("channels").$type<string[]>().notNull(), // Array of channel strings: ['email', 'slack', 'pagerduty']
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// SLA DAG Audit table for tracking changes to DAG entities
export const slaDagAudit = pgTable("sla_dag_audit", {
  id: serial("id").primaryKey(),
  entityName: text("entity_name").notNull(),
  tenantId: integer("tenant_id").notNull(),
  teamId: integer("team_id").notNull(),
  auditSequenceId: integer("audit_sequence_id").notNull(),
  auditUuidId: text("audit_uuid_id").notNull(),
  actionType: text("action_type").notNull(), // 'INSERT', 'UPDATE', 'DELETE', 'REVERT'
  rowBefore: json("row_before").$type<any>(),
  rowAfter: json("row_after").$type<any>(),
  changes: json("changes").$type<any>(),
  revertedFromAuditId: text("reverted_from_audit_id"),
  actionByUserId: integer("action_by_user_id").notNull(),
  actionTimestamp: timestamp("action_timestamp").defaultNow().notNull(),
});

// SLA Table Audit table for tracking changes to Table entities  
export const slaTableAudit = pgTable("sla_table_audit", {
  id: serial("id").primaryKey(),
  entityName: text("entity_name").notNull(),
  tenantId: integer("tenant_id").notNull(),
  teamId: integer("team_id").notNull(),
  auditSequenceId: integer("audit_sequence_id").notNull(),
  auditUuidId: text("audit_uuid_id").notNull(),
  actionType: text("action_type").notNull(), // 'INSERT', 'UPDATE', 'DELETE', 'REVERT'
  rowBefore: json("row_before").$type<any>(),
  rowAfter: json("row_after").$type<any>(),
  changes: json("changes").$type<any>(),
  revertedFromAuditId: text("reverted_from_audit_id"),
  actionByUserId: integer("action_by_user_id").notNull(),
  actionTimestamp: timestamp("action_timestamp").defaultNow().notNull(),
});

// Zod schemas for data validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  displayName: true,
  team: true,
  role: true,
  azureObjectId: true,
  user_slack: true,
  user_pagerduty: true,
  is_active: true,
});

// Admin user schema for admin panel (maps to frontend expectations)
export const adminUserSchema = z.object({
  user_name: z.string().min(1, "Username is required"),
  user_email: z.string().email("Valid email is required"),
  user_slack: z.array(z.string()).nullable().optional(),
  user_pagerduty: z.array(z.string()).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const insertTeamSchema = createInsertSchema(teams).pick({
  tenant_id: true,
  name: true,
  description: true,
  team_members_ids: true,
  team_email: true,
  team_slack: true,
  team_pagerduty: true,
  isActive: true,
});

// Team update schema for admin panel updates
export const updateTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").optional(),
  description: z.string().optional(),
  tenant_id: z.number().optional(),
  team_members_ids: z.array(z.string()).optional(),
  team_email: z.array(z.string()).optional(),
  team_slack: z.array(z.string()).optional(),  
  team_pagerduty: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update"
});

// Team member management schemas
export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.string().optional(),
  is_active: z.boolean().default(true),
});

export const teamDetailsUpdateSchema = z.object({
  team: z.string(),
  tenant: z.string(),
  username: z.string(),
  action: z.enum(['add', 'remove', 'update']),
  member: teamMemberSchema.optional(),
  memberId: z.string().optional(),
});

export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEntityHistorySchema = createInsertSchema(entityHistory).omit({
  id: true,
});

export const insertIssueSchema = createInsertSchema(issues).omit({
  id: true,
  resolvedAt: true,
});

export const insertNotificationTimelineSchema = createInsertSchema(notificationTimelines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Audit table insert schemas
export const insertSlaDagAuditSchema = createInsertSchema(slaDagAudit).omit({
  id: true,
  actionTimestamp: true,
}).extend({
  actionType: z.enum(['INSERT', 'UPDATE', 'DELETE', 'REVERT']),
});

export const insertSlaTableAuditSchema = createInsertSchema(slaTableAudit).omit({
  id: true,
  actionTimestamp: true,
}).extend({
  actionType: z.enum(['INSERT', 'UPDATE', 'DELETE', 'REVERT']),
});

// Types for use in the application
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Conflict notifications table for admin conflict resolution
export const conflictNotifications = pgTable("conflict_notifications", {
  id: serial("id").primaryKey(),
  notificationId: text("notification_id").notNull().unique(), // e.g., "NOT-001"
  entityType: text("entity_type").notNull(), // 'table' or 'dag'
  conflictingTeams: json("conflicting_teams").$type<string[]>().notNull(), // ["PGM", "CDM"]
  originalPayload: json("original_payload").$type<object>().notNull(), // The failed entity creation request
  conflictDetails: json("conflict_details").$type<object>(), // Details about the conflict
  status: text("status").notNull().default("pending"), // 'pending', 'resolved', 'rejected'
  resolutionType: text("resolution_type"), // 'approve_original', 'approve_new', 'shared_ownership', 'reject_both'
  resolutionNotes: text("resolution_notes"),
  resolvedBy: integer("resolved_by"), // admin user ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// AI Agent Incidents table for tracking job failure incidents
export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(), // notification_id from external system
  dagId: integer("dag_id").notNull().references(() => entities.id),
  dagName: text("dag_name").notNull(), // From external system
  taskName: text("task_name").notNull(), // Formatted as "dag_name + task_name"
  dateKey: text("date_key").notNull(), // Format: YYYY-MM-DD when incident occurred
  summary: text("summary").notNull(), // Error summary from external system
  logsUrl: text("logs_url"), // Link to Spark logs
  ragAnalysis: text("rag_analysis"), // AI analysis from external system
  status: text("status").notNull().default("open"), // 'open', 'resolved'
  userEmail: text("user_email"), // User who should receive notifications
  teamName: text("team_name").notNull(), // Team context for incident navigation
  tenantName: text("tenant_name").notNull(), // Tenant context for incident navigation
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// System Alerts table for system-wide alerts (6-hour cached)
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(), // Alert title
  message: text("message").notNull(), // Alert content  
  alert_type: text("alert_type").notNull(), // 'system', 'maintenance', 'warning', 'info'
  severity: text("severity").notNull(), // 'low', 'medium', 'high', 'critical'
  date_key: text("date_key").notNull(), // YYYY-MM-DD format for daily filtering
  is_active: boolean("is_active").notNull().default(true), // Whether alert should be shown
  created_at: timestamp("created_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at"), // When alert should stop showing
});

// Admin Broadcast Messages table for admin-created messages
export const adminBroadcastMessages = pgTable("admin_broadcast_messages", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(), // Admin message content
  date_key: text("date_key").notNull(), // YYYY-MM-DD format for expiration
  delivery_type: text("delivery_type").notNull(), // 'immediate' or 'login_triggered'
  is_active: boolean("is_active").notNull().default(true), // Whether message should be shown
  created_by_user_id: integer("created_by_user_id").notNull(), // Admin who created it
  created_at: timestamp("created_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at"), // When message should stop showing
});

// User roles for notification system
export interface UserRole {
  role: string;
  label: string;
  description: string;
}

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

// Conflict notifications types
export const insertConflictNotificationSchema = createInsertSchema(conflictNotifications).omit({
  id: true,
  createdAt: true,
});

export type ConflictNotification = typeof conflictNotifications.$inferSelect;
export type InsertConflictNotification = z.infer<typeof insertConflictNotificationSchema>;

// Incident schema and types
export const insertIncidentSchema = createInsertSchema(incidents).omit({
  createdAt: true,
  resolvedAt: true,
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = z.infer<typeof insertEntitySchema>;

export type EntityHistory = typeof entityHistory.$inferSelect;
export type InsertEntityHistory = z.infer<typeof insertEntityHistorySchema>;

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = z.infer<typeof insertIssueSchema>;

export type NotificationTimeline = typeof notificationTimelines.$inferSelect;
export type InsertNotificationTimeline = z.infer<typeof insertNotificationTimelineSchema>;

// Audit table types
export type SlaDagAudit = typeof slaDagAudit.$inferSelect;
export type InsertSlaDagAudit = z.infer<typeof insertSlaDagAuditSchema>;

export type SlaTableAudit = typeof slaTableAudit.$inferSelect;
export type InsertSlaTableAudit = z.infer<typeof insertSlaTableAuditSchema>;

// Alert and admin broadcast message insert schemas
export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  created_at: true,
});

export const insertAdminBroadcastMessageSchema = createInsertSchema(adminBroadcastMessages).omit({
  id: true,
  created_at: true,
});

// Alert and admin broadcast message types
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;

export type AdminBroadcastMessage = typeof adminBroadcastMessages.$inferSelect;
export type InsertAdminBroadcastMessage = z.infer<typeof insertAdminBroadcastMessageSchema>;
