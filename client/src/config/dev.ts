export const devConfig = {
  baseUrl: '', // Use relative URLs to match the current domain and port (5000)
  
  endpoints: {
    // Authentication - FastAPI primary, Express fallback
    auth: {
      // FastAPI endpoints (primary)
      login: '/api/v1/auth/login',
      logout: '/api/v1/auth/logout',
      register: '/api/v1/auth/register',
      user: '/api/v1/auth/user',
      azureValidate: '/api/v1/auth/azure/validate',
      
      // Express fallback endpoints
      loginFallback: '/api/login',
      logoutFallback: '/api/logout',
      registerFallback: '/api/register',
      userFallback: '/api/user',
      azureValidateFallback: '/api/auth/azure/validate',
    },
    
    // Core entities - FastAPI
    entities: '/api/v1/entities',
    teams: '/api/teams',
    tenants: '/api/v1/tenants',
    teamDetails: (teamName: string) => `/api/v1/get_team_details/${teamName}`,
    teamMembers: (teamName: string) => `/api/v1/teams/${teamName}/members`,
    
    // User endpoints - FastAPI
    users: {
      getAll: '/api/v1/get_user',
      getTeamMembers: (teamName: string) => `/api/v1/get_team_members/${teamName}`,
    },
    
    // Dashboard - FastAPI
    dashboard: {
      summary: '/api/dashboard/summary',
      teamPerformance: (teamId: number) => `/api/v1/dashboard/team/${teamId}`,
      complianceTrend: '/api/v1/dashboard/compliance-trend',
    },
    
    // Entity operations - FastAPI
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
      
      // New endpoints for entity details modal - FastAPI
      ownerAndSlaSettings: (entityType: string, teamName: string, entityName: string) => 
        `/api/v1/teams/${teamName}/${entityType}/${entityName}/owner_sla_settings`,
      slaStatusHistory: (entityType: string, teamName: string, entityName: string) => 
        `/api/v1/teams/${teamName}/${entityType}/${entityName}/sla_status_30days`,
      recentSettingsChanges: (entityType: string, teamName: string, entityName: string) => 
        `/api/v1/teams/${teamName}/${entityType}/${entityName}/settings_changes`,
      updateOwner: (entityId: number) => `/api/v1/entities/${entityId}/owner`,
    },

    // Task operations - FastAPI
    tasks: {
      byDag: (dagId: number) => `/api/v1/dags/${dagId}/tasks`,
      updatePriority: (taskId: number) => `/api/v1/tasks/${taskId}`,
    },
    
    // Issues - FastAPI
    issues: {
      resolve: (issueId: number) => `/api/v1/issues/${issueId}/resolve`,
    },
    
    // Notification Timelines - FastAPI
    notificationTimelines: {
      create: '/api/v1/notification-timelines',
      byId: (id: string) => `/api/v1/notification-timelines/${id}`,
      update: (id: string) => `/api/v1/notification-timelines/${id}`,
      delete: (id: string) => `/api/v1/notification-timelines/${id}`,
    },
    
    // Debug endpoints - FastAPI
    debug: {
      teams: '/api/v1/debug/teams',
    },

    // Incident management endpoints - FastAPI
    incidents: {
      register: '/api/v1/incidents/register',
      getByNotificationId: (notificationId: string) => `/api/v1/incidents/${notificationId}`,
      resolve: (notificationId: string) => `/api/v1/incidents/${notificationId}/resolve`,
    },

    // Agent workspace endpoints - FastAPI with incident support
    agent: {
      conversationSummaries: (dagId: number) => `/api/v1/agent/conversations/summaries/${dagId}`,
      fullConversation: (conversationId: string) => `/api/v1/agent/conversations/${conversationId}`,
      sendMessage: (dagId: number) => `/api/v1/agent/conversations/${dagId}/send`,
      // Enhanced agent endpoint with incident context and OAuth claims
      chatWithIncident: (dagId: number) => `/api/v1/agent/dags/${dagId}/chat`,
      // Direct FastAPI agent endpoint for real conversations
      chat: (dagId: number) => `/api/v1/agent/chat/${dagId}`,
      // Conversation persistence endpoints
      loadHistory: (dagId: number) => `/api/v1/agent/conversations/${dagId}/recent`,
      saveConversation: (dagId: number) => `/api/v1/agent/conversations/${dagId}/save`,
    },
    
    // Admin endpoints - FastAPI with role-based access control
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
    
    // Audit and rollback endpoints - FastAPI with Express fallbacks
    audit: {
      // FastAPI endpoints (primary)
      getDeletedEntitiesByName: (entityName: string) => `/api/v1/audit/entity-name?entity_name=${entityName}`,
      getDeletedEntitiesByTeamTenant: (tenantId: number, teamId: number) => `/api/v1/audit/team-tenant?tenant_id=${tenantId}&team_id=${teamId}`,
      performRollback: '/api/v1/audit/rollback',
      
      // Express fallback endpoints
      getDeletedEntitiesByNameFallback: (entityName: string) => `/api/audit/entity-name?entity_name=${entityName}`,
      getDeletedEntitiesByTeamTenantFallback: (tenantId: number, teamId: number) => `/api/audit/team-tenant?tenant_id=${tenantId}&team_id=${teamId}`,
      performRollbackFallback: '/api/audit/rollback',
    },
    
    // FastAPI backend endpoints
    fastapi: {
      baseUrl: 'http://localhost:8080',
      auth: {
        login: '/api/v1/auth/login',
        logout: '/api/v1/auth/logout',
      },
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
  
  // Cache configuration - FastAPI
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
  
  // Development settings
  debug: true,
  logLevel: 'debug',
  enableMockData: true,
  
  // Mock data flags - Independent control for different features
  mock: {
    entities: true,
    dashboard: true,
    teams: true,
    tasks: true,
    notifications: true,
    agent: false, // Turn off mock mode - use real FastAPI
  },
  
  // FastAPI Integration Control
  fastApiIntegration: {
    enabled: false, // Set to true when ready to use FastAPI instead of mock data
    endpoints: {
      allEntitiesPresets: '/all_entities/presets',
      complianceTrends: '/all_entities/compliance_trends',
      customDateRange: '/all_entities/custom_range', // For custom date ranges
    },
  },
}; 