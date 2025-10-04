import {
  users, type User, type InsertUser, type UserRole,
  teams, type Team, type InsertTeam,
  entities, type Entity, type InsertEntity,
  entityHistory, type EntityHistory, type InsertEntityHistory,
  issues, type Issue, type InsertIssue,
  notificationTimelines, type NotificationTimeline, type InsertNotificationTimeline,
  entitySubscriptions, type EntitySubscription, type InsertEntitySubscription,
  slaDagAudit, type SlaDagAudit, type InsertSlaDagAudit,
  slaTableAudit, type SlaTableAudit, type InsertSlaTableAudit,
  incidents, type Incident, type InsertIncident,
  alerts, type Alert, type InsertAlert,
  adminBroadcastMessages, type AdminBroadcastMessage, type InsertAdminBroadcastMessage,
  roles, type Role, type InsertRole, type UpdateRole,
  permissions, type Permission, type InsertPermission, type UpdatePermission
} from "@shared/schema";
import { resolveEntityIdentifier } from '@shared/entity-utils';

// Tenant interface for tenant management
export interface Tenant {
  id: number;
  name: string;
  description?: string;
  // Additional metadata used in admin UI
  isActive: boolean;
  teamsCount: number;
  createdAt: string;
  updatedAt: string;
}

// Define the storage interface
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  getUserRoles(): Promise<UserRole[]>;
  
  // Role operations
  getRoles(): Promise<Role[]>;
  getRole(roleName: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(roleName: string, role: Partial<Role>): Promise<Role | undefined>;
  deleteRole(roleName: string): Promise<boolean>;
  
  // Permission operations
  getPermissions(): Promise<Permission[]>;
  getPermission(permissionName: string): Promise<Permission | undefined>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  updatePermission(permissionName: string, permission: Partial<Permission>): Promise<Permission | undefined>;
  deletePermission(permissionName: string): Promise<boolean>;
  
  // Team operations
  getTeams(): Promise<Team[]>;
  getTeam(id: number): Promise<Team | undefined>;
  getTeamByName(name: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: number, team: Partial<Team>): Promise<Team | undefined>;
  updateTeamMembers(teamName: string, memberData: any, oauthContext: any): Promise<Team | undefined>;
  
  // Tenant operations
  getTenants(): Promise<Tenant[]>;
  createTenant(tenant: { name: string; description?: string }): Promise<Tenant>;
  updateTenant(id: number, tenant: Partial<Tenant>): Promise<Tenant | undefined>;
  
  // Entity operations
  getEntities(): Promise<Entity[]>;
  getEntity(id: number): Promise<Entity | undefined>;
  getEntitiesByTeam(teamId: number): Promise<Entity[]>;
  getEntitiesByType(type: string): Promise<Entity[]>;
  getEntitiesByDateRange(startDate: Date, endDate: Date, teamId?: number, tenant?: string): Promise<Entity[]>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  updateEntity(id: number, entity: Partial<Entity>): Promise<Entity | undefined>;
  deleteEntity(id: number): Promise<boolean>;
  deleteEntityByName(params: { name: string; type?: Entity['type']; teamName?: string }): Promise<boolean>;
  
  // Entity History operations
  getEntityHistory(entityId: number): Promise<EntityHistory[]>;
  addEntityHistory(history: InsertEntityHistory): Promise<EntityHistory>;
  
  // Issue operations
  getIssues(entityId: number): Promise<Issue[]>;
  addIssue(issue: InsertIssue): Promise<Issue>;
  resolveIssue(id: number): Promise<Issue | undefined>;
  
  // Notification Timeline operations
  getNotificationTimelines(entityId: number): Promise<NotificationTimeline[]>;
  createNotificationTimeline(timeline: InsertNotificationTimeline): Promise<NotificationTimeline>;
  updateNotificationTimeline(id: string, timeline: Partial<NotificationTimeline>): Promise<NotificationTimeline | undefined>;
  deleteNotificationTimeline(id: string): Promise<boolean>;
  
  // Audit operations for rollback management
  getDeletedEntitiesByName(entityName: string): Promise<Array<{ id: string; entity_name: string; entity_type: 'dag' | 'table'; tenant_name: string; team_name: string; deleted_date: string; deleted_by: string; entity_id: string; tenant_id: string; team_id: string; schema_name?: string; table_name?: string; table_schedule?: string; dag_name?: string; dag_schedule?: string }>>;
  getDeletedEntitiesByTeamTenant(tenantId: number, teamId: number): Promise<Array<{ id: string; entity_name: string; entity_type: 'dag' | 'table'; tenant_name: string; team_name: string; deleted_date: string; deleted_by: string; entity_id: string; tenant_id: string; team_id: string; schema_name?: string; table_name?: string; table_schedule?: string; dag_name?: string; dag_schedule?: string }>>;
  performEntityRollback(auditId: string, entityType: 'dag' | 'table'): Promise<Entity | null>;
  
  // Incident operations for AI agent integration
  createIncident(incident: InsertIncident): Promise<Incident>;
  getIncident(notificationId: string): Promise<Incident | undefined>;
  getEntityByName(params: { name: string; type?: Entity['type']; teamName?: string }): Promise<Entity | undefined>;
  resolveIncident(notificationId: string): Promise<Incident | undefined>;
  
  // Alert operations for system-wide alerts
  getAlerts(dateKey?: string): Promise<Alert[]>;
  getActiveAlerts(dateKey?: string): Promise<Alert[]>; // Make dateKey optional for system-wide alerts
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlert(id: number, alert: Partial<Alert>): Promise<Alert | undefined>;
  deleteAlert(id: number): Promise<boolean>;
  deactivateAlert(id: number): Promise<boolean>; // Add deactivate method
  
  // Admin broadcast message operations
  getAdminBroadcastMessages(dateKey?: string): Promise<AdminBroadcastMessage[]>;
  getActiveAdminBroadcastMessages(dateKey?: string): Promise<AdminBroadcastMessage[]>; // Make dateKey optional
  getAdminBroadcastMessagesForUser(userId: number): Promise<AdminBroadcastMessage[]>; // Add user-specific method
  createAdminBroadcastMessage(message: InsertAdminBroadcastMessage): Promise<AdminBroadcastMessage>;
  updateAdminBroadcastMessage(id: number, message: Partial<AdminBroadcastMessage>): Promise<AdminBroadcastMessage | undefined>;
  deleteAdminBroadcastMessage(id: number): Promise<boolean>;
  deactivateAdminBroadcastMessage(id: number): Promise<boolean>; // Add deactivate method
  
  // Entity subscription operations
  subscribeToNotificationTimeline(subscription: InsertEntitySubscription): Promise<EntitySubscription>;
  unsubscribeFromNotificationTimeline(userId: number, notificationTimelineId: string): Promise<boolean>;
  getUserSubscriptions(userId: number): Promise<EntitySubscription[]>;
  getTimelineSubscriptions(notificationTimelineId: string): Promise<EntitySubscription[]>;
  getSubscriptionCount(notificationTimelineId: string): Promise<number>;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private teams: Map<number, Team>;
  private tenants: Map<number, Tenant>;
  private entities: Map<number, Entity>;
  private entityHistories: Map<number, EntityHistory[]>;
  private entityIssues: Map<number, Issue[]>;
  private notificationTimelines: Map<string, NotificationTimeline>;
  private dagAudit: Map<number, SlaDagAudit>;
  private tableAudit: Map<number, SlaTableAudit>;
  private incidents: Map<string, Incident>; // keyed by notification_id
  private alertsData: Map<number, Alert>; // System alerts
  private adminBroadcastMessagesData: Map<number, AdminBroadcastMessage>; // Admin broadcast messages
  private rolesData: Map<string, Role>; // keyed by role_name
  private rolesVersion: number; // Version counter for cache invalidation
  private permissionsData: Map<string, Permission>; // keyed by permission_name
  private permissionsVersion: number; // Version counter for cache invalidation
  private entitySubscriptionsData: Map<number, EntitySubscription>; // Entity subscriptions
  
  private userId: number;
  private teamId: number;
  private tenantId: number;
  private entityId: number;
  private historyId: number;
  private issueId: number;
  private dagAuditId: number;
  private tableAuditId: number;
  private alertId: number;
  private adminBroadcastMessageId: number;
  private subscriptionId: number;
  
  private initializationPromise: Promise<void>;

  constructor() {
    this.users = new Map();
    this.teams = new Map();
    this.tenants = new Map();
    this.entities = new Map();
    this.entityHistories = new Map();
    this.entityIssues = new Map();
    this.notificationTimelines = new Map();
    this.dagAudit = new Map();
    this.tableAudit = new Map();
    this.incidents = new Map();
    this.alertsData = new Map();
    this.adminBroadcastMessagesData = new Map();
    this.rolesData = new Map();
    this.rolesVersion = 1;
    this.permissionsData = new Map();
    this.permissionsVersion = 1;
    this.entitySubscriptionsData = new Map();
    
    this.userId = 1;
    this.teamId = 1;
    this.tenantId = 1;
    this.entityId = 1;
    this.historyId = 1;
    this.issueId = 1;
    this.dagAuditId = 1;
    this.tableAuditId = 1;
    this.alertId = 1;
    this.adminBroadcastMessageId = 1;
    this.subscriptionId = 1;
    
    // Initialize with some demo data
    this.initializationPromise = this.initDemoData().catch(err => {
      console.error('Error initializing demo data:', err);
    });
  }

  // Ensure initialization is complete before any operations
  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }
  
  private async initDemoData() {
    // Create a test user for Azure AD login simulation
    // In a real environment, this would be handled by Azure AD
    this.createUser({
      username: "azure_test_user",
      // Pre-hashed password for "Azure123!" - this is the correct format for the auth.ts comparePassword function
      password: "fd8c4a1ca56057251afbd0fd4b308a15113651c3e557c44eb58b8284e6d7fd4c1212a99dc7784c5cbb5072a2c138185c806394074e6c5f599209185e9576ea2e.e33fe34bf418a28b",
      email: "azure_test_user@example.com", // Fixed: Match OAuth email
      displayName: "Azure Test User",
      team: "Core",
      role: "admin", // Set admin role for test user
      azureObjectId: "test-azure-object-id",
      user_slack: ["@azure.tester", "@testuser"], // Test Slack handles
      user_pagerduty: ["azure_test@pagerduty.com"] // Test PagerDuty email
    });

    // Create mock users for all team members
    const mockUsers = [
      // PGM Team Members
      {
        username: "john.smith",
        password: "dummy-hash",
        email: "john.smith@company.com",
        displayName: "John Smith",
        team: "PGM",
        role: "developer",
        azureObjectId: null
      },
      {
        username: "sarah.johnson",
        password: "dummy-hash",
        email: "sarah.johnson@company.com",
        displayName: "Sarah Johnson",
        team: "PGM",
        role: "manager",
        azureObjectId: null
      },
      // Core Team Members
      {
        username: "david.wilson",
        password: "dummy-hash",
        email: "david.wilson@company.com",
        displayName: "David Wilson",
        team: "Core",
        role: "lead",
        azureObjectId: null
      },
      {
        username: "michael.brown",
        password: "dummy-hash",
        email: "michael.brown@company.com",
        displayName: "Michael Brown",
        team: "Core",
        role: "developer",
        azureObjectId: null,
        is_active: false // Inactive user for testing
      },
      // Viewer Product Team Members
      {
        username: "emily.davis",
        password: "dummy-hash",
        email: "emily.davis@company.com",
        displayName: "Emily Davis",
        team: "Viewer Product",
        role: "analyst",
        azureObjectId: null
      },
      // IOT Team Members
      {
        username: "alex.chen",
        password: "dummy-hash",
        email: "alex.chen@company.com",
        displayName: "Alex Chen",
        team: "IOT",
        role: "developer",
        azureObjectId: null
      },
      {
        username: "maria.garcia",
        password: "dummy-hash",
        email: "maria.garcia@company.com",
        displayName: "Maria Garcia",
        team: "IOT",
        role: "ops",
        azureObjectId: null,
        is_active: false // Inactive user for testing
      },
      // CDM Team Members
      {
        username: "robert.taylor",
        password: "dummy-hash",
        email: "robert.taylor@company.com",
        displayName: "Robert Taylor",
        team: "CDM",
        role: "developer",
        azureObjectId: null
      },
      {
        username: "lisa.anderson",
        password: "dummy-hash",
        email: "lisa.anderson@company.com",
        displayName: "Lisa Anderson",
        team: "CDM",
        role: "manager",
        azureObjectId: null
      },
      // Ad Serving Team Members
      {
        username: "carlos.martinez",
        password: "dummy-hash",
        email: "carlos.martinez@company.com",
        displayName: "Carlos Martinez",
        team: "Ad Serving",
        role: "lead",
        azureObjectId: null
      },
      // Additional users for dropdown functionality
      {
        username: "jennifer.wilson",
        password: "dummy-hash",
        email: "jennifer.wilson@company.com",
        displayName: "Jennifer Wilson",
        team: null,
        role: "developer",
        azureObjectId: null
      },
      {
        username: "kevin.moore",
        password: "dummy-hash",
        email: "kevin.moore@company.com",
        displayName: "Kevin Moore",
        team: null,
        role: "analyst",
        azureObjectId: null,
        is_active: false // Inactive user for testing
      },
      {
        username: "rachel.kim",
        password: "dummy-hash",
        email: "rachel.kim@company.com",
        displayName: "Rachel Kim",
        team: null,
        role: "manager",
        azureObjectId: null
      }
    ];

    // Create all mock users
    for (const userData of mockUsers) {
      await this.createUser(userData);
    }

    
    // Create demo tenants first (teams reference tenant_id)
    const tenantData = [
      {
        name: 'Data Engineering',
        description: 'Data Engineering team and related entities'
      },
      {
        name: 'Ad Engineering', 
        description: 'Ad Engineering team and related entities'
      }
    ];

    tenantData.forEach(tenantInfo => {
      const tenant = {
        id: this.tenantId++,
        ...tenantInfo,
        isActive: true,        // Default to active status
        teamsCount: 0,         // Will be calculated after teams are created
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.tenants.set(tenant.id, tenant);
    });
    
    // Create demo teams with the new team names and member data
    const teamData = [
      { 
        name: 'PGM', 
        description: 'Partner Growth & Management',
        tenant_id: 1,
        team_members_ids: ['john.smith', 'sarah.johnson'] as string[],
        team_email: ['pgm-team@company.com'] as string[],
        team_slack: ['#pgm-team'] as string[],
        team_pagerduty: ['pgm-escalation'] as string[],
        isActive: true
      },
      { 
        name: 'Core', 
        description: 'Core Infrastructure Team',
        tenant_id: 1,
        team_members_ids: ['david.wilson', 'michael.brown'] as string[],
        team_email: ['core-team@company.com'] as string[],
        team_slack: ['#core-infrastructure'] as string[],
        team_pagerduty: ['core-escalation'] as string[],
        isActive: true
      },
      { 
        name: 'Viewer Product', 
        description: 'Viewer Product Team',
        tenant_id: 1,  // Move to Data Engineering
        team_members_ids: ['emily.davis'] as string[],
        team_email: ['viewer-product@company.com'] as string[],
        team_slack: ['#viewer-product'] as string[],
        team_pagerduty: ['viewer-escalation'] as string[],
        isActive: true
      },
      { 
        name: 'IOT', 
        description: 'Internet of Things Team',
        tenant_id: 1,
        team_members_ids: ['alex.chen', 'maria.garcia'] as string[],
        team_email: ['iot-team@company.com'] as string[],
        team_slack: ['#iot-team'] as string[],
        team_pagerduty: ['iot-escalation'] as string[],
        isActive: true
      },
      { 
        name: 'CDM', 
        description: 'Content Delivery & Management Team',
        tenant_id: 1,
        team_members_ids: ['robert.taylor', 'lisa.anderson'] as string[],
        team_email: ['cdm-team@company.com'] as string[],
        team_slack: ['#cdm-team'] as string[],
        team_pagerduty: ['cdm-escalation'] as string[],
        isActive: true
      },
      { 
        name: 'Ad Serving', 
        description: 'Advertisement Serving Team',
        tenant_id: 2,
        team_members_ids: ['carlos.martinez'] as string[],
        team_email: ['ad-serving@company.com'] as string[],
        team_slack: ['#ad-serving'] as string[],
        team_pagerduty: ['ad-serving-escalation'] as string[],
        isActive: true
      },
      { 
        name: 'Ad Data Activation', 
        description: 'Ad Data Activation Team',
        tenant_id: 2,
        team_members_ids: ['ana.rodriguez'] as string[],
        team_email: ['ad-data@company.com'] as string[],
        team_slack: ['#ad-data-activation'] as string[],
        team_pagerduty: ['ad-data-escalation'] as string[],
        isActive: true
      }
    ];

    teamData.forEach(teamInfo => {
      this.createTeam(teamInfo as unknown as InsertTeam);
    });

    // Calculate and update team counts for tenants after teams are created
    this.updateTenantTeamCounts();
    
    // Initialize mock permissions data
    this.initMockPermissions();
    
    // Load mock DAG data using FS instead of require
    await this.loadMockDags();
    
    // Add some table entities with correct statuses
    this.addTableEntities();
    
    // Initialize mock audit data for rollback management
    this.initMockAuditData();
    
    // Initialize mock alert and admin broadcast message data
    this.initMockAlertData();
  }
  
  /**
   * Load mock DAG data from the JSON file
   */
  private async loadMockDags(): Promise<void> {
    try {
      // Use dynamic import with fs to load the JSON file
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Get the DAGs data JSON file
      const filePath = path.join(process.cwd(), 'server', 'data', 'mock-dags.json');
      const fileData = await fs.readFile(filePath, 'utf8');
      const mockDags = JSON.parse(fileData) as Entity[];
      
      if (mockDags && Array.isArray(mockDags)) {
        // Loading mock DAGs from data file
        
        // Reset entity ID if needed to accommodate the mock data IDs
        this.entityId = Math.max(...mockDags.map(dag => dag.id), 0) + 1;
        
        // Load each DAG entity into our entities map
        mockDags.forEach(dag => {
          // Map the lastStatus to the API status field for display in UI
          const statusMap: Record<string, string> = {
            "success": "Passed", 
            "running": "Pending",
            "failed": "Failed"
          };
          
          const statusValue = dag.lastStatus && statusMap[dag.lastStatus] 
            ? statusMap[dag.lastStatus] 
            : (dag.status || "Pending");
          
          this.entities.set(dag.id, {
            ...dag,
            createdAt: new Date(dag.createdAt),
            updatedAt: new Date(dag.updatedAt), 
            lastRun: dag.lastRun ? new Date(dag.lastRun) : null,
            status: statusValue,
            // Ensure all required properties have valid values
            description: dag.description || null,
            currentSla: dag.currentSla || null,
            lastRefreshed: dag.lastRun ? new Date(dag.lastRun) : null,
            // Tag all existing DAGs under Data Engineering tenant
            tenant_name: 'Data Engineering',
            // Explicitly preserve is_entity_owner field from mock data
            is_entity_owner: dag.is_entity_owner || false
          });
        });
        
        // Successfully loaded mock DAGs into storage
      }
    } catch (error) {
      console.error('Failed to load mock DAG data:', error);
    }
  }
  
  /**
   * Add table entities with API-compatible statuses
   */
  private addTableEntities(): void {
    const tableEntities: Partial<Entity>[] = [
      {
        name: 'brightscript_sla_pgm',
        type: 'table',
        teamId: 1, // PGM
        team_name: 'PGM',
        description: 'Brightscript SLA monitoring for PGM team',
        slaTarget: 95.0,
        currentSla: 98.5,
        status: 'Passed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-27T14:30:00Z'),
        owner: 'John Smith',
        ownerEmail: 'john.smith@company.com',
        schema_name: 'data_warehouse',
        table_name: 'agg_channel_brightscript_error_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      },
      {
        name: 'brightscript_sla_core',
        type: 'table', 
        teamId: 2, // Core
        team_name: 'Core',
        description: 'Brightscript SLA monitoring for Core team',
        slaTarget: 92.0,
        currentSla: 96.2,
        status: 'Passed',
        refreshFrequency: 'Hourly',
        lastRefreshed: new Date('2025-06-28T14:00:00Z'),
        owner: 'Jane Doe',
        ownerEmail: null, // No entity owner
        schema_name: 'abc',
        table_name: 'agg_accounts_channel_ux_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: false
      },
      {
        name: 'accounts_channel_ux_vp',
        type: 'table',
        teamId: 3, // Viewer Product
        team_name: 'Viewer Product',
        description: 'Accounts channel UX monitoring for Viewer Product team',
        slaTarget: 90.0,
        currentSla: 88.7,
        status: 'Failed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T12:15:00Z'),
        owner: 'Mike Johnson',
        ownerEmail: 'mike.johnson@company.com',
        schema_name: 'abc',
        table_name: 'agg_account_device_subscription_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      },
      {
        name: 'channel_analytics_iot',
        type: 'table',
        teamId: 4, // IOT
        team_name: 'IOT',
        description: 'Channel analytics for IOT devices',
        slaTarget: 93.0,
        currentSla: 94.1,
        status: 'Passed',
        refreshFrequency: 'Hourly',
        lastRefreshed: new Date('2025-06-28T16:45:00Z'),
        owner: 'Sarah Wilson',
        ownerEmail: null, // No entity owner
        schema_name: 'abc',
        table_name: 'agg_iot_device_channel_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: false
      },
      {
        name: 'subscription_metrics_cdm',
        type: 'table',
        teamId: 5, // CDM
        team_name: 'CDM',
        description: 'Subscription metrics for CDM team',
        slaTarget: 97.0,
        currentSla: null,
        status: 'Pending',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2024-12-01T00:00:00Z'),
        owner: 'Alex Chen',
        ownerEmail: 'alex.chen@company.com',
        schema_name: 'abc',
        table_name: 'agg_subscription_revenue_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      },
      // Additional entity owners across different teams
      {
        name: 'user_engagement_metrics_core',
        type: 'table',
        teamId: 2, // Core
        team_name: 'Core',
        description: 'User engagement analytics for Core team',
        slaTarget: 95.0,
        currentSla: 97.2,
        status: 'Passed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T10:30:00Z'),
        owner: 'Emma Wilson',
        ownerEmail: 'emma.wilson@company.com',
        schema_name: 'analytics',
        table_name: 'user_engagement_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      },
      {
        name: 'device_telemetry_iot',
        type: 'table',
        teamId: 4, // IOT
        team_name: 'IOT',
        description: 'Device telemetry data for IOT team',
        slaTarget: 92.0,
        currentSla: 95.8,
        status: 'Passed',
        refreshFrequency: 'Hourly',
        lastRefreshed: new Date('2025-06-28T15:00:00Z'),
        owner: 'David Kim',
        ownerEmail: 'david.kim@company.com',
        schema_name: 'iot_analytics',
        table_name: 'device_telemetry_hourly',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      },
      {
        name: 'revenue_analytics_cdm',
        type: 'table',
        teamId: 5, // CDM
        team_name: 'CDM',
        description: 'Revenue analytics for CDM team',
        slaTarget: 98.0,
        currentSla: 99.1,
        status: 'Passed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T11:45:00Z'),
        owner: 'Lisa Zhang',
        ownerEmail: 'lisa.zhang@company.com',
        schema_name: 'finance',
        table_name: 'revenue_metrics_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      },
      {
        name: 'content_performance_vp',
        type: 'table',
        teamId: 3, // Viewer Product
        team_name: 'Viewer Product',
        description: 'Content performance metrics for Viewer Product team',
        slaTarget: 93.0,
        currentSla: 91.5,
        status: 'Failed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T09:20:00Z'),
        owner: 'Tom Rodriguez',
        ownerEmail: 'tom.rodriguez@company.com',
        schema_name: 'content',
        table_name: 'content_metrics_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      },
      {
        name: 'channel_optimization_pgm',
        type: 'table',
        teamId: 1, // PGM
        team_name: 'PGM',
        description: 'Channel optimization data for PGM team',
        slaTarget: 94.0,
        currentSla: 96.7,
        status: 'Passed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T08:15:00Z'),
        owner: 'Rachel Green',
        ownerEmail: 'rachel.green@company.com',
        schema_name: 'optimization',
        table_name: 'channel_optimization_daily',
        tenant_name: 'Data Engineering',
        is_entity_owner: true
      }
    ];

    // Add some Ad Engineering entities for testing tenant filtering
    const adEngineeringEntities: Partial<Entity>[] = [
      {
        name: 'ad_performance_daily',
        type: 'table',
        teamId: 6, // Ad Serving team
        team_name: 'Ad Serving',
        description: 'Daily ad performance metrics and analytics',
        slaTarget: 95.0,
        currentSla: 92.3,
        status: 'Passed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T14:30:00Z'),
        owner: 'Sarah Johnson',
        ownerEmail: 'sarah.johnson@company.com',
        schema_name: 'ad_analytics',
        table_name: 'ad_performance_daily',
        tenant_name: 'Ad Engineering',
        is_entity_owner: true
      },
      {
        name: 'campaign_optimization_dag',
        type: 'dag',
        teamId: 7, // Ad Data Activation team
        team_name: 'Ad Data Activation',
        description: 'Daily campaign optimization and bidding adjustments',
        slaTarget: 88.0,
        currentSla: 89.5,
        status: 'Passed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T13:45:00Z'),
        owner: 'Mike Chen',
        ownerEmail: 'mike.chen@company.com',
        dag_name: 'campaign_optimization_daily',
        tenant_name: 'Ad Engineering',
        is_entity_owner: true
      },
      {
        name: 'bid_optimization_table',
        type: 'table',
        teamId: 6, // Ad Serving team
        team_name: 'Ad Serving',
        description: 'Real-time bid optimization analytics',
        slaTarget: 90.0,
        currentSla: 93.7,
        status: 'Passed',
        refreshFrequency: 'Hourly',
        lastRefreshed: new Date('2025-06-28T16:15:00Z'),
        owner: 'Carlos Martinez',
        ownerEmail: 'carlos.martinez@company.com',
        schema_name: 'ad_analytics',
        table_name: 'bid_optimization_hourly',
        tenant_name: 'Ad Engineering',
        is_entity_owner: true
      },
      {
        name: 'audience_segmentation_dag',
        type: 'dag',
        teamId: 7, // Ad Data Activation team
        team_name: 'Ad Data Activation',
        description: 'Audience segmentation and targeting pipeline',
        slaTarget: 92.0,
        currentSla: 94.2,
        status: 'Passed',
        refreshFrequency: 'Daily',
        lastRefreshed: new Date('2025-06-28T12:30:00Z'),
        owner: 'Ana Rodriguez',
        ownerEmail: 'ana.rodriguez@company.com',
        dag_name: 'audience_segmentation_daily',
        tenant_name: 'Ad Engineering',
        is_entity_owner: true
      }
    ];

    tableEntities.forEach(entity => {
      const id = this.entityId++;
      const fullEntity: Entity = {
        id,
        ...entity,
        // required fields from Partial
        name: entity.name as string,
        type: entity.type as string,
        teamId: entity.teamId as number,
        slaTarget: entity.slaTarget as number,
        status: entity.status as string,
        refreshFrequency: entity.refreshFrequency as string,
        description: entity.description ?? null,
        currentSla: entity.currentSla ?? null,
        lastRefreshed: (entity.lastRefreshed ?? null) as Date | null,
        nextRefresh: entity.lastRefreshed ? new Date(entity.lastRefreshed.getTime() + 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Set null for fields not provided in entity data, but preserve existing values
        tenant_name: (entity.tenant_name ?? 'Data Engineering') as string,
        team_name: entity.team_name ?? null,
        schema_name: entity.schema_name ?? null,
        table_name: entity.table_name ?? null,
        table_description: entity.table_description ?? null,
        table_schedule: entity.table_schedule ?? null,
        table_dependency: Array.isArray(entity.table_dependency) ? entity.table_dependency : null,
        dag_name: null, // Tables don't have DAG fields
        dag_description: null,
        dag_schedule: null,
        dag_dependency: null,
        server_name: entity.server_name ?? null,
        expected_runtime_minutes: entity.expected_runtime_minutes ?? null,
        donemarker_location: entity.donemarker_location ?? null,
        donemarker_lookback: entity.donemarker_lookback ?? null,
        // Normalize owner fields based on entity ownership
        owner: entity.is_entity_owner === true ? ((entity as Partial<Entity>).owner ?? null) : null,
        owner_email: entity.is_entity_owner === true ? ((entity as Partial<Entity>).owner_email ?? (entity as Partial<Entity>).ownerEmail ?? null) : null,
        ownerEmail: entity.is_entity_owner === true ? ((entity as Partial<Entity>).ownerEmail ?? null) : null,
        user_email: (entity as any).user_email ?? null, // Never fallback to ownerEmail
        is_active: entity.is_active !== undefined ? entity.is_active : true,
        is_entity_owner: entity.is_entity_owner !== undefined ? entity.is_entity_owner : false,
        lastRun: entity.lastRefreshed ?? null,
        lastStatus: entity.status ?? null,
        notification_preferences: (entity.notification_preferences ?? []) as string[]
      };
      this.entities.set(id, fullEntity);
    });

    // Add Ad Engineering entities for testing tenant filtering
    adEngineeringEntities.forEach(entity => {
      const id = this.entityId++;
      const fullEntity: Entity = {
        id,
        ...entity,
        name: entity.name as string,
        type: entity.type as string,
        teamId: entity.teamId as number,
        slaTarget: entity.slaTarget as number,
        status: entity.status as string,
        refreshFrequency: entity.refreshFrequency as string,
        description: entity.description ?? null,
        currentSla: entity.currentSla ?? null,
        lastRefreshed: (entity.lastRefreshed ?? null) as Date | null,
        nextRefresh: entity.lastRefreshed ? new Date(entity.lastRefreshed.getTime() + 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Set type-specific fields
        ...(entity.type === 'table' ? {
          table_name: entity.table_name || (entity.name as string),
          table_description: entity.description || 'Table for ad analytics processing',
          table_schedule: '0 3 * * *', // 3 AM daily
          table_dependency: ['ad_raw_data', 'user_segments'],
          dag_name: null,
          dag_description: null,
          dag_schedule: null,
          dag_dependency: null,
        } : {
          dag_name: entity.dag_name || (entity.name as string),
          dag_description: entity.description || 'DAG for ad optimization processing',
          dag_schedule: '0 3 * * *', // 3 AM daily
          dag_dependency: ['ad_raw_data', 'campaign_data'],
          table_name: null,
          table_description: null,
          table_schedule: null,
          table_dependency: null,
        }),
        // Common fields
        owner: (entity as Partial<Entity>).owner ?? null,
        team_name: entity.team_name ?? null,
        tenant_name: (entity.tenant_name ?? 'Ad Engineering') as string | null,
        schema_name: entity.schema_name ?? null,
        expected_runtime_minutes: entity.expected_runtime_minutes ?? (entity.type === 'table' ? 25 : 40),
        donemarker_location: entity.donemarker_location ?? (entity.type === 'table' 
          ? 's3://ad-analytics-tables/done_markers/' 
          : 's3://ad-analytics-dags/campaign_optimization/'),
        donemarker_lookback: entity.donemarker_lookback ?? 2,
        // Normalize owner fields based on entity ownership
        owner_email: entity.is_entity_owner === true ? ((entity as Partial<Entity>).owner_email ?? (entity as Partial<Entity>).ownerEmail ?? null) : null,
        ownerEmail: entity.is_entity_owner === true ? ((entity as Partial<Entity>).ownerEmail ?? null) : null,
        user_email: (entity as Partial<Entity>).user_email ?? null, // Never fallback to ownerEmail
        is_active: entity.is_active !== undefined ? entity.is_active : true,
        is_entity_owner: entity.is_entity_owner !== undefined ? entity.is_entity_owner : false,
        lastRun: entity.lastRefreshed ?? null,
        lastStatus: entity.status ?? null,
        notification_preferences: (entity.notification_preferences ?? []) as string[],
        server_name: entity.server_name ?? (entity.type === 'dag' ? 'airflow-main' : null)
      };
      this.entities.set(id, fullEntity);
    });

    // Initialize existing SLA roles into storage
    const slaRoles = [
      {
        role_name: 'sla-admin',
        description: 'Full administrative access to SLA management system',
        is_active: true,
        is_system_role: true,
        role_permissions: ['admin', 'manage_users', 'manage_teams', 'manage_tenants', 'resolve_conflicts', 'view_all_entities', 'manage_system_settings'],
        tenant_name: null,
        team_name: null,
      },
      {
        role_name: 'sla-dag-entity-editor',
        description: 'Can edit DAG entities, status, SLA settings, and progress',
        is_active: true,
        is_system_role: true,
        role_permissions: ['dag-status-editor', 'dag-sla-editor', 'dag-progress-editor', 'view_entities', 'edit_own_entities'],
        tenant_name: null,
        team_name: null,
      },
      {
        role_name: 'sla-table-entity-editor',
        description: 'Can edit table entities, status, SLA settings, and progress',
        is_active: true,
        is_system_role: true,
        role_permissions: ['table-status-editor', 'table-sla-editor', 'table-progress-editor', 'view_entities', 'edit_own_entities'],
        tenant_name: null,
        team_name: null,
      },
      {
        role_name: 'sla-viewer',
        description: 'Read-only access to SLA dashboard and entity information',
        is_active: true,
        is_system_role: true,
        role_permissions: ['viewer', 'view_entities'],
        tenant_name: null,
        team_name: null,
      },
      {
        role_name: 'sla-pgm-dag-entity-editor',
        description: 'Team-specific DAG editor role for PGM team in Data Engineering',
        is_active: true,
        is_system_role: false,
        role_permissions: ['dag-status-editor', 'dag-sla-editor', 'dag-progress-editor', 'view_entities', 'edit_own_entities', 'view_team_entities'],
        tenant_name: 'Data Engineering',
        team_name: 'PGM',
      },
      {
        role_name: 'sla-core-table-editor',
        description: 'Team-specific table editor role for Core team',
        is_active: true,
        is_system_role: false,
        role_permissions: ['table-status-editor', 'table-sla-editor', 'table-progress-editor', 'view_entities', 'edit_own_entities', 'view_team_entities'],
        tenant_name: 'Data Engineering',
        team_name: 'Core',
      }
    ];

    // Add roles to storage
    slaRoles.forEach((roleData, index) => {
      const role: Role = {
        id: index + 1,
        role_name: roleData.role_name,
        description: roleData.description,
        is_active: roleData.is_active,
        is_system_role: roleData.is_system_role,
        role_permissions: roleData.role_permissions,
        tenant_name: roleData.tenant_name,
        team_name: roleData.team_name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.rolesData.set(roleData.role_name, role);
    });
  }
  
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await this.ensureInitialized();
    return Array.from(this.users.values()).find(
      (user) => user.email === email
    );
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    // Check if user already exists - if so, update instead of creating new
    const existingUser = await this.getUserByUsername(insertUser.username);
    if (existingUser) {
      // Update the existing user with normalized optional fields
      const updatedUser: User = {
        ...existingUser,
        ...insertUser,
        email: insertUser.email ?? existingUser.email ?? null,
        displayName: insertUser.displayName ?? existingUser.displayName ?? null,
        team: insertUser.team ?? existingUser.team ?? null,
        role: insertUser.role ?? existingUser.role ?? null,
        azureObjectId: insertUser.azureObjectId ?? existingUser.azureObjectId ?? null,
        is_active: insertUser.is_active ?? existingUser.is_active ?? true,
        user_slack: insertUser.user_slack ? [...insertUser.user_slack] : (existingUser.user_slack ?? null),
        user_pagerduty: insertUser.user_pagerduty ? [...insertUser.user_pagerduty] : (existingUser.user_pagerduty ?? null),
      };
      this.users.set(existingUser.id, updatedUser);
      return updatedUser;
    }
    
    // Create a new user
    const id = this.userId++;
    const user: User = { 
      ...insertUser, 
      id,
      // Ensure optional fields have defaults and correct types
      email: insertUser.email ?? null,
      displayName: insertUser.displayName ?? null,
      team: insertUser.team ?? null,
      role: insertUser.role ?? null,
      azureObjectId: insertUser.azureObjectId ?? null,
      is_active: insertUser.is_active ?? true,
      user_slack: (insertUser.user_slack ? [...insertUser.user_slack] : null),
      user_pagerduty: (insertUser.user_pagerduty ? [...insertUser.user_pagerduty] : null)
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, partialUser: Partial<User>): Promise<User | undefined> {
    await this.ensureInitialized();
    const existingUser = this.users.get(id);
    if (!existingUser) {
      return undefined;
    }
    
    // Update the user with new data
    const updatedUser: User = { 
      ...existingUser, 
      ...partialUser,
      // normalize possibly undefined optionals
      is_active: partialUser.is_active ?? existingUser.is_active ?? true,
      user_slack: partialUser.user_slack ? [...partialUser.user_slack] : existingUser.user_slack ?? null,
      user_pagerduty: partialUser.user_pagerduty ? [...partialUser.user_pagerduty] : existingUser.user_pagerduty ?? null,
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUsers(): Promise<User[]> {
    await this.ensureInitialized();
    return Array.from(this.users.values());
  }

  async getTeamMembers(teamName: string): Promise<User[]> {
    await this.ensureInitialized();
    const team = await this.getTeamByName(teamName);
    if (!team || !team.team_members_ids) {
      return [];
    }
    
    const allUsers = await this.getUsers();
    return allUsers.filter(user => team.team_members_ids!.includes(user.username));
  }

  async getUserRoles(): Promise<UserRole[]> {
    // Return SLA-specific roles for the SLA Management system
    return [
      {
        role: 'sla-admin',
        label: 'SLA Administrator',
        description: 'Full administrative access to SLA management system',
        status: 'active'
      },
      {
        role: 'sla-dag-entity-editor',
        label: 'DAG Entity Editor',
        description: 'Can edit DAG entities, status, SLA settings, and progress',
        status: 'active'
      },
      {
        role: 'sla-table-entity-editor',
        label: 'Table Entity Editor',
        description: 'Can edit table entities, status, SLA settings, and progress',
        status: 'active'
      },
      {
        role: 'sla-viewer',
        label: 'SLA Viewer',
        description: 'Read-only access to SLA dashboard and entity information',
        status: 'active'
      },
      {
        role: 'sla-pgm-dag-entity-editor',
        label: 'PGM DAG Entity Editor',
        description: 'Team-specific DAG editor role for PGM team in Data Engineering',
        status: 'active'
      },
      {
        role: 'sla-core-table-editor',
        label: 'Core Table Editor',
        description: 'Team-specific table editor role for Core team',
        status: 'active'
      }
    ];
  }

  // Role operations
  async getRoles(): Promise<Role[]> {
    await this.ensureInitialized();
    return Array.from(this.rolesData.values());
  }

  async getRole(roleName: string): Promise<Role | undefined> {
    await this.ensureInitialized();
    return this.rolesData.get(roleName);
  }

  async createRole(insertRole: InsertRole): Promise<Role> {
    await this.ensureInitialized();
    const now = new Date();
    const role: Role = {
      id: this.rolesVersion++, // Auto-increment for the database id field
      role_name: insertRole.role_name,
      description: insertRole.description || null,
      is_active: insertRole.is_active ?? true,
      is_system_role: insertRole.is_system_role ?? false,
      role_permissions: insertRole.role_permissions || [],
      team_name: insertRole.team_name || null,
      tenant_name: insertRole.tenant_name || null,
      createdAt: now,
      updatedAt: now,
    };
    this.rolesData.set(insertRole.role_name, role);
    this.rolesVersion++; // Increment version for cache invalidation
    return role;
  }

  async updateRole(roleName: string, updateRole: UpdateRole): Promise<Role | undefined> {
    await this.ensureInitialized();
    const existingRole = this.rolesData.get(roleName);
    if (!existingRole) {
      return undefined;
    }
    
    const updatedRole: Role = {
      ...existingRole,
      ...updateRole,
      role_name: updateRole.role_name || existingRole.role_name, // Allow role name updates
      updatedAt: new Date(),
    };
    
    // If role name changed, update the map key
    if (updateRole.role_name && updateRole.role_name !== roleName) {
      this.rolesData.delete(roleName);
      this.rolesData.set(updateRole.role_name, updatedRole);
    } else {
      this.rolesData.set(roleName, updatedRole);
    }
    
    this.rolesVersion++; // Increment version for cache invalidation
    return updatedRole;
  }

  async deleteRole(roleName: string): Promise<boolean> {
    await this.ensureInitialized();
    const success = this.rolesData.delete(roleName);
    if (success) {
      this.rolesVersion++; // Increment version for cache invalidation
    }
    return success;
  }

  // Permission operations
  async getPermissions(): Promise<Permission[]> {
    await this.ensureInitialized();
    return Array.from(this.permissionsData.values());
  }

  async getPermission(permissionName: string): Promise<Permission | undefined> {
    await this.ensureInitialized();
    return this.permissionsData.get(permissionName);
  }

  async createPermission(insertPermission: InsertPermission): Promise<Permission> {
    await this.ensureInitialized();
    const now = new Date();
    const permission: Permission = {
      id: this.permissionsVersion++,
      permission_name: insertPermission.permission_name,
      description: insertPermission.description || null,
      category: insertPermission.category,
      is_active: insertPermission.is_active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.permissionsData.set(insertPermission.permission_name, permission);
    this.permissionsVersion++;
    return permission;
  }

  async updatePermission(permissionName: string, updatePermission: Partial<Permission>): Promise<Permission | undefined> {
    await this.ensureInitialized();
    const existingPermission = this.permissionsData.get(permissionName);
    if (!existingPermission) {
      return undefined;
    }
    
    const updatedPermission: Permission = {
      ...existingPermission,
      ...updatePermission,
      permission_name: updatePermission.permission_name || existingPermission.permission_name,
      updatedAt: new Date(),
    };
    
    if (updatePermission.permission_name && updatePermission.permission_name !== permissionName) {
      this.permissionsData.delete(permissionName);
      this.permissionsData.set(updatePermission.permission_name, updatedPermission);
    } else {
      this.permissionsData.set(permissionName, updatedPermission);
    }
    
    this.permissionsVersion++;
    return updatedPermission;
  }

  async deletePermission(permissionName: string): Promise<boolean> {
    await this.ensureInitialized();
    const success = this.permissionsData.delete(permissionName);
    if (success) {
      this.permissionsVersion++;
    }
    return success;
  }
  
  // Team operations
  async getTeams(): Promise<Team[]> {
    await this.ensureInitialized();
    return Array.from(this.teams.values());
  }
  
  async getTeam(id: number): Promise<Team | undefined> {
    return this.teams.get(id);
  }
  
  async getTeamByName(name: string): Promise<Team | undefined> {
    return Array.from(this.teams.values()).find(
      (team) => team.name === name
    );
  }
  
  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const id = this.teamId++;
    const now = new Date();
    // Ensure required fields have valid values
    const team: Team = { 
      ...insertTeam, 
      id, 
      createdAt: now,
      updatedAt: now,
      description: insertTeam.description || null,
      team_members_ids: insertTeam.team_members_ids ? [...insertTeam.team_members_ids] : null,
      team_email: insertTeam.team_email ? [...insertTeam.team_email] : null,
      team_slack: insertTeam.team_slack ? [...insertTeam.team_slack] : null,
      team_pagerduty: insertTeam.team_pagerduty ? [...insertTeam.team_pagerduty] : null,
      team_notify_preference_id: (insertTeam as any).team_notify_preference_id ?? null,
      isActive: insertTeam.isActive !== undefined ? insertTeam.isActive : true // Default to active
    };
    this.teams.set(id, team);
    // Recalculate tenant team counts when a new team is created
    this.updateTenantTeamCounts();
    return team;
  }

  async updateTeam(id: number, teamData: Partial<Team>): Promise<Team | undefined> {
    await this.ensureInitialized();
    const team = this.teams.get(id);
    if (!team) return undefined;
    
    const updatedTeam: Team = {
      ...team,
      ...teamData,
      id, // Ensure ID cannot be changed
      updatedAt: new Date()
    };
    
    this.teams.set(id, updatedTeam);
    // Recalculate tenant team counts when team status or tenant changes
    this.updateTenantTeamCounts();
    return updatedTeam;
  }

  async updateEntitiesTeamName(teamId: number, newTeamName: string): Promise<void> {
    await this.ensureInitialized();
    // Update team_name on all entities belonging to this team
    this.entities.forEach((entity, entityId) => {
      if (entity.teamId === teamId) {
        this.entities.set(entityId, { ...entity, team_name: newTeamName });
      }
    });
  }

  async updateUsersTeamName(oldTeamName: string, newTeamName: string): Promise<void> {
    await this.ensureInitialized();
    // Update team field on all users belonging to this team
    this.users.forEach((user, userId) => {
      if (user.team === oldTeamName) {
        this.users.set(userId, { ...user, team: newTeamName });
      }
    });
  }

  async updateEntitiesTenantName(tenantId: number, newTenantName: string): Promise<void> {
    await this.ensureInitialized();
    // Update tenant_name on all entities whose team belongs to this tenant
    const affectedTeamIds = Array.from(this.teams.values())
      .filter(team => team.tenant_id === tenantId)
      .map(team => team.id);

    if (affectedTeamIds.length === 0) return;

    this.entities.forEach((entity, entityId) => {
      if (affectedTeamIds.includes(entity.teamId as number)) {
        this.entities.set(entityId, { ...entity, tenant_name: newTenantName });
      }
    });
  }

  async updateTeamMembers(teamName: string, memberData: any, oauthContext: any): Promise<Team | undefined> {
    const team = await this.getTeamByName(teamName);
    if (!team) return undefined;

    const { action, member, memberId } = memberData;
    const now = new Date();
    
    let updatedMembers = [...(team.team_members_ids || [])];
    
    switch (action) {
      case 'add':
        if (memberId && !updatedMembers.includes(memberId)) {
          // Convert user ID to username for addition
          const user = await this.getUser(parseInt(memberId));
          if (user && !updatedMembers.includes(user.username)) {
            updatedMembers.push(user.username);
          }
        }
        break;
      case 'remove':
        if (memberId) {
          // Handle both username strings and user IDs for removal
          let username: string | undefined;
          
          if (typeof memberId === 'string' && isNaN(parseInt(memberId))) {
            // memberId is a username string (e.g., "michael.brown")
            username = memberId;
          } else {
            // memberId is a user ID (convert to username)
            const user = await this.getUser(parseInt(memberId));
            username = user?.username;
          }
          
          if (username) {
            updatedMembers = updatedMembers.filter(memberUsername => memberUsername !== username);
          }
        }
        break;
      case 'update':
        // For update, we maintain the same member list but the member data would be updated elsewhere
        break;
    }

    // CRITICAL FIX: Also update the user's team assignment field
    // This ensures notification timeline (using /api/users) stays in sync with admin panel (using /api/teams/{name}/members)
    switch (action) {
      case 'add':
        if (memberId) {
          const user = await this.getUser(parseInt(memberId));
          if (user) {
            // Update user's team assignment
            const updatedUser = { ...user, team: teamName };
            this.users.set(user.id, updatedUser);
          }
        }
        break;
      case 'remove':
        if (memberId) {
          let userId: number | undefined;
          
          if (typeof memberId === 'string' && isNaN(parseInt(memberId))) {
            // memberId is a username string - find the user by username
            const user = Array.from(this.users.values()).find(u => u.username === memberId);
            userId = user?.id;
          } else {
            // memberId is a user ID
            userId = parseInt(memberId);
          }
          
          if (userId) {
            const user = await this.getUser(userId);
            if (user) {
              // Clear user's team assignment (set to empty string or null)
              const updatedUser = { ...user, team: '' };
              this.users.set(user.id, updatedUser);
            }
          }
        }
        break;
    }

    const updatedTeam: Team = {
      ...team,
      team_members_ids: updatedMembers,
      updatedAt: now
    };

    this.teams.set(team.id, updatedTeam);
    return updatedTeam;
  }

  /**
   * Update team counts for all tenants based on actual team assignments
   */
  private updateTenantTeamCounts(): void {
    // Count only ACTIVE teams per tenant
    const teamCounts = new Map<number, number>();

    Array.from(this.teams.values()).forEach((team) => {
      if (team.isActive === true) {
        const tenantId = team.tenant_id;
        teamCounts.set(tenantId, (teamCounts.get(tenantId) || 0) + 1);
      }
    });

    // Update each tenant's team count
    Array.from(this.tenants.entries()).forEach(([tenantId, tenant]) => {
      const teamCount = teamCounts.get(tenantId) || 0;
      const oldCount = tenant.teamsCount || 0;
      
      this.tenants.set(tenantId, {
        ...tenant,
        teamsCount: teamCount,
        updatedAt: new Date().toISOString()
      });
      
    });
  }
  
  // Tenant operations
  async getTenants(): Promise<Tenant[]> {
    await this.ensureInitialized();
    return Array.from(this.tenants.values());
  }

  async createTenant(tenantData: { name: string; description?: string }): Promise<Tenant> {
    await this.ensureInitialized();
    const now = new Date().toISOString();
    const tenant: Tenant = {
      id: this.tenantId++,
      name: tenantData.name,
      description: tenantData.description || '',
      isActive: true,        // Default to active status
      teamsCount: 0,         // Default teams count
      createdAt: now,
      updatedAt: now
    };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  async updateTenant(id: number, tenantData: Partial<Tenant>): Promise<Tenant | undefined> {
    await this.ensureInitialized();
    const tenant = this.tenants.get(id);
    if (!tenant) return undefined;
    
    const wasActive = tenant.isActive;
    const willBeActive = tenantData.isActive !== undefined ? tenantData.isActive : wasActive;
    
    const updatedTenant: Tenant = {
      ...tenant,
      ...tenantData,
      id, // Ensure ID cannot be changed
      updatedAt: new Date().toISOString()
    };
    
    this.tenants.set(id, updatedTenant);
    
    // CASCADE LOGIC: If tenant becomes inactive, deactivate all its teams
    if (wasActive && !willBeActive) {
      await this.deactivateTeamsByTenant(id);
      
      // Get updated tenant to show new count and return the latest version
      const updatedTenantAfterCascade = this.tenants.get(id);
      return updatedTenantAfterCascade!; // Return tenant with updated team count
    }
    // NOTE: When tenant becomes active again, we do NOT reactivate teams
    // Teams must be manually reactivated by admin
    
    return updatedTenant;
  }

  /**
   * Deactivate all teams belonging to a specific tenant
   * Used when a tenant becomes inactive
   */
  private async deactivateTeamsByTenant(tenantId: number): Promise<void> {
    const teamsToDeactivate: Team[] = [];
    
    // Find all teams belonging to this tenant
    Array.from(this.teams.values()).forEach((team) => {
      if (team.tenant_id === tenantId && team.isActive === true) {
        teamsToDeactivate.push(team);
      }
    });
    
    // Deactivate each team
    for (const team of teamsToDeactivate) {
      const deactivatedTeam: Team = {
        ...team,
        isActive: false,
        updatedAt: new Date()
      };
      this.teams.set(team.id, deactivatedTeam);
    }
    
    // Update tenant team counts after deactivation
    this.updateTenantTeamCounts();
  }
  
  // Entity operations
  async getEntities(): Promise<Entity[]> {
    await this.ensureInitialized();
    return Array.from(this.entities.values());
  }
  
  async getEntity(id: number): Promise<Entity | undefined> {
    return this.entities.get(id);
  }
  
  async getEntitiesByTeam(teamId: number): Promise<Entity[]> {
    return Array.from(this.entities.values()).filter(
      (entity) => entity.teamId === teamId
    );
  }
  
  async getEntitiesByType(type: string): Promise<Entity[]> {
    return Array.from(this.entities.values()).filter(
      (entity) => entity.type === type
    );
  }

  async getEntitiesByDateRange(startDate: Date, endDate: Date, teamId?: number, tenant?: string): Promise<Entity[]> {
    let entities = Array.from(this.entities.values());
    
    // Filter by date range using lastRefreshed as the primary timestamp
    entities = entities.filter(entity => {
      if (!entity.lastRefreshed) return false;
      const entityDate = new Date(entity.lastRefreshed);
      return entityDate >= startDate && entityDate <= endDate;
    });
    
    // Apply additional filters if provided
    if (teamId) {
      entities = entities.filter(entity => entity.teamId === teamId);
    }
    
    if (tenant) {
      entities = entities.filter(entity => entity.tenant_name === tenant);
    }
    
    return entities;
  }
  
  async createEntity(insertEntity: InsertEntity): Promise<Entity> {
    const id = this.entityId++;
    const now = new Date();
    const entity: Entity = { 
      ...insertEntity, 
      id, 
      createdAt: now, 
      updatedAt: now,
      // Ensure required fields have valid values
      description: insertEntity.description || null,
      currentSla: insertEntity.currentSla || null,
      lastRefreshed: insertEntity.lastRefreshed || null,
      nextRefresh: insertEntity.nextRefresh ?? null,
      is_active: insertEntity.is_active ?? true,
      // Normalize owner fields based on entity ownership
      owner: insertEntity.is_entity_owner === true ? (insertEntity.owner ?? null) : null,
      ownerEmail: insertEntity.is_entity_owner === true ? (insertEntity.ownerEmail ?? null) : null,
      owner_email: insertEntity.is_entity_owner === true ? (insertEntity.owner_email ?? insertEntity.ownerEmail ?? null) : null,
      user_email: insertEntity.user_email ?? null, // Never fallback to ownerEmail
      tenant_name: insertEntity.tenant_name ?? null,
      team_name: insertEntity.team_name ?? null,
      schema_name: insertEntity.schema_name ?? null,
      table_name: insertEntity.table_name ?? null,
      table_description: insertEntity.table_description ?? null,
      table_schedule: insertEntity.table_schedule ?? null,
      table_dependency: insertEntity.table_dependency ? [...insertEntity.table_dependency] : null,
      dag_name: insertEntity.dag_name ?? null,
      dag_description: insertEntity.dag_description ?? null,
      dag_schedule: insertEntity.dag_schedule ?? null,
      dag_dependency: insertEntity.dag_dependency ? [...insertEntity.dag_dependency] : null,
      server_name: insertEntity.server_name ?? null,
      expected_runtime_minutes: insertEntity.expected_runtime_minutes ?? null,
      notification_preferences: insertEntity.notification_preferences ? [...insertEntity.notification_preferences] : [],
      donemarker_location: insertEntity.donemarker_location ?? null,
      donemarker_lookback: insertEntity.donemarker_lookback ?? null,
      is_entity_owner: insertEntity.is_entity_owner ?? false,
      lastRun: insertEntity.lastRun ?? insertEntity.lastRefreshed ?? null,
      lastStatus: insertEntity.lastStatus ?? null,
    };
    this.entities.set(id, entity);
    return entity;
  }
  
  async updateEntity(id: number, updates: Partial<Entity>): Promise<Entity | undefined> {
    const entity = this.entities.get(id);
    if (!entity) return undefined;
    
    // Deep clone entity to prevent contamination across shared references
    const clonedEntity = structuredClone(entity);
    
    // Apply updates first
    const mergedEntity = { 
      ...clonedEntity, 
      ...updates, 
      updatedAt: new Date(),
      nextRefresh: (updates.nextRefresh ?? clonedEntity.nextRefresh ?? null) as Date | null,
      is_active: (updates.is_active ?? clonedEntity.is_active ?? true) as boolean,
    };
    
    // Then normalize owner fields based on is_entity_owner
    const updatedEntity: Entity = {
      ...mergedEntity,
      owner: mergedEntity.is_entity_owner === true ? (updates.owner ?? clonedEntity.owner ?? null) : null,
      ownerEmail: mergedEntity.is_entity_owner === true ? (updates.ownerEmail ?? clonedEntity.ownerEmail ?? null) : null,
      owner_email: mergedEntity.is_entity_owner === true ? (updates.owner_email ?? clonedEntity.owner_email ?? null) : null,
    };
    this.entities.set(id, updatedEntity);
    return updatedEntity;
  }
  
  async deleteEntity(id: number): Promise<boolean> {
    return this.entities.delete(id);
  }

  async deleteEntityByName({ name, type, teamName }: { name: string; type?: Entity['type']; teamName?: string }): Promise<boolean> {
    await this.ensureInitialized();
    for (const [id, entity] of Array.from(this.entities.entries())) {
      if (type && entity.type !== type) continue;
      const identifier = resolveEntityIdentifier(entity, { fallback: entity.name ?? undefined });
      if (identifier !== name) continue;
      if (teamName && entity.team_name !== teamName) continue;
      this.entities.delete(id);
      return true;
    }
    return false;
  }
  
  // Entity History operations
  async getEntityHistory(entityId: number): Promise<EntityHistory[]> {
    return this.entityHistories.get(entityId) || [];
  }
  
  async addEntityHistory(insertHistory: InsertEntityHistory): Promise<EntityHistory> {
    const id = this.historyId++;
    const now = new Date();
    // Ensure date is set to a valid Date object
    const history: EntityHistory = { 
      ...insertHistory, 
      id,
      date: insertHistory.date || now
    };
    
    const histories = this.entityHistories.get(insertHistory.entityId) || [];
    histories.push(history);
    this.entityHistories.set(insertHistory.entityId, histories);
    
    return history;
  }
  
  // Issue operations
  async getIssues(entityId: number): Promise<Issue[]> {
    return this.entityIssues.get(entityId) || [];
  }
  
  async addIssue(insertIssue: InsertIssue): Promise<Issue> {
    const id = this.issueId++;
    const now = new Date();
    const issue: Issue = { 
      ...insertIssue, 
      id, 
      resolved: false,
      resolvedAt: null,
      // Ensure date is set to a valid Date object
      date: insertIssue.date || now
    };
    
    const issues = this.entityIssues.get(insertIssue.entityId) || [];
    issues.push(issue);
    this.entityIssues.set(insertIssue.entityId, issues);
    
    return issue;
  }
  
  async resolveIssue(id: number): Promise<Issue | undefined> {
    for (const entry of Array.from(this.entityIssues.entries())) {
      const entityId = entry[0];
      const entityIssues = entry[1];
      const issueIndex = entityIssues.findIndex((issue) => issue.id === id);
      if (issueIndex !== -1) {
        const issue = entityIssues[issueIndex];
        const resolvedIssue: Issue = {
          ...issue,
          resolved: true,
          resolvedAt: new Date(),
        } as Issue;
        entityIssues[issueIndex] = resolvedIssue;
        this.entityIssues.set(entityId, entityIssues);
        return resolvedIssue;
      }
    }
    return undefined;
  }

  // Notification Timeline operations
  async getNotificationTimelines(entityId: number): Promise<NotificationTimeline[]> {
    return Array.from(this.notificationTimelines.values())
      .filter(timeline => timeline.entityId === entityId);
  }

  async createNotificationTimeline(insertTimeline: InsertNotificationTimeline): Promise<NotificationTimeline> {
    const id = `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeline: NotificationTimeline = {
      id,
      name: insertTimeline.name,
      description: insertTimeline.description ?? null,
      entityId: insertTimeline.entityId,
      triggers: [...insertTimeline.triggers],
      channels: [...insertTimeline.channels],
      isActive: insertTimeline.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.notificationTimelines.set(id, timeline);
    return timeline;
  }

  async updateNotificationTimeline(id: string, updates: Partial<NotificationTimeline>): Promise<NotificationTimeline | undefined> {
    const existingTimeline = this.notificationTimelines.get(id);
    if (!existingTimeline) {
      return undefined;
    }

    const updatedTimeline: NotificationTimeline = {
      ...existingTimeline,
      ...updates,
      updatedAt: new Date(),
    };

    this.notificationTimelines.set(id, updatedTimeline);
    return updatedTimeline;
  }

  async deleteNotificationTimeline(id: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const exists = this.notificationTimelines.has(id);
    if (exists) {
      // Delete the timeline
      this.notificationTimelines.delete(id);
      
      // Cascade delete: deactivate all subscriptions for this timeline
      const subscriptionEntries = Array.from(this.entitySubscriptionsData.entries());
      subscriptionEntries.forEach(([subId, subscription]) => {
        if (subscription.notificationTimelineId === id && subscription.isActive) {
          const deactivatedSubscription = { ...subscription, isActive: false, updatedAt: new Date() };
          this.entitySubscriptionsData.set(subId, deactivatedSubscription);
        }
      });
    }
    return exists;
  }
  
  /**
   * Initialize mock audit data for rollback management
   */
  private initMockAuditData(): void {
    const now = new Date();
    
    // Mock DAG audit data (deleted entities)
    const mockDagAudit = [
      {
        id: this.dagAuditId++,
        entityName: 'user_analytics_pipeline',
        tenantId: 1, // Data Engineering
        teamId: 3, // Viewer Product
        auditSequenceId: 1,
        auditUuidId: 'dag-audit-001',
        actionType: 'DELETE' as const,
        rowBefore: {
          id: 999,
          name: 'user_analytics_pipeline',
          type: 'dag',
          teamId: 3,
          description: 'User analytics processing pipeline',
          slaTarget: 95.0,
          currentSla: 92.3,
          status: 'Passed',
          refreshFrequency: 'Daily',
          tenant_name: 'Data Engineering',
          team_name: 'Viewer Product',
          dag_name: 'user_analytics_daily'
        },
        rowAfter: null,
        changes: { deleted: true },
        revertedFromAuditId: null,
        actionByUserId: 1,
        actionTimestamp: new Date('2025-09-15T10:30:00Z')
      },
      {
        id: this.dagAuditId++,
        entityName: 'sales_reporting_dag',
        tenantId: 2, // Ad Engineering
        teamId: 6, // Ad Serving
        auditSequenceId: 2,
        auditUuidId: 'dag-audit-002',
        actionType: 'DELETE' as const,
        rowBefore: {
          id: 1000,
          name: 'sales_reporting_dag',
          type: 'dag',
          teamId: 6,
          description: 'Sales reporting and analytics DAG',
          slaTarget: 88.0,
          currentSla: 89.5,
          status: 'Passed',
          refreshFrequency: 'Daily',
          tenant_name: 'Ad Engineering',
          team_name: 'Ad Serving',
          dag_name: 'sales_reporting_daily'
        },
        rowAfter: null,
        changes: { deleted: true },
        revertedFromAuditId: null,
        actionByUserId: 2,
        actionTimestamp: new Date('2025-09-13T09:15:00Z')
      }
    ];
    
    // Mock Table audit data (deleted entities)
    const mockTableAudit = [
      {
        id: this.tableAuditId++,
        entityName: 'customer_data_table',
        tenantId: 1, // Data Engineering
        teamId: 1, // PGM
        auditSequenceId: 1,
        auditUuidId: 'table-audit-001',
        actionType: 'DELETE' as const,
        rowBefore: {
          id: 1001,
          name: 'customer_data_table',
          type: 'table',
          teamId: 1,
          description: 'Customer data and insights table',
          slaTarget: 96.0,
          currentSla: 94.2,
          status: 'Passed',
          refreshFrequency: 'Hourly',
          tenant_name: 'Data Engineering',
          team_name: 'PGM',
          schema_name: 'customer_analytics',
          table_name: 'customer_insights_hourly'
        },
        rowAfter: null,
        changes: { deleted: true },
        revertedFromAuditId: null,
        actionByUserId: 3,
        actionTimestamp: new Date('2025-09-14T15:45:00Z')
      },
      {
        id: this.tableAuditId++,
        entityName: 'inventory_tracking_table',
        tenantId: 1, // Data Engineering
        teamId: 5, // CDM
        auditSequenceId: 2,
        auditUuidId: 'table-audit-002',
        actionType: 'DELETE' as const,
        rowBefore: {
          id: 1002,
          name: 'inventory_tracking_table',
          type: 'table',
          teamId: 5,
          description: 'Inventory tracking and management table',
          slaTarget: 93.0,
          currentSla: 95.1,
          status: 'Passed',
          refreshFrequency: 'Daily',
          tenant_name: 'Data Engineering',
          team_name: 'CDM',
          schema_name: 'supply_chain',
          table_name: 'inventory_tracking_daily'
        },
        rowAfter: null,
        changes: { deleted: true },
        revertedFromAuditId: null,
        actionByUserId: 4,
        actionTimestamp: new Date('2025-09-12T14:20:00Z')
      }
    ];
    
    // Store audit data in maps
    mockDagAudit.forEach(audit => this.dagAudit.set(audit.id, audit));
    mockTableAudit.forEach(audit => this.tableAudit.set(audit.id, audit));
  }

  /**
   * Initialize mock permissions data
   */
  private initMockPermissions(): void {
    const now = new Date();
    
    const mockPermissions = [
      // DAG Permissions - Status/SLA/Progress Editors
      {
        permission_name: 'dag-status-editor',
        description: 'Edit DAG status fields',
        category: 'DAG' as const,
        is_active: true
      },
      {
        permission_name: 'dag-sla-editor',
        description: 'Edit DAG SLA settings',
        category: 'DAG' as const,
        is_active: true
      },
      {
        permission_name: 'dag-progress-editor',
        description: 'Edit DAG progress tracking',
        category: 'DAG' as const,
        is_active: true
      },
      // Table Permissions - Status/SLA/Progress Editors
      {
        permission_name: 'table-status-editor',
        description: 'Edit table status fields',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'table-sla-editor',
        description: 'Edit table SLA settings',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'table-progress-editor',
        description: 'Edit table progress tracking',
        category: 'Table' as const,
        is_active: true
      },
      // Entity View Permissions
      {
        permission_name: 'view_entities',
        description: 'View entity details and information',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'edit_own_entities',
        description: 'Edit entities owned by user',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'view_team_entities',
        description: 'View entities within user team',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'view_all_entities',
        description: 'View all entities across all teams',
        category: 'Table' as const,
        is_active: true
      },
      // CRUD Permissions
      {
        permission_name: 'create_tables',
        description: 'Create new table entities',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'create_dags',
        description: 'Create new DAG entities',
        category: 'DAG' as const,
        is_active: true
      },
      {
        permission_name: 'delete_tables',
        description: 'Delete table entities',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'delete_dags',
        description: 'Delete DAG entities',
        category: 'DAG' as const,
        is_active: true
      },
      // DAG Task Management
      {
        permission_name: 'manage_dag_tasks',
        description: 'Manage DAG tasks including priority zones',
        category: 'DAG' as const,
        is_active: true
      },
      // Notification Permissions
      {
        permission_name: 'create_notifications',
        description: 'Create new notification configurations',
        category: 'Notification' as const,
        is_active: true
      },
      {
        permission_name: 'delete_notifications',
        description: 'Delete notification configurations',
        category: 'Notification' as const,
        is_active: true
      },
      // Agentic Permissions
      {
        permission_name: 'manage_agent_sessions',
        description: 'Manage and save agent conversation sessions',
        category: 'Agentic' as const,
        is_active: true
      },
      // Admin Permissions
      {
        permission_name: 'manage_users',
        description: 'Create, update, and manage user accounts',
        category: 'Admin' as const,
        is_active: true
      },
      {
        permission_name: 'manage_teams',
        description: 'Create, update, and manage teams',
        category: 'Admin' as const,
        is_active: true
      },
      {
        permission_name: 'manage_tenants',
        description: 'Create, update, and manage tenants',
        category: 'Admin' as const,
        is_active: true
      },
      {
        permission_name: 'manage_roles',
        description: 'Create, update, and manage user roles',
        category: 'Admin' as const,
        is_active: true
      },
      {
        permission_name: 'resolve_conflicts',
        description: 'Resolve notification conflicts',
        category: 'Notification' as const,
        is_active: true
      },
      {
        permission_name: 'manage_system_settings',
        description: 'Manage system-wide settings and configurations',
        category: 'Admin' as const,
        is_active: true
      },
      // Viewer Permissions
      {
        permission_name: 'viewer',
        description: 'Read-only viewer access',
        category: 'Table' as const,
        is_active: true
      },
      {
        permission_name: 'webview',
        description: 'Web view access for dashboards',
        category: 'Table' as const,
        is_active: true
      },
      // Admin super permission
      {
        permission_name: 'admin',
        description: 'Full administrative access to all system features',
        category: 'Admin' as const,
        is_active: true
      }
    ];

    // Create all permissions with incremental IDs
    mockPermissions.forEach((permData, index) => {
      const permission: Permission = {
        id: index + 1,
        permission_name: permData.permission_name,
        description: permData.description,
        category: permData.category,
        is_active: permData.is_active,
        createdAt: now,
        updatedAt: now
      };
      this.permissionsData.set(permission.permission_name, permission);
    });
    
    this.permissionsVersion = mockPermissions.length + 1;
  }

  private initMockAlertData(): void {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().split('T')[0];
    
    // Mock system alerts
    const mockAlerts = [
      {
        title: "System Maintenance Scheduled",
        message: "Scheduled maintenance will occur tonight from 2:00 AM to 4:00 AM EST. Some services may be temporarily unavailable.",
        alertType: "maintenance" as const,
        severity: "medium" as const,
        dateKey: today,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
      },
      {
        title: "High Data Processing Volume",
        message: "System is experiencing higher than normal data processing volume. Some DAGs may take longer to complete.",
        alertType: "warning" as const,
        severity: "low" as const,
        dateKey: today,
        isActive: true,
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000) // Expires in 6 hours
      },
      {
        title: "New Feature Release",
        message: "New task priority management features are now available in the DAG dashboard. Check out the updated interface!",
        alertType: "info" as const,
        severity: "low" as const,
        dateKey: today,
        isActive: true,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) // Expires in 48 hours
      },
      {
        title: "Database Performance Alert",
        message: "Database response times are currently elevated. Engineering team is investigating. ETAs may be delayed.",
        alertType: "system" as const,
        severity: "high" as const,
        dateKey: tomorrowString,
        isActive: true,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // Expires in 12 hours
      }
    ];

    // Mock admin broadcast messages
    const mockAdminMessages = [
      {
        message: "Welcome to the new SLA Management Dashboard! Please review the updated features and reach out to your team lead with any questions.",
        dateKey: today,
        deliveryType: "login_triggered" as const,
        isActive: true,
        createdByUserId: 1, // azure_test_user (admin)
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
      },
      {
        message: "Important: All DAG owners must review and update their notification settings by the end of this week. This is required for compliance.",
        dateKey: today,
        deliveryType: "immediate" as const,
        isActive: true,
        createdByUserId: 1, // azure_test_user (admin)  
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // Expires in 3 days
      },
      {
        message: "Reminder: Monthly team performance review meeting is scheduled for next Tuesday at 2 PM EST. Please ensure all your entities are up to date.",
        dateKey: tomorrowString,
        deliveryType: "login_triggered" as const,
        isActive: true,
        createdByUserId: 1, // azure_test_user (admin)
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // Expires in 5 days
      }
    ];

    // Store mock alerts
    mockAlerts.forEach(alertData => {
      const alert = {
        ...alertData,
        id: this.alertId++,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.alertsData.set(alert.id, alert);
    });

    // Store mock admin broadcast messages
    mockAdminMessages.forEach(messageData => {
      const message = {
        ...messageData,
        id: this.adminBroadcastMessageId++,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.adminBroadcastMessagesData.set(message.id, message);
    });
  }
  
  // Audit operations for rollback management
  async getDeletedEntitiesByName(entityName: string): Promise<Array<{ id: string; entity_name: string; entity_type: 'dag' | 'table'; tenant_name: string; team_name: string; deleted_date: string; deleted_by: string; entity_id: string; tenant_id: string; team_id: string; schema_name?: string; table_name?: string; table_schedule?: string; dag_name?: string; dag_schedule?: string }>> {
    await this.ensureInitialized();
    const results: Array<{ id: string; entity_name: string; entity_type: 'dag' | 'table'; tenant_name: string; team_name: string; deleted_date: string; deleted_by: string; entity_id: string; tenant_id: string; team_id: string; schema_name?: string; table_name?: string; table_schedule?: string; dag_name?: string; dag_schedule?: string }> = [];
    
    // Search DAG audit records
    Array.from(this.dagAudit.values()).forEach(audit => {
      if (audit.actionType === 'DELETE' && audit.entityName.toLowerCase().includes(entityName.toLowerCase())) {
        const rowBefore = audit.rowBefore as any;
        if (rowBefore) {
          // Get user who deleted the entity
          const deletedByUser = Array.from(this.users.values()).find(user => user.id === audit.actionByUserId);
          
          results.push({
            id: audit.auditUuidId,
            entity_name: audit.entityName,
            entity_type: 'dag',
            tenant_name: rowBefore.tenant_name || 'Unknown Tenant',
            team_name: rowBefore.team_name || 'Unknown Team',
            deleted_date: audit.actionTimestamp.toISOString(),
            deleted_by: deletedByUser?.email || deletedByUser?.username || 'Unknown User',
            entity_id: `dag_${rowBefore.id || audit.id}`,
            tenant_id: audit.tenantId.toString(),
            team_id: audit.teamId.toString(),
            dag_name: rowBefore.dag_name,
            dag_schedule: rowBefore.dag_schedule
          });
        }
      }
    });
    
    // Search Table audit records
    Array.from(this.tableAudit.values()).forEach(audit => {
      if (audit.actionType === 'DELETE' && audit.entityName.toLowerCase().includes(entityName.toLowerCase())) {
        const rowBefore = audit.rowBefore as any;
        if (rowBefore) {
          // Get user who deleted the entity
          const deletedByUser = Array.from(this.users.values()).find(user => user.id === audit.actionByUserId);
          
          results.push({
            id: audit.auditUuidId,
            entity_name: audit.entityName,
            entity_type: 'table',
            tenant_name: rowBefore.tenant_name || 'Unknown Tenant',
            team_name: rowBefore.team_name || 'Unknown Team',
            deleted_date: audit.actionTimestamp.toISOString(),
            deleted_by: deletedByUser?.email || deletedByUser?.username || 'Unknown User',
            entity_id: `table_${rowBefore.id || audit.id}`,
            tenant_id: audit.tenantId.toString(),
            team_id: audit.teamId.toString(),
            schema_name: rowBefore.schema_name,
            table_name: rowBefore.table_name,
            table_schedule: rowBefore.table_schedule
          });
        }
      }
    });
    
    return results;
  }
  
  async getDeletedEntitiesByTeamTenant(tenantId: number, teamId: number): Promise<Array<{ id: string; entity_name: string; entity_type: 'dag' | 'table'; tenant_name: string; team_name: string; deleted_date: string; deleted_by: string; entity_id: string; tenant_id: string; team_id: string; schema_name?: string; table_name?: string; table_schedule?: string; dag_name?: string; dag_schedule?: string }>> {
    await this.ensureInitialized();
    const results: Array<{ id: string; entity_name: string; entity_type: 'dag' | 'table'; tenant_name: string; team_name: string; deleted_date: string; deleted_by: string; entity_id: string; tenant_id: string; team_id: string; schema_name?: string; table_name?: string; table_schedule?: string; dag_name?: string; dag_schedule?: string }> = [];
    
    // Search DAG audit records for specific tenant/team
    Array.from(this.dagAudit.values()).forEach(audit => {
      if (audit.actionType === 'DELETE' && audit.tenantId === tenantId && audit.teamId === teamId) {
        const rowBefore = audit.rowBefore as any;
        if (rowBefore) {
          // Get user who deleted the entity
          const deletedByUser = Array.from(this.users.values()).find(user => user.id === audit.actionByUserId);
          
          results.push({
            id: audit.auditUuidId,
            entity_name: audit.entityName,
            entity_type: 'dag',
            tenant_name: rowBefore.tenant_name || 'Unknown Tenant',
            team_name: rowBefore.team_name || 'Unknown Team',
            deleted_date: audit.actionTimestamp.toISOString(),
            deleted_by: deletedByUser?.email || deletedByUser?.username || 'Unknown User',
            entity_id: `dag_${rowBefore.id || audit.id}`,
            tenant_id: audit.tenantId.toString(),
            team_id: audit.teamId.toString(),
            dag_name: rowBefore.dag_name,
            dag_schedule: rowBefore.dag_schedule
          });
        }
      }
    });
    
    // Search Table audit records for specific tenant/team
    Array.from(this.tableAudit.values()).forEach(audit => {
      if (audit.actionType === 'DELETE' && audit.tenantId === tenantId && audit.teamId === teamId) {
        const rowBefore = audit.rowBefore as any;
        if (rowBefore) {
          // Get user who deleted the entity
          const deletedByUser = Array.from(this.users.values()).find(user => user.id === audit.actionByUserId);
          
          results.push({
            id: audit.auditUuidId,
            entity_name: audit.entityName,
            entity_type: 'table',
            tenant_name: rowBefore.tenant_name || 'Unknown Tenant',
            team_name: rowBefore.team_name || 'Unknown Team',
            deleted_date: audit.actionTimestamp.toISOString(),
            deleted_by: deletedByUser?.email || deletedByUser?.username || 'Unknown User',
            entity_id: `table_${rowBefore.id || audit.id}`,
            tenant_id: audit.tenantId.toString(),
            team_id: audit.teamId.toString(),
            schema_name: rowBefore.schema_name,
            table_name: rowBefore.table_name,
            table_schedule: rowBefore.table_schedule
          });
        }
      }
    });
    
    return results;
  }
  
  async performEntityRollback(auditId: string, entityType: 'dag' | 'table'): Promise<Entity | null> {
    await this.ensureInitialized();
    
    let auditRecord: SlaDagAudit | SlaTableAudit | undefined;
    
    // Find the audit record by auditUuidId
    if (entityType === 'dag') {
      auditRecord = Array.from(this.dagAudit.values()).find(audit => audit.auditUuidId === auditId);
    } else {
      auditRecord = Array.from(this.tableAudit.values()).find(audit => audit.auditUuidId === auditId);
    }
    
    if (!auditRecord || auditRecord.actionType !== 'DELETE' || !auditRecord.rowBefore) {
      console.error(`Cannot rollback: Audit record not found or invalid for ${entityType} with auditId ${auditId}`);
      return null;
    }
    
    try {
      const originalEntity = auditRecord.rowBefore as any;
      
      // Create a new entity from the original data
      const restoredEntity: InsertEntity = {
        name: originalEntity.name,
        type: originalEntity.type,
        teamId: originalEntity.teamId,
        description: originalEntity.description,
        slaTarget: originalEntity.slaTarget,
        currentSla: originalEntity.currentSla,
        status: originalEntity.status || 'Pending',
        refreshFrequency: originalEntity.refreshFrequency,
        lastRefreshed: originalEntity.lastRefreshed ? new Date(originalEntity.lastRefreshed) : null,
        nextRefresh: originalEntity.nextRefresh ? new Date(originalEntity.nextRefresh) : null,
        owner: originalEntity.owner,
        ownerEmail: originalEntity.ownerEmail,
        tenant_name: originalEntity.tenant_name,
        team_name: originalEntity.team_name,
        schema_name: originalEntity.schema_name,
        table_name: originalEntity.table_name,
        table_description: originalEntity.table_description,
        table_schedule: originalEntity.table_schedule,
        table_dependency: originalEntity.table_dependency,
        dag_name: originalEntity.dag_name,
        dag_description: originalEntity.dag_description,
        dag_schedule: originalEntity.dag_schedule,
        dag_dependency: originalEntity.dag_dependency,
        server_name: originalEntity.server_name,
        expected_runtime_minutes: originalEntity.expected_runtime_minutes,
        notification_preferences: originalEntity.notification_preferences || [],
        donemarker_location: originalEntity.donemarker_location,
        donemarker_lookback: originalEntity.donemarker_lookback,
        owner_email: originalEntity.owner_email,
        user_email: originalEntity.user_email,
        is_active: true, // Restore as active
        is_entity_owner: originalEntity.is_entity_owner || false,
        lastRun: originalEntity.lastRun ? new Date(originalEntity.lastRun) : null,
        lastStatus: originalEntity.lastStatus
      };
      
      // Create the restored entity
      const newEntity = await this.createEntity(restoredEntity);
      
      console.log(`✅ Successfully rolled back ${entityType} entity: ${originalEntity.name} (new ID: ${newEntity.id})`);
      return newEntity;
      
    } catch (error) {
      console.error(`❌ Failed to rollback ${entityType} entity:`, error);
      return null;
    }
  }

  // Incident operations for AI agent integration
  async createIncident(incident: InsertIncident): Promise<Incident> {
    await this.ensureInitialized();
    
    const newIncident: Incident = {
      ...incident,
      status: incident.status || 'open',
      logsUrl: incident.logsUrl || null,
      ragAnalysis: incident.ragAnalysis || null,
      userEmail: incident.userEmail || null,
      createdAt: new Date(),
      resolvedAt: null,
    };

    this.incidents.set(incident.id, newIncident);
    return newIncident;
  }

  async getIncident(notificationId: string): Promise<Incident | undefined> {
    await this.ensureInitialized();
    return this.incidents.get(notificationId);
  }

  async getEntityByName({ name, type, teamName }: { name: string; type?: Entity['type']; teamName?: string; }): Promise<Entity | undefined> {
    await this.ensureInitialized();

    for (const entity of Array.from(this.entities.values())) {
      if (type && entity.type !== type) continue;
      const identifier = resolveEntityIdentifier(entity, { fallback: entity.name ?? undefined });
      if (identifier !== name) continue;
      if (teamName && entity.team_name !== teamName) continue;
      return entity;
    }

    return undefined;
  }

  async resolveIncident(notificationId: string): Promise<Incident | undefined> {
    await this.ensureInitialized();
    
    const incident = this.incidents.get(notificationId);
    if (incident) {
      const resolvedIncident: Incident = {
        ...incident,
        status: 'resolved',
        resolvedAt: new Date(),
      };
      this.incidents.set(notificationId, resolvedIncident);
      return resolvedIncident;
    }
    
    return undefined;
  }

  // Alert operations for system-wide alerts
  async getAlerts(dateKey?: string): Promise<Alert[]> {
    await this.ensureInitialized();
    
    const alerts = Array.from(this.alertsData.values());
    if (dateKey) {
      return alerts.filter(alert => alert.dateKey === dateKey);
    }
    return alerts;
  }

  async getActiveAlerts(dateKey?: string): Promise<Alert[]> {
    await this.ensureInitialized();
    
    const now = new Date();
    return Array.from(this.alertsData.values()).filter(alert => {
      if (dateKey && alert.dateKey !== dateKey) return false;
      return alert.isActive && (!alert.expiresAt || new Date(alert.expiresAt) > now);
    });
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    await this.ensureInitialized();
    
    const newAlert: Alert = {
      ...alert,
      id: this.alertId++,
      isActive: alert.isActive ?? true,
      expiresAt: alert.expiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.alertsData.set(newAlert.id, newAlert);
    return newAlert;
  }

  async updateAlert(id: number, alert: Partial<Alert>): Promise<Alert | undefined> {
    await this.ensureInitialized();
    
    const existingAlert = this.alertsData.get(id);
    if (!existingAlert) {
      return undefined;
    }

    const updatedAlert: Alert = {
      ...existingAlert,
      ...alert,
      id,
      updatedAt: new Date(),
    };

    this.alertsData.set(id, updatedAlert);
    return updatedAlert;
  }

  async deleteAlert(id: number): Promise<boolean> {
    await this.ensureInitialized();
    
    const exists = this.alertsData.has(id);
    if (exists) {
      this.alertsData.delete(id);
    }
    return exists;
  }

  async deactivateAlert(id: number): Promise<boolean> {
    await this.ensureInitialized();
    
    const alert = this.alertsData.get(id);
    if (!alert) {
      return false;
    }

    const deactivatedAlert: Alert = {
      ...alert,
      isActive: false,
      updatedAt: new Date(),
    };

    this.alertsData.set(id, deactivatedAlert);
    return true;
  }

  // Admin broadcast message operations
  async getAdminBroadcastMessages(dateKey?: string): Promise<AdminBroadcastMessage[]> {
    await this.ensureInitialized();
    
    const messages = Array.from(this.adminBroadcastMessagesData.values());
    if (dateKey) {
      return messages.filter(message => message.dateKey === dateKey);
    }
    return messages;
  }

  async getActiveAdminBroadcastMessages(dateKey?: string): Promise<AdminBroadcastMessage[]> {
    await this.ensureInitialized();
    
    const now = new Date();
    return Array.from(this.adminBroadcastMessagesData.values()).filter(message => {
      if (dateKey && message.dateKey !== dateKey) return false;
      return message.isActive && (!message.expiresAt || new Date(message.expiresAt) > now);
    });
  }

  async createAdminBroadcastMessage(message: InsertAdminBroadcastMessage): Promise<AdminBroadcastMessage> {
    await this.ensureInitialized();
    
    const newMessage: AdminBroadcastMessage = {
      ...message,
      id: this.adminBroadcastMessageId++,
      isActive: message.isActive ?? true,
      expiresAt: message.expiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.adminBroadcastMessagesData.set(newMessage.id, newMessage);
    return newMessage;
  }

  async updateAdminBroadcastMessage(id: number, message: Partial<AdminBroadcastMessage>): Promise<AdminBroadcastMessage | undefined> {
    await this.ensureInitialized();
    
    const existingMessage = this.adminBroadcastMessagesData.get(id);
    if (!existingMessage) {
      return undefined;
    }

    const updatedMessage: AdminBroadcastMessage = {
      ...existingMessage,
      ...message,
      id,
      updatedAt: new Date(),
    };

    this.adminBroadcastMessagesData.set(id, updatedMessage);
    return updatedMessage;
  }

  async deleteAdminBroadcastMessage(id: number): Promise<boolean> {
    await this.ensureInitialized();
    
    const exists = this.adminBroadcastMessagesData.has(id);
    if (exists) {
      this.adminBroadcastMessagesData.delete(id);
    }
    return exists;
  }

  async getAdminBroadcastMessagesForUser(userId: number): Promise<AdminBroadcastMessage[]> {
    await this.ensureInitialized();
    
    const now = new Date();
    const today = new Date().toISOString().split('T')[0];
    
    return Array.from(this.adminBroadcastMessagesData.values()).filter(message => {
      if (!message.isActive || (message.expiresAt && new Date(message.expiresAt) <= now)) {
        return false;
      }
      
      // Include login-triggered messages for today and all immediate messages
      return (message.deliveryType === 'login_triggered' && message.dateKey === today) ||
             message.deliveryType === 'immediate';
    });
  }

  async deactivateAdminBroadcastMessage(id: number): Promise<boolean> {
    await this.ensureInitialized();
    
    const message = this.adminBroadcastMessagesData.get(id);
    if (!message) {
      return false;
    }

    const deactivatedMessage: AdminBroadcastMessage = {
      ...message,
      isActive: false,
      updatedAt: new Date(),
    };

    this.adminBroadcastMessagesData.set(id, deactivatedMessage);
    return true;
  }

  // Entity subscription operations
  async subscribeToNotificationTimeline(subscription: InsertEntitySubscription): Promise<EntitySubscription> {
    await this.ensureInitialized();
    
    // Check if subscription already exists
    const existingSubscription = Array.from(this.entitySubscriptionsData.values()).find(
      sub => sub.userId === subscription.userId && 
             sub.notificationTimelineId === subscription.notificationTimelineId
    );
    
    if (existingSubscription) {
      // If exists but inactive, reactivate it
      if (!existingSubscription.isActive) {
        const updatedSubscription = { ...existingSubscription, isActive: true, updatedAt: new Date() };
        this.entitySubscriptionsData.set(existingSubscription.id, updatedSubscription);
        return updatedSubscription;
      }
      return existingSubscription;
    }

    const newSubscription: EntitySubscription = {
      id: this.subscriptionId++,
      ...subscription,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.entitySubscriptionsData.set(newSubscription.id, newSubscription);
    return newSubscription;
  }

  async unsubscribeFromNotificationTimeline(userId: number, notificationTimelineId: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const subscription = Array.from(this.entitySubscriptionsData.values()).find(
      sub => sub.userId === userId && 
             sub.notificationTimelineId === notificationTimelineId &&
             sub.isActive
    );
    
    if (!subscription) {
      return false;
    }

    // Deactivate subscription instead of deleting
    const updatedSubscription = { ...subscription, isActive: false, updatedAt: new Date() };
    this.entitySubscriptionsData.set(subscription.id, updatedSubscription);
    return true;
  }

  async getUserSubscriptions(userId: number): Promise<EntitySubscription[]> {
    await this.ensureInitialized();
    
    return Array.from(this.entitySubscriptionsData.values()).filter(
      sub => sub.userId === userId && sub.isActive
    );
  }

  async getTimelineSubscriptions(notificationTimelineId: string): Promise<EntitySubscription[]> {
    await this.ensureInitialized();
    
    return Array.from(this.entitySubscriptionsData.values()).filter(
      sub => sub.notificationTimelineId === notificationTimelineId && sub.isActive
    );
  }

  async getSubscriptionCount(notificationTimelineId: string): Promise<number> {
    await this.ensureInitialized();
    
    return Array.from(this.entitySubscriptionsData.values()).filter(
      sub => sub.notificationTimelineId === notificationTimelineId && sub.isActive
    ).length;
  }
}

export const storage = new MemStorage();
