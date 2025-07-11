// Cache time in milliseconds (6 hours)
export const CACHE_TTL = 6 * 60 * 60 * 1000;

/**
 * Generic cache function for complex objects
 * @param url The API URL to fetch from
 * @param cacheKey The key to store the cache under in localStorage
 * @returns A Promise resolving to the fetched data
 */
export const fetchWithCacheGeneric = async <T>(
  url: string, 
  cacheKey: string,
  defaultValue?: T
): Promise<T> => {
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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache the results
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    
    return data;
  } catch (error) {
    console.error(`Error fetching ${cacheKey}:`, error);
    // Return type-safe default value or throw error to let caller handle it
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw error;
  }
};



/**
 * Generic function to retrieve cached data without triggering an API call
 * @param cacheKey The key to retrieve the cache for from localStorage
 * @param defaultValue The default value to return if cache is not available
 * @returns The cached data or default value if cache is not available
 */
export const getFromCacheGeneric = <T>(cacheKey: string, defaultValue: T): T => {
  const cachedData = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);
  
  if (cachedData && cachedTime) {
    const timestamp = parseInt(cachedTime);
    if (Date.now() - timestamp < CACHE_TTL) {
      return JSON.parse(cachedData);
    }
  }
  
  return defaultValue;
};



/**
 * Updates cache with new value and adds timestamp
 * @param cacheKey The cache key to update
 * @param newValue The new value to add to the cache
 * @param existingValues Current cached values
 */
export const updateCacheWithNewValue = (
  cacheKey: string, 
  newValue: string, 
  existingValues: string[]
): string[] => {
  if (!existingValues.includes(newValue)) {
    const updatedValues = [...existingValues, newValue];
    localStorage.setItem(cacheKey, JSON.stringify(updatedValues));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    // Cache updated with validated value
    return updatedValues;
  }
  return existingValues;
};