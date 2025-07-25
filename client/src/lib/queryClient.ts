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
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
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
