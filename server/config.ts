// Application configuration 

// Determine if we're running in test mode
const testMode = process.env.NODE_ENV === 'test' || process.env.USE_MOCK_DATA === 'true';

// Configuration object
export const config = {
  // Application mode
  testMode,
  
  // Data sources
  mockDataPath: './data',
  
  // Cache configuration
  cache: {
    // Cache refresh interval in hours (configurable)
    refreshIntervalHours: 6,
    
    // Default data range for cached metrics
    defaultDataRangeDays: 30,
  },
  
  // Service account authentication configuration
  serviceAccount: {
    // Service account client ID (from Kubernetes secrets in production)
    clientId: process.env.SERVICE_CLIENT_ID || '',
    
    // Service account client secret (from Kubernetes secrets in production)
    clientSecret: process.env.SERVICE_CLIENT_SECRET || '',
    
    // FastAPI base URL for service authentication
    fastApiBaseUrl: process.env.FASTAPI_BASE_URL || 'http://localhost:8080',
    
    // Session expiry warning threshold (5.5 hours)
    sessionExpiryWarningMs: 5.5 * 60 * 60 * 1000,
    
    // Session total expiry (6 hours)
    sessionExpiryMs: 6 * 60 * 60 * 1000,
    
    // Check if service account is properly configured
    isConfigured: () => {
      return !!(process.env.SERVICE_CLIENT_ID && process.env.SERVICE_CLIENT_SECRET);
    }
  },
  
  // Log test mode status on startup
  logTestMode: () => {
    if (testMode) {
      // Running in TEST MODE - using mock data
    }
  }
};