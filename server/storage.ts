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
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

// Type alias for deleted entity results from audit logs
export interface DeletedEntityResult {
  id: string;
  entity_name: string;
  entity_type: Entity['type'];
  tenant_name: string;
  team_name: string;
  deleted_date: string;
  deleted_by: string;
  entity_id: string;
  tenant_id: string;
  team_id: string;
  schema_name?: string;
  table_name?: string;
  table_schedule?: string;
  dag_name?: string;
  dag_schedule?: string;
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
  getDeletedEntitiesByName(entityName: string): Promise<DeletedEntityResult[]>;
  getDeletedEntitiesByTeamTenant(tenantId: number, teamId: number): Promise<DeletedEntityResult[]>;
  performEntityRollback(auditId: string, entityType: Entity['type']): Promise<Entity | null>;
  
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
  
  // Helper to load JSON mock data files synchronously to avoid async issues
  private loadJsonFileSync<T>(filename: string): T | null {
    const filePath = join(process.cwd(), 'server', 'data', filename);
    
    if (!existsSync(filePath)) {
      console.warn(`[loadJsonFileSync] JSON file not found: ${filePath}`);
      return null;
    }
    
    try {
      const content = readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      return data;
    } catch (error) {
      console.error(`[loadJsonFileSync] Failed to load ${filename}:`, error);
      return null;
    }
  }
  
  private async initDemoData() {
    
    // Load users from JSON file
    const mockUsers = this.loadJsonFileSync<any[]>('mock-users.json') || [];

    // Create all mock users
    for (const userData of mockUsers) {
      await this.createUser(userData);
    }

    // Load tenants from JSON file
    const tenantData = this.loadJsonFileSync<any[]>('mock-tenants.json') || [];

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
    
    // Load teams from JSON file
    const teamData = this.loadJsonFileSync<any[]>('mock-teams.json') || [];

    for (const teamInfo of teamData) {
      // Convert tenant_name to tenant_id by looking up the tenant
      let tenant_id = 1; // Default to first tenant
      if (teamInfo.tenant_name) {
        const tenant = Array.from(this.tenants.values()).find(t => t.name === teamInfo.tenant_name);
        if (tenant) {
          tenant_id = tenant.id;
        }
      }
      
      // Create team with tenant_id instead of tenant_name
      const { tenant_name, ...teamDataWithoutTenantName } = teamInfo;
      await this.createTeam({
        ...teamDataWithoutTenantName,
        tenant_id
      } as unknown as InsertTeam);
    }

    // Calculate and update team counts for tenants after teams are created
    this.updateTenantTeamCounts();
    
    // Initialize mock roles data
    this.initMockRoles();
    
    // Initialize mock permissions data
    this.initMockPermissions();
    
    // Load all mock entities (tables and DAGs) from unified JSON file
    this.loadMockEntities();
    
    // Initialize mock audit data for rollback management
    this.initMockAuditData();
    
    // Initialize mock alert and admin broadcast message data
    this.initMockAlertData();
  }
  
  /**
   * Load all mock entities (tables, DAGs, etc.) from unified JSON file
   */
  private async loadMockEntities(): Promise<void> {
    try {
      const mockEntities = this.loadJsonFileSync<any[]>('mock-entities.json') || [];
      
      if (mockEntities && Array.isArray(mockEntities)) {
        // Update entity ID counter based on existing IDs
        const entitiesWithIds = mockEntities.filter(e => e.id);
        if (entitiesWithIds.length > 0) {
          const maxId = Math.max(...entitiesWithIds.map(e => e.id));
          this.entityId = Math.max(this.entityId, maxId + 1);
        }
        
        // Count entities by type for logging
        const entityCounts: Record<string, number> = {};
        
        // Process all entities generically
        mockEntities.forEach(entityData => {
          const entityType = entityData.type;
          entityCounts[entityType] = (entityCounts[entityType] || 0) + 1;
          
          // Look up teamId from team_name if needed
          let teamId = entityData.teamId || 1;
          if (!entityData.teamId && entityData.team_name) {
            const team = Array.from(this.teams.values()).find(t => t.name === entityData.team_name);
            if (team) {
              teamId = team.id;
            }
          }
          
          // Generate entity ID
          const entityId = entityData.id || this.entityId++;
          
          // Create entity with all fields, using spread and specific overrides
          this.entities.set(entityId, {
            ...entityData,
            id: entityId,
            type: entityType,
            teamId: teamId,
            status: entityData.status || 'Pending',
            tenant_name: entityData.tenant_name || 'Unknown',
            team_name: entityData.team_name || 'Unknown',
            description: entityData.description || null,
            currentSla: entityData.currentSla || null,
            is_entity_owner: entityData.is_entity_owner || false,
            is_active: entityData.is_active !== false,
            createdAt: entityData.createdAt ? new Date(entityData.createdAt) : new Date(),
            updatedAt: entityData.updatedAt ? new Date(entityData.updatedAt) : new Date(),
            lastRun: entityData.lastRun ? new Date(entityData.lastRun) : null,
            lastRefreshed: entityData.lastRefreshed ? new Date(entityData.lastRefreshed) : 
                          (entityData.lastRun ? new Date(entityData.lastRun) : null)
          } as Entity);
        });
        
        // Log summary
        const summary = Object.entries(entityCounts)
          .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
          .join(', ');
      }
    } catch (error) {
      console.error('Failed to load mock entities data:', error);
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

  async getTeamMembers(teamName: string, tenantName?: string): Promise<User[]> {
    await this.ensureInitialized();
    
    // Find team by tenant + name for proper multi-tenant isolation
    let team: Team | undefined;
    if (tenantName) {
      // Look up tenant by name first
      const tenant = Array.from(this.tenants.values()).find(t => t.name === tenantName);
      if (tenant) {
        // Find team matching both tenant_id and name
        team = Array.from(this.teams.values()).find(t => 
          t.name === teamName && t.tenant_id === tenant.id
        );
      }
    } else {
      // Fallback to name-only lookup for backward compatibility
      team = await this.getTeamByName(teamName);
    }
    
    if (!team || !team.team_members_ids) {
      return [];
    }
    
    const allUsers = await this.getUsers();
    return allUsers.filter(user => team!.team_members_ids!.includes(user.username));
  }

  async getUserRoles(): Promise<UserRole[]> {
    // Load user roles from JSON file
    const mockRoles = this.loadJsonFileSync<UserRole[]>('mock-user-roles.json') || [];
    return mockRoles;
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
    await this.ensureInitialized();
    
    // CRITICAL: Must find team by BOTH name AND tenant to support multi-tenant isolation
    // First, get the tenant_id from the tenant name (with fallback for backwards compatibility)
    let team: Team | undefined;
    
    if (oauthContext.tenant) {
      const tenant = Array.from(this.tenants.values()).find(t => t.name === oauthContext.tenant);
      if (tenant) {
        // Find team by name AND tenant_id for proper multi-tenant isolation
        team = Array.from(this.teams.values()).find(t => 
          t.name === teamName && t.tenant_id === tenant.id
        );
      }
    }
    
    // Fallback: if tenant not found or team not found, try finding by name only
    if (!team) {
      team = await this.getTeamByName(teamName);
    }
    
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
    // Load DAG audit data from JSON file
    const dagAuditData = this.loadJsonFileSync<any[]>('mock-dag-audit.json');
    if (dagAuditData && Array.isArray(dagAuditData)) {
      dagAuditData.forEach((auditData: any) => {
        const audit = {
          ...auditData,
          actionType: auditData.actionType as 'DELETE',
          actionTimestamp: new Date(auditData.createdAt)
        };
        this.dagAudit.set(audit.id, audit);
        // Update ID counter to avoid collisions
        this.dagAuditId = Math.max(this.dagAuditId, audit.id + 1);
      });
    } else {
      console.warn('[initMockAuditData] No DAG audit data loaded from JSON');
    }
    
    // Load Table audit data from JSON file
    const tableAuditData = this.loadJsonFileSync<any[]>('mock-table-audit.json');
    if (tableAuditData && Array.isArray(tableAuditData)) {
      tableAuditData.forEach((auditData: any) => {
        const audit = {
          ...auditData,
          actionType: auditData.actionType as 'DELETE',
          actionTimestamp: new Date(auditData.createdAt)
        };
        this.tableAudit.set(audit.id, audit);
        // Update ID counter to avoid collisions
        this.tableAuditId = Math.max(this.tableAuditId, audit.id + 1);
      });
    } else {
      console.warn('[initMockAuditData] No Table audit data loaded from JSON');
    }
  }

  /**
   * Initialize mock roles data
   */
  private initMockRoles(): void {
    const now = new Date();
    
    // Load roles from JSON file (mock-user-roles.json)
    const mockRoles = this.loadJsonFileSync<any[]>('mock-user-roles.json') || [];
    
    if (mockRoles.length === 0) {
      console.warn('[Storage] No roles loaded from mock-user-roles.json');
      return;
    }

    // Create all roles with incremental IDs
    mockRoles.forEach((roleData, index) => {
      const role: Role = {
        id: index + 1,
        role_name: roleData.role,
        description: roleData.description,
        is_active: roleData.status === 'active',
        is_system_role: roleData.team_name ? false : true, // Team-specific roles are not system roles
        role_permissions: roleData.role_permissions || [], // Load permissions from JSON
        team_name: roleData.team_name || null, // Team-specific or null for system-wide roles
        tenant_name: roleData.tenant_name || null, // Tenant-specific or null for system-wide roles
        createdAt: now,
        updatedAt: now
      };
      this.rolesData.set(role.role_name, role);
    });
    
    this.rolesVersion = mockRoles.length + 1;
  }

  /**
   * Initialize mock permissions data
   */
  private initMockPermissions(): void {
    const now = new Date();
    
    // Load permissions from JSON file
    const mockPermissions = this.loadJsonFileSync<any[]>('mock-permissions.json') || [];
    
    if (mockPermissions.length === 0) {
      console.warn('[Storage] No permissions loaded from mock-permissions.json');
      return;
    }

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
    // Load alerts from JSON file
    const mockAlerts = this.loadJsonFileSync<any[]>('mock-alerts.json') || [];

    // Store mock alerts
    mockAlerts.forEach(alertData => {
      const alert = {
        ...alertData,
        id: this.alertId++,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: alertData.expiresAt ? new Date(alertData.expiresAt) : null
      };
      this.alertsData.set(alert.id, alert);
    });
    

    // Load broadcast messages from JSON file
    const mockBroadcastMessages = this.loadJsonFileSync<any[]>('mock-broadcast-messages.json') || [];

    // Store mock admin broadcast messages
    mockBroadcastMessages.forEach(messageData => {
      const message = {
        ...messageData,
        id: this.adminBroadcastMessageId++,
        createdAt: messageData.createdAt ? new Date(messageData.createdAt) : new Date(),
        updatedAt: messageData.updatedAt ? new Date(messageData.updatedAt) : new Date(),
        expiresAt: messageData.expiresAt ? new Date(messageData.expiresAt) : null
      };
      this.adminBroadcastMessagesData.set(message.id, message);
    });
    
  }
  
  // Audit operations for rollback management
  async getDeletedEntitiesByName(entityName: string): Promise<DeletedEntityResult[]> {
    await this.ensureInitialized();
    const results: DeletedEntityResult[] = [];
    
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
  
  async getDeletedEntitiesByTeamTenant(tenantId: number, teamId: number): Promise<DeletedEntityResult[]> {
    await this.ensureInitialized();
    const results: DeletedEntityResult[] = [];
    
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
  
  async performEntityRollback(auditId: string, entityType: Entity['type']): Promise<Entity | null> {
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

  async getConflicts(): Promise<any[]> {
    // Load conflicts from JSON file when Redis is not available
    const mockConflicts = this.loadJsonFileSync<any[]>('mock-conflicts.json');
    
    if (!mockConflicts || mockConflicts.length === 0) {
      console.warn('[Storage] No conflicts loaded from mock-conflicts.json');
      return [];
    }
    
    // Convert date strings to Date objects
    return mockConflicts.map(conflict => ({
      ...conflict,
      createdAt: conflict.createdAt ? new Date(conflict.createdAt) : new Date(),
      resolvedAt: conflict.resolvedAt ? new Date(conflict.resolvedAt) : null
    }));
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
    
    // Use timestamp-based ID to avoid collisions across server restarts
    const timestampId = Date.now();
    
    const newMessage: AdminBroadcastMessage = {
      ...message,
      id: timestampId,
      isActive: message.isActive ?? true,
      expiresAt: message.expiresAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.adminBroadcastMessagesData.set(newMessage.id, newMessage);
    // Update counter to be higher than timestamp to avoid conflicts with auto-increment
    this.adminBroadcastMessageId = Math.max(this.adminBroadcastMessageId, timestampId + 1);
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
      
      // Include login-triggered messages for today, immediate messages, and immediate_and_login_triggered
      return (message.deliveryType === 'login_triggered' && message.dateKey === today) ||
             message.deliveryType === 'immediate' ||
             message.deliveryType === 'immediate_and_login_triggered';
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
