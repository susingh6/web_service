import { 
  users, type User, type InsertUser, type UserRole,
  teams, type Team, type InsertTeam,
  entities, type Entity, type InsertEntity,
  entityHistory, type EntityHistory, type InsertEntityHistory,
  issues, type Issue, type InsertIssue,
  notificationTimelines, type NotificationTimeline, type InsertNotificationTimeline
} from "@shared/schema";

// Tenant interface for tenant management
export interface Tenant {
  id: number;
  name: string;
  description?: string;
}

// Define the storage interface
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  getUserRoles(): Promise<UserRole[]>;
  
  // Team operations
  getTeams(): Promise<Team[]>;
  getTeam(id: number): Promise<Team | undefined>;
  getTeamByName(name: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeamMembers(teamName: string, memberData: any, oauthContext: any): Promise<Team | undefined>;
  
  // Tenant operations
  getTenants(): Promise<Tenant[]>;
  
  // Entity operations
  getEntities(): Promise<Entity[]>;
  getEntity(id: number): Promise<Entity | undefined>;
  getEntitiesByTeam(teamId: number): Promise<Entity[]>;
  getEntitiesByType(type: string): Promise<Entity[]>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  updateEntity(id: number, entity: Partial<Entity>): Promise<Entity | undefined>;
  deleteEntity(id: number): Promise<boolean>;
  
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
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private teams: Map<number, Team>;
  private entities: Map<number, Entity>;
  private entityHistories: Map<number, EntityHistory[]>;
  private entityIssues: Map<number, Issue[]>;
  private notificationTimelines: Map<string, NotificationTimeline>;
  
  private userId: number;
  private teamId: number;
  private entityId: number;
  private historyId: number;
  private issueId: number;
  
  private initializationPromise: Promise<void>;

  constructor() {
    this.users = new Map();
    this.teams = new Map();
    this.entities = new Map();
    this.entityHistories = new Map();
    this.entityIssues = new Map();
    this.notificationTimelines = new Map();
    
    this.userId = 1;
    this.teamId = 1;
    this.entityId = 1;
    this.historyId = 1;
    this.issueId = 1;
    
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
      email: "test@example.com",
      displayName: "Azure Test User",
      team: "Core",
      role: "admin", // Set admin role for test user
      azureObjectId: "test-azure-object-id"
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
        azureObjectId: null
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
        azureObjectId: null
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
        azureObjectId: null
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

    
    // Create demo teams with the new team names and member data
    const teamData = [
      { 
        name: 'PGM', 
        description: 'Platform Growth & Marketing Team',
        tenant_id: 1,
        team_members_ids: ['john.smith', 'sarah.johnson'],
        team_email: ['pgm-team@company.com'],
        team_slack: ['#pgm-team'],
        team_pagerduty: ['pgm-escalation']
      },
      { 
        name: 'Core', 
        description: 'Core Infrastructure Team',
        tenant_id: 1,
        team_members_ids: ['david.wilson', 'michael.brown'],
        team_email: ['core-team@company.com'],
        team_slack: ['#core-infrastructure'],
        team_pagerduty: ['core-escalation']
      },
      { 
        name: 'Viewer Product', 
        description: 'Viewer Product Team',
        tenant_id: 2,
        team_members_ids: ['emily.davis'],
        team_email: ['viewer-product@company.com'],
        team_slack: ['#viewer-product'],
        team_pagerduty: ['viewer-escalation']
      },
      { 
        name: 'IOT', 
        description: 'Internet of Things Team',
        tenant_id: 1,
        team_members_ids: ['alex.chen', 'maria.garcia'],
        team_email: ['iot-team@company.com'],
        team_slack: ['#iot-team'],
        team_pagerduty: ['iot-escalation']
      },
      { 
        name: 'CDM', 
        description: 'Content Delivery & Management Team',
        tenant_id: 1,
        team_members_ids: ['robert.taylor', 'lisa.anderson'],
        team_email: ['cdm-team@company.com'],
        team_slack: ['#cdm-team'],
        team_pagerduty: ['cdm-escalation']
      },
      { 
        name: 'Ad Serving', 
        description: 'Advertisement Serving Team',
        tenant_id: 2,
        team_members_ids: ['carlos.martinez'],
        team_email: ['ad-serving@company.com'],
        team_slack: ['#ad-serving'],
        team_pagerduty: ['ad-serving-escalation']
      },
      { 
        name: 'Ad Data Activation', 
        description: 'Ad Data Activation Team',
        tenant_id: 2,
        team_members_ids: ['ana.rodriguez'],
        team_email: ['ad-data@company.com'],
        team_slack: ['#ad-data-activation'],
        team_pagerduty: ['ad-data-escalation']
      }
    ];

    teamData.forEach(teamInfo => {
      this.createTeam(teamInfo);
    });
    
    // Load mock DAG data using FS instead of require
    await this.loadMockDags();
    
    // Add some table entities with correct statuses
    this.addTableEntities();
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
    const tableEntities = [
      {
        name: 'brightscript_sla_pgm',
        type: 'table',
        teamId: 1, // PGM
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
        description: 'Subscription metrics for CDM team',
        slaTarget: 97.0,
        currentSla: null,
        status: 'Pending',
        refreshFrequency: 'Daily',
        lastRefreshed: null,
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
    const adEngineeringEntities = [
      {
        name: 'ad_performance_daily',
        type: 'table',
        teamId: 6, // Ad Serving team
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
        nextRefresh: entity.lastRefreshed ? new Date(entity.lastRefreshed.getTime() + 24 * 60 * 60 * 1000) : new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        // Set null for fields not provided in entity data, but preserve existing values
        tenant_name: entity.tenant_name || 'Data Engineering', // Use entity's tenant or default to Data Engineering
        team_name: entity.team_name || null,
        schema_name: entity.schema_name || null,
        table_name: entity.table_name || null,
        table_description: entity.table_description || null,
        table_schedule: entity.table_schedule || null,
        table_dependency: entity.table_dependency || null,
        dag_name: null, // Tables don't have DAG fields
        dag_description: null,
        dag_schedule: null,
        dag_dependency: null,
        expected_runtime_minutes: entity.expected_runtime_minutes || null,
        donemarker_location: entity.donemarker_location || null,
        donemarker_lookback: entity.donemarker_lookback || null,
        owner_email: entity.owner_email || null,
        user_email: entity.user_email || null,
        is_active: entity.is_active !== undefined ? entity.is_active : true,
        is_entity_owner: entity.is_entity_owner !== undefined ? entity.is_entity_owner : false,
        lastRun: entity.lastRefreshed,
        lastStatus: entity.status,
        notification_preferences: entity.notification_preferences || []
      };
      this.entities.set(id, fullEntity);
    });

    // Add Ad Engineering entities for testing tenant filtering
    adEngineeringEntities.forEach(entity => {
      const id = this.entityId++;
      const fullEntity: Entity = {
        id,
        ...entity,
        nextRefresh: entity.lastRefreshed ? new Date(entity.lastRefreshed.getTime() + 24 * 60 * 60 * 1000) : new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        // Set type-specific fields
        ...(entity.type === 'table' ? {
          table_name: entity.table_name || entity.name,
          table_description: entity.description || 'Table for ad analytics processing',
          table_schedule: '0 3 * * *', // 3 AM daily
          table_dependency: 'ad_raw_data,user_segments',
          dag_name: null,
          dag_description: null,
          dag_schedule: null,
          dag_dependency: null,
        } : {
          dag_name: entity.dag_name || entity.name,
          dag_description: entity.description || 'DAG for ad optimization processing',
          dag_schedule: '0 3 * * *', // 3 AM daily
          dag_dependency: 'ad_raw_data,campaign_data',
          table_name: null,
          table_description: null,
          table_schedule: null,
          table_dependency: null,
        }),
        // Common fields
        team_name: entity.team_name || null,
        schema_name: entity.schema_name || null,
        expected_runtime_minutes: entity.expected_runtime_minutes || (entity.type === 'table' ? 25 : 40),
        donemarker_location: entity.donemarker_location || (entity.type === 'table' 
          ? 's3://ad-analytics-tables/done_markers/' 
          : 's3://ad-analytics-dags/campaign_optimization/'),
        donemarker_lookback: entity.donemarker_lookback || 2,
        owner_email: entity.ownerEmail || null,
        user_email: entity.ownerEmail || null,
        is_active: entity.is_active !== undefined ? entity.is_active : true,
        is_entity_owner: entity.is_entity_owner !== undefined ? entity.is_entity_owner : false,
        lastRun: entity.lastRefreshed,
        lastStatus: entity.status,
        notification_preferences: entity.notification_preferences || []
      };
      this.entities.set(id, fullEntity);
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
  
  async createUser(insertUser: InsertUser): Promise<User> {
    // Check if user already exists - if so, update instead of creating new
    const existingUser = await this.getUserByUsername(insertUser.username);
    if (existingUser) {
      // Update the existing user
      const updatedUser: User = { ...existingUser, ...insertUser };
      this.users.set(existingUser.id, updatedUser);
      return updatedUser;
    }
    
    // Create a new user
    const id = this.userId++;
    const user: User = { 
      ...insertUser, 
      id,
      // Set null values for optional fields
      email: insertUser.email || null,
      displayName: insertUser.displayName || null,
      team: insertUser.team || null
    };
    this.users.set(id, user);
    return user;
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
    // Return predefined user roles for notification system
    return [
      {
        role: 'admin',
        label: 'Administrator',
        description: 'System administrators with full access'
      },
      {
        role: 'manager',
        label: 'Team Manager',
        description: 'Team leads and managers'
      },
      {
        role: 'lead',
        label: 'Technical Lead',
        description: 'Senior technical staff and project leads'
      },
      {
        role: 'developer',
        label: 'Developer',
        description: 'Software developers and engineers'
      },
      {
        role: 'analyst',
        label: 'Data Analyst',
        description: 'Data analysts and business intelligence staff'
      },
      {
        role: 'ops',
        label: 'Operations',
        description: 'DevOps and infrastructure team members'
      }
    ];
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
      team_members_ids: insertTeam.team_members_ids || [],
      team_email: insertTeam.team_email || [],
      team_slack: insertTeam.team_slack || [],
      team_pagerduty: insertTeam.team_pagerduty || [],
      team_notify_preference_id: insertTeam.team_notify_preference_id || null
    };
    this.teams.set(id, team);
    return team;
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
          // Convert user ID to username for removal
          const user = await this.getUser(parseInt(memberId));
          if (user) {
            updatedMembers = updatedMembers.filter(username => username !== user.username);
          }
        }
        break;
      case 'update':
        // For update, we maintain the same member list but the member data would be updated elsewhere
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
  
  // Tenant operations
  async getTenants(): Promise<Tenant[]> {
    // Return predefined tenant values for demo purposes
    return [
      {
        id: 1,
        name: 'Data Engineering',
        description: 'Data Engineering team and related entities'
      },
      {
        id: 2,
        name: 'Ad Engineering',
        description: 'Ad Engineering team and related entities'
      }
    ];
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
      lastRefreshed: insertEntity.lastRefreshed || null
    };
    this.entities.set(id, entity);
    return entity;
  }
  
  async updateEntity(id: number, updates: Partial<Entity>): Promise<Entity | undefined> {
    const entity = this.entities.get(id);
    if (!entity) return undefined;
    
    const updatedEntity = { 
      ...entity, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.entities.set(id, updatedEntity);
    return updatedEntity;
  }
  
  async deleteEntity(id: number): Promise<boolean> {
    return this.entities.delete(id);
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
    for (const [entityId, issues] of this.entityIssues.entries()) {
      const issueIndex = issues.findIndex(issue => issue.id === id);
      if (issueIndex !== -1) {
        const issue = issues[issueIndex];
        const resolvedIssue = {
          ...issue,
          resolved: true,
          resolvedAt: new Date()
        };
        issues[issueIndex] = resolvedIssue;
        this.entityIssues.set(entityId, issues);
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
      ...insertTimeline,
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
    return this.notificationTimelines.delete(id);
  }
}

export const storage = new MemStorage();
