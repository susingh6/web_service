/**
 * Cache utilities for notification system data
 * Implements 6-hour cache TTL for users and roles data
 */

import { fetchWithCacheGeneric, getFromCacheGeneric } from '@/lib/cacheUtils';
import { SystemUser, UserRole } from './types';
import { endpoints } from '@/config';

// Cache keys for notification-related data
export const CACHE_KEYS = {
  USERS: 'notification_users',
  ROLES: 'notification_roles',
  SLACK_CHANNELS: 'slack_channels',
} as const;

/**
 * Get cached users or fetch from API
 */
export const getCachedUsers = async (): Promise<SystemUser[]> => {
  try {
    const result = await fetchWithCacheGeneric<SystemUser[]>('/api/users', CACHE_KEYS.USERS);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error fetching cached users:', error);
    return [];
  }
};

/**
 * Get cached roles or fetch from API
 */
export const getCachedRoles = async (): Promise<UserRole[]> => {
  try {
    const result = await fetchWithCacheGeneric<UserRole[]>('/api/users/roles', CACHE_KEYS.ROLES);
    return Array.isArray(result) ? result : getDefaultRoles();
  } catch (error) {
    console.error('Error fetching cached roles:', error);
    return getDefaultRoles();
  }
};

/**
 * Get users from cache without API call
 */
export const getUsersFromCache = (): SystemUser[] => {
  return getFromCacheGeneric<SystemUser[]>(CACHE_KEYS.USERS, []);
};

/**
 * Default roles fallback when API is unavailable
 */
const getDefaultRoles = (): UserRole[] => [
  {
    id: 'team_lead',
    name: 'Team Lead',
    description: 'Team leadership and management',
    emails: []
  },
  {
    id: 'data_engineer',
    name: 'Data Engineer',
    description: 'Data engineering and pipeline development',
    emails: []
  },
  {
    id: 'product_manager',
    name: 'Product Manager',
    description: 'Product management and strategy',
    emails: []
  },
  {
    id: 'dev_ops',
    name: 'DevOps Engineer',
    description: 'Infrastructure and deployment management',
    emails: []
  }
];

/**
 * Get roles from cache without API call
 */
export const getRolesFromCache = (): UserRole[] => {
  return getFromCacheGeneric<UserRole[]>(CACHE_KEYS.ROLES, getDefaultRoles());
};

/**
 * Extract email addresses from selected users
 */
export const extractEmailsFromUsers = (users: SystemUser[], selectedUserIds: number[]): string[] => {
  return users
    .filter(user => selectedUserIds.includes(user.id))
    .map(user => user.email)
    .filter(email => email && email.length > 0);
};

/**
 * Get team members based on entity team
 */
export const getTeamMemberEmails = (users: SystemUser[], teamName: string): string[] => {
  return users
    .filter(user => user.team === teamName)
    .map(user => user.email)
    .filter(email => email && email.length > 0);
};

