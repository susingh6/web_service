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
 */
export const preloadAllCacheData = async (): Promise<void> => {
  console.log('Preloading cache data for faster modal loading...');
  
  // Initialize with defaults first for instant access
  initializeDefaultCache();
  
  try {
    // Then load from API in parallel to update the cache with real data if needed
    await Promise.all([
      fetchWithCache('https://api.example.com/tenants', 'tenants'), 
      fetchWithCache('https://api.example.com/teams', 'teams'),
      fetchWithCache('https://api.example.com/dags', 'dags'),
    ]);
    
    console.log('Cache preloading complete');
  } catch (error) {
    console.error('Error preloading cache:', error);
    // Don't block app startup if preloading fails - we already have defaults
  }
};

// Additional function to refresh cache in background
export const refreshCacheInBackground = async (): Promise<void> => {
  try {
    // We do this silently in the background to avoid blocking UI
    await Promise.all([
      fetchWithCache('https://api.example.com/tenants', 'tenants'),
      fetchWithCache('https://api.example.com/teams', 'teams'),
      fetchWithCache('https://api.example.com/dags', 'dags'),
    ]);
  } catch (error) {
    console.error('Background cache refresh error:', error);
  }
};