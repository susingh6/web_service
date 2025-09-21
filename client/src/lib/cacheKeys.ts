import { QueryClient } from '@tanstack/react-query';

// Centralized React Query cache keys
export const cacheKeys = {
  entitiesByTenant: (tenant: string) => ['entities', tenant] as const,
  entitiesByTenantAndTeam: (tenant: string, teamId?: number | null) => ['entities', tenant, teamId ?? null] as const,
  entityDetails: (id: number | string, version?: string | number | boolean) => ['entity-details', id, version ?? null] as const,
  // New entity_name-based cache keys
  entityDetailsByName: (entityName: string, teamName: string, entityType: string, version?: string | number | boolean) => 
    ['entity-details-by-name', entityName, teamName, entityType, version ?? null] as const,
  dashboardSummary: (tenant: string, teamId?: number | null, start?: string, end?: string) =>
    ['dashboardSummary', tenant, teamId === undefined ? 'global' : teamId, start ?? null, end ?? null] as const,
  teamMembers: (tenant: string, teamId?: number | null) => ['teamMembers', tenant, teamId ?? null] as const,
  adminTeams: () => ['/api/teams'] as const,
  adminTenants: () => ['/api/tenants'] as const,
  activeTenants: () => ['/api/tenants', 'active'] as const,
};

// Invalidation helpers
export function invalidateEntityCaches(
  queryClient: QueryClient,
  params: { 
    tenant?: string; 
    teamId?: number | null; 
    entityId?: number | string; 
    entityName?: string;
    teamName?: string;
    entityType?: string;
    startDate?: string; 
    endDate?: string;
  }
) {
  const { tenant, teamId, entityId, entityName, teamName, entityType, startDate, endDate } = params;

  if (tenant) {
    queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenant(tenant) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenantAndTeam(tenant, teamId) });
    // Invalidate both team-specific and global summaries
    queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(tenant, teamId, startDate, endDate) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(tenant, undefined, startDate, endDate) });
  }
  
  // Invalidate id-based cache keys (existing behavior)
  if (entityId !== undefined) {
    // Invalidate specific entity-details and all versioned variants
    queryClient.invalidateQueries({ queryKey: ['entity-details', entityId as any] });
    queryClient.invalidateQueries({ queryKey: cacheKeys.entityDetails(entityId) });
  }
  
  // Invalidate entity_name-based cache keys (NEW)
  if (entityName && teamName && entityType) {
    queryClient.invalidateQueries({ queryKey: ['entity-details-by-name', entityName, teamName, entityType] });
    queryClient.invalidateQueries({ queryKey: cacheKeys.entityDetailsByName(entityName, teamName, entityType) });
  }

  // Legacy invalidations removed - using targeted cache keys only
  
  // Emit custom event for Redux-based components (like Summary dashboard) to refresh
  window.dispatchEvent(new CustomEvent('dashboard-data-updated', { 
    detail: { tenant, teamId, entityId, entityName, teamName, entityType, source: 'entity-mutation' } 
  }));
}

export function invalidateTenantCaches(queryClient: QueryClient, tenant: string) {
  queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenant(tenant) });
  queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(tenant) });
}

export function invalidateAdminCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: cacheKeys.adminTeams() });
  queryClient.invalidateQueries({ queryKey: cacheKeys.adminTenants() });
  queryClient.invalidateQueries({ queryKey: cacheKeys.activeTenants() });
  
  // CRITICAL: Invalidate the specific admin panel cache keys
  queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
  // Conflicts
  queryClient.invalidateQueries({ queryKey: ['admin', 'conflicts'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'conflicts', 'v2'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'conflicts', 'overview'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
  queryClient.invalidateQueries({ queryKey: ['notifications', 'alerts'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'broadcast-messages'] });
}


