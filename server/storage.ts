import { 
  users, type User, type InsertUser,
  teams, type Team, type InsertTeam,
  entities, type Entity, type InsertEntity,
  entityHistory, type EntityHistory, type InsertEntityHistory,
  issues, type Issue, type InsertIssue 
} from "@shared/schema";

// Define the storage interface
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private teams: Map<number, Team>;
  private entities: Map<number, Entity>;
  private entityHistories: Map<number, EntityHistory[]>;
  private entityIssues: Map<number, Issue[]>;
  
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
          // Map the lastStatus to the status field for display in UI
          const statusMap: Record<string, string> = {
            "success": "success", 
            "running": "running",
            "failed": "failed"
          };
          
          const statusValue = dag.lastStatus && statusMap[dag.lastStatus] 
            ? statusMap[dag.lastStatus] 
            : (dag.status || "unknown");
          
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
}

export const storage = new MemStorage();
