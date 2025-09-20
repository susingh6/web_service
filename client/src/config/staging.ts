// Staging environment configuration
export const stagingConfig = {
  baseUrl: 'https://staging-api.sla-management.com',
  endpoints: {
    // Authentication - FastAPI only (no Express fallback in staging)
    auth: {
      login: '/api/v1/auth/login',
      logout: '/api/v1/auth/logout',
      register: '/api/v1/auth/register',
      user: '/api/v1/auth/user',
      azureValidate: '/api/v1/auth/azure/validate',
    },
    
    // Core entities - FastAPI (type-specific endpoints)
    entities: '/api/v1/entities', // Legacy unified endpoint
    entitiesBulk: '/api/v1/entities/bulk', // Legacy bulk endpoint
    tables: '/api/v1/tables', // Tables endpoint
    tablesBulk: '/api/v1/tables/bulk', // Tables bulk endpoint
    tablesDelete: (entityName: string) => `/api/v1/tables/${entityName}`, // Tables delete by entity_name
    tablesUpdate: (entityName: string) => `/api/v1/tables/${entityName}`, // Tables update by entity_name
    tablesGet: (entityName: string) => `/api/v1/tables/${entityName}`, // Tables get by entity_name
    tablesOwnerUpdate: (entityName: string) => `/api/v1/tables/${entityName}/owner`, // Tables owner update by entity_name
    dags: '/api/v1/dags', // DAGs endpoint
    dagsBulk: '/api/v1/dags/bulk', // DAGs bulk endpoint
    dagsDelete: (entityName: string) => `/api/v1/dags/${entityName}`, // DAGs delete by entity_name
    dagsUpdate: (entityName: string) => `/api/v1/dags/${entityName}`, // DAGs update by entity_name
    dagsGet: (entityName: string) => `/api/v1/dags/${entityName}`, // DAGs get by entity_name
    dagsOwnerUpdate: (entityName: string) => `/api/v1/dags/${entityName}/owner`, // DAGs owner update by entity_name
    teams: '/api/v1/teams',
    
    // Dashboard - FastAPI
    dashboard: {
      summary: '/api/v1/dashboard/summary',
      teamPerformance: (teamId: number) => `/api/v1/dashboard/team/${teamId}`,
      complianceTrend: '/api/v1/dashboard/compliance-trend',
    },
    
    // Entity operations
    entity: {
      byId: (id: number) => `/api/v1/entities/${id}`,
      byTeam: (teamId: number) => `/api/v1/entities?teamId=${teamId}`,
      history: (entityId: number) => `/api/v1/entities/${entityId}/history`,
      issues: (entityId: number) => `/api/v1/entities/${entityId}/issues`,
      details: (entityId: number) => `/api/entities/${entityId}/details`,
      tasks: (entityId: number) => `/api/v1/entities/${entityId}/tasks`,
      notificationTimelines: (entityId: number) => `/api/v1/entities/${entityId}/notification-timelines`,
      trends30Day: '/api/v1/entities/trends/30-day',
      delete: (id: number) => `/api/v1/entities/${id}`,
      currentDagSettings: (teamName: string, entityName: string) => `/api/v1/dags/current-settings?team=${teamName}&name=${entityName}`,
      currentTableSettings: (teamName: string, entityName: string) => `/api/v1/tables/current-settings?team=${teamName}&name=${entityName}`,
      historyChanges: (entityId: number) => `/api/v1/entities/${entityId}/history-changes`,
      
      // New endpoints for entity details modal
      ownerAndSlaSettings: (entityType: string, teamName: string, entityName: string) => 
        `/api/v1/teams/${teamName}/${entityType}/${entityName}/owner_sla_settings`,
      slaStatusHistory: (entityType: string, teamName: string, entityName: string) => 
        `/api/v1/teams/${teamName}/${entityType}/${entityName}/sla_status_30days`,
      recentSettingsChanges: (entityType: string, teamName: string, entityName: string) => 
        `/api/v1/teams/${teamName}/${entityType}/${entityName}/settings_changes`,
    },

    // Task operations
    tasks: {
      byDag: (dagId: number) => `/api/v1/dags/${dagId}/tasks`,
      updatePriority: (taskId: number) => `/api/v1/tasks/${taskId}`,
      // New endpoints for comprehensive task management
      getAll: '/api/v1/get_tasks',
      updatePreference: (taskId: number) => `/api/v1/tasks/${taskId}/preference`,
    },
    
    // Issues
    issues: {
      resolve: (issueId: number) => `/api/v1/issues/${issueId}/resolve`,
    },
    
    // Notification Timelines
    notificationTimelines: {
      create: '/api/v1/notification-timelines',
      byId: (id: string) => `/api/v1/notification-timelines/${id}`,
      update: (id: string) => `/api/v1/notification-timelines/${id}`,
      delete: (id: string) => `/api/v1/notification-timelines/${id}`,
    },
    
    // Debug endpoints
    debug: {
      teams: '/api/v1/debug/teams',
    },

    // Agent workspace endpoints
    agent: {
      conversationSummaries: (dagId: number) => `/api/v1/agent/conversations/summaries/${dagId}`,
      fullConversation: (conversationId: string) => `/api/v1/agent/conversations/${conversationId}`,
      sendMessage: (dagId: number) => `/api/v1/agent/conversations/${dagId}/send`,
    },

    // Missing properties from dev config
    tenants: '/api/v1/tenants',
    teamDetails: (teamName: string) => `/api/v1/get_team_details/${teamName}`,
    teamMembers: (teamName: string) => `/api/v1/teams/${teamName}/members`,

    users: {
      getAll: '/api/v1/get_user',
      getTeamMembers: (teamName: string) => `/api/v1/get_team_members/${teamName}`,
    },

    admin: {
      conflicts: {
        getAll: '/api/v1/conflicts',
        getById: (notificationId: string) => `/api/v1/conflicts/${notificationId}`,
        resolve: (notificationId: string) => `/api/v1/conflicts/${notificationId}/resolve`,
        create: '/api/v1/conflicts',
      },
      teams: {
        create: '/api/v1/teams',
        update: (teamId: number) => `/api/v1/teams/${teamId}`,
        disable: (teamId: number) => `/api/v1/teams/${teamId}/disable`,
        enable: (teamId: number) => `/api/v1/teams/${teamId}/enable`,
      },
      tenants: {
        create: '/api/v1/tenants',
        getAll: '/api/v1/tenants',
        update: (tenantId: number) => `/api/v1/tenants/${tenantId}`,
        disable: (tenantId: number) => `/api/v1/tenants/${tenantId}/disable`,
      },
      users: {
        getAll: '/api/v1/users',
        create: '/api/v1/users',
        update: (userId: number) => `/api/v1/users/${userId}`,
        disable: (userId: number) => `/api/v1/users/${userId}/disable`,
        enable: (userId: number) => `/api/v1/users/${userId}/enable`,
      },
      roles: {
        getAll: '/api/v1/roles',
        create: '/api/v1/roles',
        update: (roleId: number) => `/api/v1/roles/${roleId}`,
      },
    },
    
    // Audit and rollback endpoints - FastAPI only
    audit: {
      getDeletedEntitiesByName: (entityName: string) => `/api/v1/audit/entity-name?entity_name=${entityName}`,
      getDeletedEntitiesByTeamTenant: (tenantId: number, teamId: number) => `/api/v1/audit/team-tenant?tenant_id=${tenantId}&team_id=${teamId}`,
      performRollback: '/api/v1/audit/rollback',
    },
  },

  // Cache configuration
  cacheConfig: {
    tenantRefreshHours: 6,
    entityRefreshHours: 6,
    trendRefreshHours: 6,
    cacheStatus: '/api/v1/cache/status',
    cacheRefresh: '/api/v1/cache/refresh',
    incrementalUpdate: '/api/v1/cache/incremental-update',
    recentChanges: '/api/v1/cache/recent-changes',
  },

  // WebSocket configuration
  websocket: {
    path: '/ws',
    events: {
      cacheUpdated: 'cache-updated',
      entityUpdated: 'entity-updated',
      entitiesUpdated: 'entities-updated',
      teamMembersUpdated: 'team-members-updated',
      echoToOrigin: 'echo-to-origin',
    },
    features: {
      enableEchoToOrigin: true,
      enableEventVersioning: true,
      multiTabSubscriptions: true,
    },
  },
  
  // SLA Compliance Color Thresholds
  slaColorThresholds: {
    green: {
      min: 90, // 90% and above shows green
    },
    amber: {
      min: 75, // 75% to 89% shows amber/orange
      max: 89,
    },
    red: {
      max: 74, // Below 75% shows red
    },
  },
  
  // Staging settings
  debug: false,
  logLevel: 'info',
  enableMockData: false,
  
  // Mock data flags - Independent control for different features
  mock: {
    entities: false,
    dashboard: false,
    teams: false,
    tasks: false,
    notifications: false,
    agent: false, // Separate flag for agent workspace data
  },
}; 