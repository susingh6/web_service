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
  
  // Log test mode status on startup
  logTestMode: () => {
    if (testMode) {
      console.log('🧪 Running in TEST MODE - using mock data');
    }
  }
};