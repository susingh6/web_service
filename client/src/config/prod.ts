// Production environment configuration
export const prodConfig = {
  baseUrl: 'https://api.sla-management.com',
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
  // Add other production-specific settings
  debug: false,
  logLevel: 'error',
  enableMockData: false,
}; 