import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Build headers with session ID for RBAC enforcement
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // CRITICAL: Add FastAPI session headers for RBAC enforcement
  // The server expects comprehensive session context, not just session ID
  const sessionId = localStorage.getItem('fastapi_session_id');
  const userData = localStorage.getItem('fastapi_user');
  
  if (sessionId && userData) {
    try {
      const user = JSON.parse(userData);
      
      // Send all headers expected by server middleware
      headers["X-Session-ID"] = sessionId;
      headers["X-User-ID"] = String(user.user_id || '');
      headers["X-User-Email"] = user.email || '';
      headers["X-Session-Type"] = user.type || 'client_credentials';
      headers["X-User-Roles"] = Array.isArray(user.roles) ? user.roles.join(',') : (user.roles || '');
      headers["X-User-Name"] = user.name || '';
      
      // Optional headers
      if (user.notification_id) {
        headers["X-Notification-ID"] = user.notification_id;
      }
    } catch (error) {
      console.warn('Failed to parse user data for headers:', error);
      // Fallback to just session ID
      headers["X-Session-ID"] = sessionId;
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // Keep for Express session cookies as fallback
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build headers with session ID for RBAC enforcement
    const headers: Record<string, string> = {};
    
    // CRITICAL: Add FastAPI session headers for RBAC enforcement
    // The server expects comprehensive session context, not just session ID
    const sessionId = localStorage.getItem('fastapi_session_id');
    const userData = localStorage.getItem('fastapi_user');
    
    if (sessionId && userData) {
      try {
        const user = JSON.parse(userData);
        
        // Send all headers expected by server middleware
        headers["X-Session-ID"] = sessionId;
        headers["X-User-ID"] = String(user.user_id || '');
        headers["X-User-Email"] = user.email || '';
        headers["X-Session-Type"] = user.type || 'client_credentials';
        headers["X-User-Roles"] = Array.isArray(user.roles) ? user.roles.join(',') : (user.roles || '');
        headers["X-User-Name"] = user.name || '';
        
        // Optional headers
        if (user.notification_id) {
          headers["X-Notification-ID"] = user.notification_id;
        }
      } catch (error) {
        console.warn('Failed to parse user data for headers:', error);
        // Fallback to just session ID
        headers["X-Session-ID"] = sessionId;
      }
    }
    
    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include", // Keep for Express session cookies as fallback
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes instead of Infinity
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Helper function to clear all cache
export const clearAllCache = () => {
  queryClient.clear();
};

// Helper function to invalidate specific cache keys
export const invalidateCache = (keys: string[]) => {
  keys.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
};

// Helper function to refresh common cache keys
export const refreshDashboardCache = () => {
  const commonKeys = [
    '/api/dashboard/summary',
    '/api/entities',
    '/api/teams',
    '/api/tenants',
    '/api/cache/status'
  ];
  invalidateCache(commonKeys);
  console.log('Frontend cache refreshed for dashboard data');
};

// Make it available globally for browser console access
if (typeof window !== 'undefined') {
  (window as any).refreshCache = refreshDashboardCache;
  (window as any).clearAllCache = clearAllCache;
}
