/**
 * 30-Day Trend Cache System
 * Independent of global date filter with 6-hour refresh cycle
 */

interface TrendData {
  entityId: number;
  trend: number;
  icon: 'up' | 'down' | 'flat';
  color: 'success' | 'error' | 'warning';
  lastUpdated: string;
}

interface TrendCacheEntry {
  data: TrendData[];
  timestamp: number;
}

const CACHE_KEY = 'sla_30day_trends';
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

// Request deduplication - prevent multiple simultaneous API calls
let pendingRequest: Promise<TrendData[]> | null = null;

/**
 * Get 30-day trend data from cache or fetch fresh data
 */
export async function get30DayTrends(): Promise<TrendData[]> {
  const cached = getCachedTrends();
  
  if (cached && !isCacheExpired(cached.timestamp)) {
    console.log('Using cached 30-day trend data');
    return cached.data;
  }
  
  // If there's already a pending request, wait for it instead of making a new one
  if (pendingRequest) {
    console.log('Waiting for pending trend request to complete');
    return await pendingRequest;
  }
  
  console.log('Cache expired or missing, fetching fresh 30-day trend data');
  pendingRequest = fetchAndCache30DayTrends();
  
  try {
    const result = await pendingRequest;
    return result;
  } finally {
    // Clear the pending request once it's done
    pendingRequest = null;
  }
}

/**
 * Get trend data for a specific entity
 */
export async function getEntityTrend(entityId: number): Promise<TrendData | null> {
  const trends = await get30DayTrends();
  return trends.find(trend => trend.entityId === entityId) || null;
}

/**
 * Force refresh of 30-day trend cache
 */
export async function refresh30DayTrends(): Promise<TrendData[]> {
  console.log('Force refreshing 30-day trend cache');
  return await fetchAndCache30DayTrends();
}

/**
 * Check if cache is expired
 */
function isCacheExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_DURATION;
}

/**
 * Get cached trend data
 */
function getCachedTrends(): TrendCacheEntry | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached) as TrendCacheEntry;
    return parsed;
  } catch (error) {
    console.error('Error reading trend cache:', error);
    return null;
  }
}

/**
 * Fetch fresh 30-day trend data and cache it
 */
async function fetchAndCache30DayTrends(): Promise<TrendData[]> {
  try {
    // Import centralized endpoints
    const { endpoints } = await import('@/config');
    
    // Fetch 30-day trends from API (independent of global date filter)
    const response = await fetch(endpoints.entity.trends30Day);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trends: ${response.status}`);
    }
    
    const trends: TrendData[] = await response.json();
    
    // Cache the data
    const cacheEntry: TrendCacheEntry = {
      data: trends,
      timestamp: Date.now()
    };
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
    
    console.log(`Cached 30-day trends for ${trends.length} entities`);
    return trends;
    
  } catch (error) {
    console.error('Error fetching 30-day trends:', error);
    
    // Return cached data if available, even if expired
    const cached = getCachedTrends();
    if (cached) {
      console.log('API failed, using expired cache data');
      return cached.data;
    }
    
    // Return empty array if no cache available
    console.log('No cache available, returning empty trends');
    return [];
  }
}

/**
 * Clear the trend cache (for testing/debugging)
 */
export function clearTrendCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('30-day trend cache cleared');
}

/**
 * Get cache info for debugging
 */
export function getTrendCacheInfo(): { isExpired: boolean; lastUpdated: string | null; entryCount: number } {
  const cached = getCachedTrends();
  
  if (!cached) {
    return { isExpired: true, lastUpdated: null, entryCount: 0 };
  }
  
  return {
    isExpired: isCacheExpired(cached.timestamp),
    lastUpdated: new Date(cached.timestamp).toLocaleString(),
    entryCount: cached.data.length
  };
}