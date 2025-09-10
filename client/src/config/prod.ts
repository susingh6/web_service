export const prodConfig = {
  baseUrl: 'https://api.sla-management.com',
  endpoints: {
    // Authentication
    auth: {
      login: '/api/login',
      logout: '/api/logout',
      register: '/api/register',
      user: '/api/user',
      azureValidate: '/api/auth/azure/validate',
    },
    
    // Core entities
    entities: '/api/entities',
    teams: '/api/teams',
    
    // Dashboard
    dashboard: {
      summary: '/api/dashboard/summary',
      teamPerformance: (teamId: number) => `/api/dashboard/team/${teamId}`,
      complianceTrend: '/api/dashboard/compliance-trend',
    },
    
    // Entity operations
    entity: {
      byId: (id: number) => `/api/entities/${id}`,
      byTeam: (teamId: number) => `/api/entities?teamId=${teamId}`,
      history: (entityId: number) => `/api/entities/${entityId}/history`,
      issues: (entityId: number) => `/api/entities/${entityId}/issues`,
      details: (entityId: number) => `/api/entities/${entityId}/details`,
      tasks: (entityId: number) => `/api/entities/${entityId}/tasks`,
      notificationTimelines: (entityId: number) => `/api/entities/${entityId}/notification-timelines`,
      trends30Day: '/api/entities/trends/30-day',
      delete: (id: number) => `/api/entities/${id}`,
      currentDagSettings: (teamName: string, entityName: string) => `/api/dags/current-settings?team=${teamName}&name=${entityName}`,
      currentTableSettings: (teamName: string, entityName: string) => `/api/tables/current-settings?team=${teamName}&name=${entityName}`,
      historyChanges: (entityId: number) => `/api/entities/${entityId}/history-changes`,
      
      // New endpoints for entity details modal
      ownerAndSlaSettings: (entityType: string, teamName: string, entityName: string) => 
        `/api/teams/${teamName}/${entityType}/${entityName}/owner_sla_settings`,
      slaStatusHistory: (entityType: string, teamName: string, entityName: string) => 
        `/api/teams/${teamName}/${entityType}/${entityName}/sla_status_30days`,
      recentSettingsChanges: (entityType: string, teamName: string, entityName: string) => 
        `/api/teams/${teamName}/${entityType}/${entityName}/settings_changes`,
    },

    // Task operations
    tasks: {
      byDag: (dagId: number) => `/api/dags/${dagId}/tasks`,
      updatePriority: (taskId: number) => `/api/tasks/${taskId}`,
    },
    
    // Issues
    issues: {
      resolve: (issueId: number) => `/api/issues/${issueId}/resolve`,
    },
    
    // Notification Timelines
    notificationTimelines: {
      create: '/api/notification-timelines',
      byId: (id: string) => `/api/notification-timelines/${id}`,
      update: (id: string) => `/api/notification-timelines/${id}`,
      delete: (id: string) => `/api/notification-timelines/${id}`,
    },
    
    // Debug endpoints
    debug: {
      teams: '/api/debug/teams',
    },

    // Agent workspace endpoints
    agent: {
      conversationSummaries: (dagId: number) => `/api/agent/conversations/summaries/${dagId}`,
      fullConversation: (conversationId: string) => `/api/agent/conversations/${conversationId}`,
      sendMessage: (dagId: number) => `/api/agent/conversations/${dagId}/send`,
    },

    // Missing properties from dev config
    tenants: '/api/tenants',
    teamDetails: (teamName: string) => `/api/get_team_details/${teamName}`,
    teamMembers: (teamName: string) => `/api/teams/${teamName}/members`,

    users: {
      getAll: '/api/get_user',
      getTeamMembers: (teamName: string) => `/api/get_team_members/${teamName}`,
    },

    admin: {
      conflicts: {
        getAll: 'http://localhost:8080/api/v1/conflicts',
        getById: (notificationId: string) => `http://localhost:8080/api/v1/conflicts/${notificationId}`,
        resolve: (notificationId: string) => `http://localhost:8080/api/v1/conflicts/${notificationId}/resolve`,
        create: 'http://localhost:8080/api/v1/conflicts',
      },
      teams: {
        create: 'http://localhost:8080/api/v1/teams',
        update: (teamId: number) => `http://localhost:8080/api/v1/teams/${teamId}`,
        disable: (teamId: number) => `http://localhost:8080/api/v1/teams/${teamId}/disable`,
        enable: (teamId: number) => `http://localhost:8080/api/v1/teams/${teamId}/enable`,
      },
      tenants: {
        create: 'http://localhost:8080/api/v1/tenants',
        getAll: 'http://localhost:8080/api/v1/tenants',
        update: (tenantId: number) => `http://localhost:8080/api/v1/tenants/${tenantId}`,
        disable: (tenantId: number) => `http://localhost:8080/api/v1/tenants/${tenantId}/disable`,
      },
      users: {
        getAll: 'http://localhost:8080/api/v1/users',
        create: 'http://localhost:8080/api/v1/users',
        update: (userId: number) => `http://localhost:8080/api/v1/users/${userId}`,
        disable: (userId: number) => `http://localhost:8080/api/v1/users/${userId}/disable`,
        enable: (userId: number) => `http://localhost:8080/api/v1/users/${userId}/enable`,
      },
      roles: {
        getAll: 'http://localhost:8080/api/v1/roles',
        create: 'http://localhost:8080/api/v1/roles',
        update: (roleId: number) => `http://localhost:8080/api/v1/roles/${roleId}`,
      },
    },
  },

  // Cache configuration
  cacheConfig: {
    tenantRefreshHours: 6,
    entityRefreshHours: 6,
    trendRefreshHours: 6,
    cacheStatus: '/api/cache/status',
    cacheRefresh: '/api/cache/refresh',
    incrementalUpdate: '/api/cache/incremental-update',
    recentChanges: '/api/cache/recent-changes',
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
  
  // Production settings
  debug: false,
  logLevel: 'error',
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