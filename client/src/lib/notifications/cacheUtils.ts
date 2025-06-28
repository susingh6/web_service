/**
 * Cache utilities for notification system data
 * Implements 6-hour cache TTL for users and roles data
 */

import { fetchWithCache, getFromCache } from '@/lib/cacheUtils';
import { SystemUser, UserRole } from './types';
import { endpoints } from '@/config';

// Cache keys for notification-related data
export const CACHE_KEYS = {
  USERS: 'notification_users',
  ROLES: 'notification_roles',
  SLACK_CHANNELS: 'slack_channels',
} as const;

/**
 * Fetch system users for notification recipient selection
 */
export const fetchUsersForNotifications = async (): Promise<SystemUser[]> => {
  try {
    const response = await fetch('/api/users');
    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
};

/**
 * Fetch predefined user roles for email notifications
 */
export const fetchUserRoles = async (): Promise<UserRole[]> => {
  try {
    const response = await fetch('/api/users/roles');
    if (!response.ok) {
      throw new Error('Failed to fetch user roles');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return getDefaultRoles();
  }
};

/**
 * Get cached users or fetch from API
 */
export const getCachedUsers = async (): Promise<SystemUser[]> => {
  return await fetchWithCache('/api/users', CACHE_KEYS.USERS);
};

/**
 * Get cached roles or fetch from API
 */
export const getCachedRoles = async (): Promise<UserRole[]> => {
  return await fetchWithCache('/api/users/roles', CACHE_KEYS.ROLES);
};

/**
 * Get users from cache without API call
 */
export const getUsersFromCache = (): SystemUser[] => {
  return getFromCache(CACHE_KEYS.USERS);
};

/**
 * Get roles from cache without API call
 */
export const getRolesFromCache = (): UserRole[] => {
  return getFromCache(CACHE_KEYS.ROLES);
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