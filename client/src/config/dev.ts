// Development environment configuration
export const devConfig = {
  baseUrl: 'http://localhost:3001',
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
  // Add other development-specific settings
  debug: true,
  logLevel: 'debug',
  enableMockData: true,