import { fetchWithCacheGeneric, getFromCacheGeneric } from './cacheUtils';

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
 */
export const preloadAllCacheData = async (): Promise<void> => {
  // Preloading cache data for faster modal loading
  
  // Initialize with defaults first for instant access
  initializeDefaultCache();
  
  // Skip API calls for now since we don't have real endpoints configured
  // Just use the default values that were already initialized
  // Cache preloading complete
  
  // TODO: Replace with real API endpoints when backend is fully configured
  // await Promise.all([
  //   fetchWithCache(buildUrl(endpoints.tenants), 'tenants'), 
  //   fetchWithCache(buildUrl(endpoints.teams), 'teams'),
  //   fetchWithCache(buildUrl(endpoints.dags), 'dags'),
  // ]);
};

// Additional function to refresh cache in background
export const refreshCacheInBackground = async (): Promise<void> => {
  // Skip background refresh for now since we don't have real endpoints configured
  // TODO: Replace with real API endpoints when backend is fully configured
  // Background cache refresh skipped - using defaults
};