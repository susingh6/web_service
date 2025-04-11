import { fetchWithCache, getFromCache } from './cacheUtils';

// Default values to ensure consistency across the application
const DEFAULT_TENANTS = ['Ad Engineering', 'Data Engineering'];
const DEFAULT_TEAMS = ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM'];
const DEFAULT_DAGS = ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing'];

/**
 * Creates initial cache entries even before API calls to ensure fast first render
 */
const initializeDefaultCache = (): void => {
  // Only initialize if no cache exists
  if (!localStorage.getItem('tenants')) {
    localStorage.setItem('tenants', JSON.stringify(DEFAULT_TENANTS));
    localStorage.setItem('tenants_time', Date.now().toString());
  }
  
  if (!localStorage.getItem('teams')) {
    localStorage.setItem('teams', JSON.stringify(DEFAULT_TEAMS));
    localStorage.setItem('teams_time', Date.now().toString());
  }
  
  if (!localStorage.getItem('dags')) {
    localStorage.setItem('dags', JSON.stringify(DEFAULT_DAGS));
    localStorage.setItem('dags_time', Date.now().toString());
  }
};

/**
 * Preloads all cache data on application startup
 * This ensures that modals open quickly without needing to fetch data
 * Just sets up initial local data, no API calls at first load
 */
export const preloadAllCacheData = async (): Promise<void> => {
  console.log('Initializing cache data with default values...');
  
  // Initialize with defaults for instant access - no API calls on startup
  initializeDefaultCache();
  console.log('Cache initialization complete');
};

// Additional function to refresh cache in background
export const refreshCacheInBackground = async (): Promise<void> => {
  try {
    // We do this silently in the background to avoid blocking UI
    await Promise.all([
      fetchWithCache('/api/tenants', 'tenants'),
      fetchWithCache('/api/teams', 'teams'),
      fetchWithCache('/api/dags', 'dags'),
    ]);
  } catch (error) {
    console.error('Background cache refresh error:', error);
  }
};