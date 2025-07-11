export const devConfig = {
  baseUrl: '',
  endpoints: {
    // Authentication - FastAPI endpoints
    auth: {
      login: '/api/v1/auth/login',
      logout: '/api/v1/auth/logout',
      register: '/api/register',
      user: '/api/user',
      validate: '/api/v1/auth/validate',
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
  
  // Development settings
  debug: true,
  logLevel: 'debug',
  enableMockData: true,
  
  // Azure Authentication Configuration
  azure: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: import.meta.env.VITE_AZURE_AUTHORITY || '',
    scopes: ['User.Read', 'profile', 'openid', 'email'],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin + '/auth',
  },
  
  // FastAPI Authentication Configuration
  fastapi: {
    baseUrl: import.meta.env.VITE_FASTAPI_BASE_URL || 'http://localhost:8080',
    clientId: import.meta.env.VITE_FASTAPI_CLIENT_ID || '',
    clientSecret: import.meta.env.VITE_FASTAPI_CLIENT_SECRET || '',
  },
}; 