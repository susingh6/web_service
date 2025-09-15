import { QueryClient } from '@tanstack/react-query';

// Centralized React Query cache keys
export const cacheKeys = {
  entitiesByTenant: (tenant: string) => ['entities', tenant] as const,
  entitiesByTenantAndTeam: (tenant: string, teamId?: number | null) => ['entities', tenant, teamId ?? null] as const,
  entityDetails: (id: number | string, version?: string | number | boolean) => ['entity-details', id, version ?? null] as const,
  dashboardSummary: (tenant: string, teamId?: number | null, start?: string, end?: string) =>
    ['dashboardSummary', tenant, teamId ?? null, start ?? null, end ?? null] as const,
  teamMembers: (tenant: string, teamId?: number | null) => ['teamMembers', tenant, teamId ?? null] as const,
  adminTeams: () => ['/api/teams'] as const,
  adminTenants: () => ['/api/tenants'] as const,
  activeTenants: () => ['/api/tenants', 'active'] as const,
};

// Invalidation helpers
export function invalidateEntityCaches(
  queryClient: QueryClient,
  params: { tenant?: string; teamId?: number | null; entityId?: number | string; startDate?: string; endDate?: string }
) {
  const { tenant, teamId, entityId, startDate, endDate } = params;

  if (tenant) {
    queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenant(tenant) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenantAndTeam(tenant, teamId) });
    queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(tenant, teamId ?? null, startDate, endDate) });
  }
  if (entityId !== undefined) {
    // Invalidate specific entity-details and all versioned variants
    queryClient.invalidateQueries({ queryKey: ['entity-details', entityId as any] });
    queryClient.invalidateQueries({ queryKey: cacheKeys.entityDetails(entityId) });
  }

  // Back-compat invalidations (can be removed once all usages migrate)
  queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
  if (entityId !== undefined) queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId] });
  if (teamId !== undefined && teamId !== null) queryClient.invalidateQueries({ queryKey: ['/api/entities', { teamId }] });
  queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
  // Broadly invalidate all dashboardSummary queries (tenant/team/date variants)
  queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
}

export function invalidateTenantCaches(queryClient: QueryClient, tenant: string) {
  queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenant(tenant) });
  queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(tenant) });
  // Legacy
  queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
  queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
}

export function invalidateAdminCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: cacheKeys.adminTeams() });
  queryClient.invalidateQueries({ queryKey: cacheKeys.adminTenants() });
  queryClient.invalidateQueries({ queryKey: cacheKeys.activeTenants() });
}


