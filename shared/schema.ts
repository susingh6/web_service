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
});

// Teams schema
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  status: text("status").notNull(), // 'healthy', 'warning', 'critical'
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
  is_active: boolean("is_active"),
  is_entity_owner: boolean("is_entity_owner").default(false),
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
  status: text("status").notNull(), // 'healthy', 'warning', 'critical'
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

// Zod schemas for data validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  displayName: true,
  team: true,
  role: true,
  azureObjectId: true,
});

export const insertTeamSchema = createInsertSchema(teams).pick({
  name: true,
  description: true,
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

// Subscriptions schema for entity notification subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityId: integer("entity_id").notNull(),
  notificationTypes: json("notification_types").$type<string[]>().notNull(), // ['PASSED', 'FAILED', 'PENDING', 'WARNING']
  channels: json("channels").$type<string[]>().notNull(), // ['email', 'slack', 'pagerduty']
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for use in the application
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// User roles for notification system
export interface UserRole {
  role: string;
  label: string;
  description: string;
}

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = z.infer<typeof insertEntitySchema>;

export type EntityHistory = typeof entityHistory.$inferSelect;
export type InsertEntityHistory = z.infer<typeof insertEntityHistorySchema>;

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = z.infer<typeof insertIssueSchema>;

export type NotificationTimeline = typeof notificationTimelines.$inferSelect;
export type InsertNotificationTimeline = z.infer<typeof insertNotificationTimelineSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
