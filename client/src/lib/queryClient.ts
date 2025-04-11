import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { cacheService, DEFAULT_CACHE_TTL } from "./cacheService";

/**
 * Validates and throws an error if the response is not successful
 * @param res Fetch Response object to validate
 * @throws Error with status code and response text if the response is not ok
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Makes an API request with proper error handling
 * @param method HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param url API endpoint URL
 * @param data Optional data to send in the request body
 * @returns Promise resolving to the Response object
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * Options for the query function
 */
interface QueryFnOptions {
  on401: UnauthorizedBehavior;
  useCache?: boolean;
  cacheTTL?: number;
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * Creates a query function that can be used with React Query
 * Enhanced with caching capabilities
 */
export const getQueryFn: <T>(options: QueryFnOptions) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, useCache = true, cacheTTL = DEFAULT_CACHE_TTL }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    
    // Generate a cache key based on the query key
    const cacheKey = Array.isArray(queryKey) 
      ? queryKey.join('_') 
      : String(queryKey);

    // Try to get from cache first if enabled
    if (useCache && cacheService.has(cacheKey)) {
      try {
        return cacheService.get<any>(cacheKey, null, cacheTTL);
      } catch (error) {
        console.warn(`Error reading from cache for ${cacheKey}:`, error);
        // Continue with fetch if cache read fails
      }
    }
    
    // Make the API request
    const res = await fetch(url, {
      credentials: "include",
    });

    // Handle 401 Unauthorized based on the specified behavior
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    // Throw on other errors
    await throwIfResNotOk(res);
    
    // Parse the response
    const data = await res.json();
    
    // Store in cache if enabled
    if (useCache) {
      cacheService.set(cacheKey, data, cacheTTL);
    }
    
    return data;
  };

/**
 * The central QueryClient instance for the application
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ 
        on401: "throw",
        useCache: true,
        cacheTTL: DEFAULT_CACHE_TTL
      }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: DEFAULT_CACHE_TTL, // Match stale time with cache TTL
      retry: false,
    },
    mutations: {
      retry: false,
      // When a mutation succeeds, related queries should be invalidated
      onSuccess: () => {
        // This will be overridden by specific mutation configs
      }
    },
  },
});

/**
 * Invalidate queries by key pattern
 * @param keyPattern String or regex pattern to match against cache keys
 */
export function invalidateQueriesByPattern(keyPattern: string | RegExp): void {
  // Get all query keys from the query cache
  const queryCache = queryClient.getQueryCache();
  const queries = queryCache.findAll();
  
  // Filter queries by the pattern
  const matchingQueries = queries.filter(query => {
    const queryKeyString = JSON.stringify(query.queryKey);
    return typeof keyPattern === 'string' 
      ? queryKeyString.includes(keyPattern)
      : keyPattern.test(queryKeyString);
  });
  
  // Invalidate matching queries
  matchingQueries.forEach(query => {
    queryClient.invalidateQueries({ queryKey: query.queryKey });
  });
  
  // Also clear the local cache for matching keys
  if (typeof keyPattern === 'string') {
    // If it's a string pattern, look for cache keys containing it
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('cache_') && key.includes(keyPattern)) {
        localStorage.removeItem(key);
      }
    });
  } else {
    // If it's a regex, test each cache key
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('cache_') && keyPattern.test(key)) {
        localStorage.removeItem(key);
      }
    });
  }
}
