// Staging environment configuration
export const stagingConfig = {
  baseUrl: 'https://staging-api.sla-management.com',
  endpoints: {
    entities: '/api/entities',
    teams: '/api/teams',
    dags: '/api/dags',
    tables: '/api/tables',
    dashboard: {
      summary: '/api/dashboard/summary',
      teamPerformance: '/api/dashboard/team',
      complianceTrend: '/api/dashboard/compliance-trend',
    },
  },
  // Add other staging-specific settings
  debug: false,
  logLevel: 'info',
  enableMockData: false,
}; 