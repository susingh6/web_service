import { config, buildUrl } from '@/config';
import { fetchWithCacheGeneric, getFromCacheGeneric } from './cacheUtils';

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
 * @returns Promise<Tenant[]>
 */
export const fetchTenants = async (): Promise<Tenant[]> => {
  try {
    const url = buildUrl(config.endpoints.tenants);
    const customTTL = getTenantCacheTTL();
    
    // Now using actual API call to fetch tenants from backend
    return await fetchWithCacheGeneric<Tenant[]>(
      url,
      TENANT_CACHE_KEY,
      DEFAULT_TENANTS
    );
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