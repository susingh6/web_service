export const devConfig = {
  baseUrl: '',
  endpoints: {
    // Authentication
    auth: {
      login: '/api/login',
      logout: '/api/logout',
      register: '/api/register',
      user: '/api/user',
    },
    
    // Core entities
    entities: '/api/entities',
    teams: '/api/teams',
    
    // Dashboard
    dashboard: {
      summary: '/api/dashboard/summary',
      teamPerformance: '/api/dashboard/team',
      complianceTrend: '/api/dashboard/compliance-trend',
    },
    
    // Entity operations
    entity: {
      byId: (id: number) => `/api/entities/${id}`,
      byTeam: (teamId: number) => `/api/entities?teamId=${teamId}`,
      history: (entityId: number) => `/api/entities/${entityId}/history`,
      issues: (entityId: number) => `/api/entities/${entityId}/issues`,
      details: (entityId: number) => `/api/entities/${entityId}/details`,
    },
    
    // Issues
    issues: {
      resolve: (issueId: number) => `/api/issues/${issueId}/resolve`,
    },
    
    // Debug endpoints
    debug: {
      teams: '/api/debug/teams',
    },
  },
  
  // Development settings
  debug: true,
  logLevel: 'debug',
  enableMockData: true,
}; 