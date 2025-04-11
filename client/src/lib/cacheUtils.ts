// Cache time in milliseconds (6 hours)
export const CACHE_TTL = 6 * 60 * 60 * 1000;

/**
 * Fetches data from API with caching for improved performance and reduced API calls
 * @param url The API URL to fetch from
 * @param cacheKey The key to store the cache under in localStorage
 * @returns A Promise resolving to the array of string values
 */
export const fetchWithCache = async (
  url: string, 
  cacheKey: string
): Promise<string[]> => {
  // Check if we have cached data and if it's still valid
  const cachedData = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);
  
  if (cachedData && cachedTime) {
    const timestamp = parseInt(cachedTime);
    if (Date.now() - timestamp < CACHE_TTL) {
      return JSON.parse(cachedData);
    }
  }
  
  // No valid cache, fetch from API
  try {
    // This is a placeholder for the actual API call
    console.log(`Fetching ${cacheKey} from ${url}`);
    
    // Simulating API response for now
    let mockResponse: string[] = [];
    if (cacheKey === 'tenants') {
      mockResponse = ['Ad Engineering', 'Data Engineering'];
    } else if (cacheKey === 'teams') {
      mockResponse = ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM'];
    } else if (cacheKey === 'dags') {
      mockResponse = ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing'];
    }
    
    // Cache the results
    localStorage.setItem(cacheKey, JSON.stringify(mockResponse));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    
    return mockResponse;
  } catch (error) {
    console.error(`Error fetching ${cacheKey}:`, error);
    return [];
  }
};

/**
 * Retrieves cached data without triggering an API call
 * @param cacheKey The key to retrieve the cache for from localStorage
 * @returns The cached data or default values if cache is not available
 */
export const getFromCache = (cacheKey: string): string[] => {
  const cachedData = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);
  
  if (cachedData && cachedTime) {
    const timestamp = parseInt(cachedTime);
    if (Date.now() - timestamp < CACHE_TTL) {
      return JSON.parse(cachedData);
    }
  }
  
  // Return default values if cache is not available or expired
  if (cacheKey === 'tenants') {
    return ['Ad Engineering', 'Data Engineering'];
  } else if (cacheKey === 'teams') {
    return ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM'];
  } else if (cacheKey === 'dags') {
    return ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing'];
  }
  
  return [];
};