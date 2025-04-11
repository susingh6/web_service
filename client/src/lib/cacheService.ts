/**
 * Unified Caching Service
 * 
 * This module provides a centralized cache management system for the application.
 * It handles:
 * - Reading/writing to localStorage with proper error handling
 * - TTL (Time To Live) for cache entries
 * - Type-safe access to cached data
 * - Background refreshing of cached data
 */

// Default cache time-to-live (6 hours)
export const DEFAULT_CACHE_TTL = 6 * 60 * 60 * 1000;

// Cache entry interface
interface CacheEntry<T> {
  timestamp: number;
  data: T;
  ttl: number;
}

/**
 * CacheService class that provides methods to interact with the browser's localStorage
 */
class CacheService {
  /**
   * Get data from cache if available and not expired
   * @param key The cache key
   * @param defaultValue Value to return if cache is empty or expired
   * @param ttl Time-to-live in milliseconds (optional)
   * @returns The cached value or the default value
   */
  get<T>(key: string, defaultValue: T, ttl = DEFAULT_CACHE_TTL): T {
    try {
      const cacheJson = localStorage.getItem(`cache_${key}`);
      if (!cacheJson) {
        return defaultValue;
      }

      const cache = JSON.parse(cacheJson) as CacheEntry<T>;
      const now = Date.now();

      // Check if cache has expired
      if (now - cache.timestamp > cache.ttl) {
        // Cache expired, return default value
        console.log(`Cache expired for ${key}`);
        return defaultValue;
      }

      return cache.data;
    } catch (error) {
      console.error(`Error reading cache for ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Store data in the cache
   * @param key The cache key
   * @param data The data to store
   * @param ttl Time-to-live in milliseconds (optional)
   */
  set<T>(key: string, data: T, ttl = DEFAULT_CACHE_TTL): void {
    try {
      const cacheEntry: CacheEntry<T> = {
        timestamp: Date.now(),
        data,
        ttl
      };
      localStorage.setItem(`cache_${key}`, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error(`Error writing to cache for ${key}:`, error);
    }
  }

  /**
   * Check if a cache entry exists and is valid
   * @param key The cache key to check
   * @returns True if valid cache exists, false otherwise
   */
  has(key: string): boolean {
    try {
      const cacheJson = localStorage.getItem(`cache_${key}`);
      if (!cacheJson) {
        return false;
      }

      const cache = JSON.parse(cacheJson) as CacheEntry<unknown>;
      const now = Date.now();
      
      // Check if cache has expired
      return now - cache.timestamp <= cache.ttl;
    } catch (error) {
      console.error(`Error checking cache for ${key}:`, error);
      return false;
    }
  }

  /**
   * Remove a specific cache entry
   * @param key The cache key to remove
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(`cache_${key}`);
    } catch (error) {
      console.error(`Error removing cache for ${key}:`, error);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('cache_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Fetch data with caching
   * @param url API URL to fetch from
   * @param cacheKey Key to store the cache under
   * @param defaultValue Default value if cache is empty/expired and API call fails
   * @param ttl Time-to-live in milliseconds (optional)
   * @returns Promise resolving to the data
   */
  async fetchWithCache<T>(
    url: string, 
    cacheKey: string, 
    defaultValue: T,
    ttl = DEFAULT_CACHE_TTL
  ): Promise<T> {
    try {
      // First try to get from cache
      if (this.has(cacheKey)) {
        const cachedData = this.get<T>(cacheKey, defaultValue, ttl);
        
        // Refresh cache in background if it's close to expiring (75% of TTL)
        const cacheJson = localStorage.getItem(`cache_${cacheKey}`);
        if (cacheJson) {
          const cache = JSON.parse(cacheJson) as CacheEntry<T>;
          const now = Date.now();
          const cacheAge = now - cache.timestamp;
          
          if (cacheAge > (ttl * 0.75)) {
            console.log(`Background refreshing cache for ${cacheKey}`);
            this.refreshCacheInBackground(url, cacheKey, ttl);
          }
        }
        
        return cachedData;
      }

      // If not in cache or expired, fetch from API
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      // Store in cache
      this.set(cacheKey, data, ttl);
      return data as T;
    } catch (error) {
      console.error(`Error fetching ${url} with cache ${cacheKey}:`, error);
      
      // If we have expired cache data, use it as fallback
      const cacheJson = localStorage.getItem(`cache_${cacheKey}`);
      if (cacheJson) {
        try {
          const cache = JSON.parse(cacheJson) as CacheEntry<T>;
          console.warn(`Using expired cache as fallback for ${cacheKey}`);
          return cache.data;
        } catch (parseError) {
          console.error(`Error parsing expired cache:`, parseError);
        }
      }
      
      return defaultValue;
    }
  }

  /**
   * Refresh cache in background without blocking the current operation
   * @param url API URL to fetch from
   * @param cacheKey Key to store the cache under
   * @param ttl Time-to-live in milliseconds
   */
  private async refreshCacheInBackground<T>(
    url: string, 
    cacheKey: string,
    ttl = DEFAULT_CACHE_TTL
  ): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      this.set(cacheKey, data, ttl);
      console.log(`Successfully refreshed cache for ${cacheKey} in background`);
    } catch (error) {
      console.error(`Background cache refresh failed for ${cacheKey}:`, error);
      // Fail silently as this is a background operation
    }
  }
}

// Create a singleton instance
export const cacheService = new CacheService();

// For convenience, export methods from the singleton
export const { get, set, has, remove, clear, fetchWithCache } = cacheService;