import { 
  users, type User, type InsertUser, type UserRole,
  teams, type Team, type InsertTeam,
  entities, type Entity, type InsertEntity,
  entityHistory, type EntityHistory, type InsertEntityHistory,
  issues, type Issue, type InsertIssue,
  notificationTimelines, type NotificationTimeline, type InsertNotificationTimeline
} from "@shared/schema";

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
    // We need to handle async initialization differently
    // since constructors can't be async
    this.initDemoData().catch(err => {
      console.error('Error initializing demo data:', err);
    });
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
      team: "Core"
    });
    
    // Create demo teams with the new team names
    const teamNames = ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM'];
    teamNames.forEach(name => {
      this.createTeam({
        name,
        description: `Team responsible for ${name.toLowerCase()} data and analytics`
      });
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
        console.log(`Loading ${mockDags.length} mock DAGs from data file...`);
        
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
            lastRefreshed: dag.lastRun ? new Date(dag.lastRun) : null
          });
        });
        
        console.log(`Successfully loaded ${mockDags.length} mock DAGs into storage.`);
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
        schema_name: 'abc',
        table_name: 'agg_channel_brightscript_error_daily'
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
        ownerEmail: 'jane.doe@company.com',
        schema_name: 'abc',
        table_name: 'agg_accounts_channel_ux_daily'
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
        table_name: 'agg_account_device_subscription_daily'
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
        ownerEmail: 'sarah.wilson@company.com',
        schema_name: 'abc',
        table_name: 'agg_iot_device_channel_daily'
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
        table_name: 'agg_subscription_revenue_daily'
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
        tenant_name: entity.tenant_name || null,
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
    return Array.from(this.users.values());
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
      description: insertTeam.description || null
    };
    this.teams.set(id, team);
    return team;
  }
  
  // Entity operations
  async getEntities(): Promise<Entity[]> {
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
