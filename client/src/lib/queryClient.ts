import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { cacheService, DEFAULT_CACHE_TTL } from "./cacheService";
import { ApiErrorResponse, ApiSuccessResponse } from "@shared/api-types";
import { extractData, isApiErrorResponse } from "./apiResponseUtils";

/**
 * Interface for standardized API responses
 */
interface StandardAPIResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]> | string[];
  code?: string;
}

/**
 * Validates and throws an error if the response is not successful
 * @param res Fetch Response object to validate
 * @throws Error with formatted error message if the response is not ok
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      // Try to parse as JSON first
      const errorData = await res.json();
      
      // Extract the error message depending on the format
      let errorMessage: string;
      
      if (isApiErrorResponse(errorData)) {
        // Use standardized API error message
        errorMessage = errorData.message;
      } else if (typeof errorData === 'object' && errorData !== null && 'message' in errorData) {
        // Handle legacy error format with message field
        errorMessage = String(errorData.message);
      } else {
        // Fallback
        errorMessage = `Error ${res.status}: ${res.statusText}`;
      }
      
      throw new Error(errorMessage);
    } catch (parseError) {
      // Fallback to plain text if JSON parsing fails
      const text = await res.text() || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
  }
}

/**
 * Makes an API request with proper error handling
 * @param method HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param url API endpoint URL
 * @param data Optional data to send in the request body
 * @param options Additional options for the request
 * @returns Promise resolving to the Response object
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: {
    extractData?: boolean; // Whether to extract .data from the standard response
  }
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // For methods like DELETE that might return 204 No Content
  if (res.status === 204) {
    return res;
  }
  
  // Clone the response to avoid consuming it
  const clonedRes = res.clone();
  
  // If extractData option is enabled, modify the response prototype to
  // provide a json() method that automatically extracts data from any response format
  if (options?.extractData) {
    const originalJson = res.json.bind(res);
    
    // Override the json method to extract data using our utility
    res.json = async function<T>() {
      const responseJson = await originalJson();
      return extractData<T>(responseJson);
    };
  }
  
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
    const responseJson = await res.json();
    
    // Use our utility to extract data from any response format
    const data = extractData(responseJson);
    
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
