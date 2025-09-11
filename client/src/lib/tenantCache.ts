import { config, buildUrl } from '@/config';
import { fetchWithCacheGeneric, getFromCacheGeneric } from './cacheUtils';
import { tenantsApi } from '@/features/sla/api';

export interface Tenant {
  id: number;
  name: string;
  description?: string;
}

// Cache key constants
const TENANT_CACHE_KEY = 'tenant_cache';

// Default tenant values
const DEFAULT_TENANTS: Tenant[] = [
  { id: 1, name: 'Data Engineering', description: 'Data Engineering team and related entities' },
  { id: 2, name: 'Ad Engineering', description: 'Ad Engineering team and related entities' },
];

// Calculate cache TTL based on configuration
const getTenantCacheTTL = (): number => {
  return config.cacheConfig.tenantRefreshHours * 60 * 60 * 1000; // Convert hours to milliseconds
};

/**
 * Fetch tenants from API with caching
 * @param activeOnly Whether to fetch only active tenants (for dashboard filtering)
 * @returns Promise<Tenant[]>
 */
export const fetchTenants = async (activeOnly?: boolean): Promise<Tenant[]> => {
  try {
    // Use environment-aware tenant API instead of direct URL
    return await tenantsApi.getAll(activeOnly);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    return DEFAULT_TENANTS;
  }
};

/**
 * Get tenants from cache without API call
 * @returns Tenant[]
 */
export const getTenants = (): Tenant[] => {
  return getFromCacheGeneric<Tenant[]>(TENANT_CACHE_KEY, DEFAULT_TENANTS);
};

/**
 * Get default selected tenant
 * @returns Tenant
 */
export const getDefaultTenant = (): Tenant => {
  const tenants = getTenants();
  return tenants.find(t => t.name === 'Data Engineering') || tenants[0];
};

/**
 * Fetch only active tenants for dashboard filtering
 * @returns Promise<Tenant[]>
 */
export const fetchActiveTenants = async (): Promise<Tenant[]> => {
  try {
    return await tenantsApi.getAll(true); // active_only=true
  } catch (error) {
    console.error('Error fetching active tenants:', error);
    return DEFAULT_TENANTS;
  }
};

/**
 * Preload tenant cache for faster loading
 * @returns Promise<void>
 */
export const preloadTenantCache = async (): Promise<void> => {
  try {
    await fetchTenants();
  } catch (error) {
    console.error('Error preloading tenant cache:', error);
  }
};