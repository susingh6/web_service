/**
 * Centralized API client using configuration endpoints
 */

import { apiRequest } from '@/lib/queryClient';
import { buildUrl, buildUrlWithParams, endpoints } from './index';

/**
 * API client with centralized endpoint configuration
 * Usage: const res = await apiClient.teams.getAll();
 */
export const apiClient = {
  // Authentication
  auth: {
    login: (credentials: { username: string; password: string }) =>
      apiRequest('POST', buildUrl(endpoints.auth.login), credentials),
    
    logout: () =>
      apiRequest('POST', buildUrl(endpoints.auth.logout)),
    
    register: (userData: any) =>
      apiRequest('POST', buildUrl(endpoints.auth.register), userData),
    
    getCurrentUser: () =>
      apiRequest('GET', buildUrl(endpoints.auth.user)),
  },

  // Teams
  teams: {
    getAll: () =>
      apiRequest('GET', buildUrl(endpoints.teams)),
    
    getDetails: (teamName: string) =>
      apiRequest('GET', buildUrl(endpoints.teamDetails, teamName)),
    
    updateMembers: (teamName: string, memberData: any) =>
      apiRequest('POST', buildUrl(endpoints.teamMembers, teamName), memberData),
    
    update: (teamName: string, teamData: any) =>
      apiRequest('PATCH', buildUrl(endpoints.teamUpdate, teamName), teamData),
  },

  // Users
  users: {
    getAll: () =>
      apiRequest('GET', buildUrl(endpoints.users)),
    
    update: (userId: number, userData: any) =>
      apiRequest('PATCH', buildUrl(endpoints.userById, userId), userData),
  },

  // Entities
  entities: {
    getAll: () =>
      apiRequest('GET', buildUrl(endpoints.entities)),
    
    getByTeam: (teamId: number) =>
      apiRequest('GET', buildUrl(endpoints.entity.byTeam, teamId)),
    
    getById: (id: number) =>
      apiRequest('GET', buildUrl(endpoints.entity.byId, id)),
    
    create: (entityData: any) =>
      apiRequest('POST', buildUrl(endpoints.entities), entityData),
    
    update: (id: number, entityData: any) =>
      apiRequest('PATCH', buildUrl(endpoints.entity.byId, id), entityData),
    
    delete: (id: number) =>
      apiRequest('DELETE', buildUrl(endpoints.entity.byId, id)),
  },

  // Dashboard
  dashboard: {
    getSummary: () =>
      apiRequest('GET', buildUrl(endpoints.dashboard.summary)),
    
    getTeamMetrics: (teamId: number) =>
      apiRequest('GET', buildUrl(endpoints.dashboard.teamPerformance, teamId)),
  },

  // Entity History
  entityHistory: {
    getByEntity: (entityId: number) =>
      apiRequest('GET', buildUrl(endpoints.entity.history, entityId)),
    
    add: (entityId: number, historyData: any) =>
      apiRequest('POST', buildUrl(endpoints.entity.history, entityId), historyData),
  },

  // Issues
  issues: {
    getByEntity: (entityId: number) =>
      apiRequest('GET', buildUrl(endpoints.entity.issues, entityId)),
    
    create: (entityId: number, issueData: any) =>
      apiRequest('POST', buildUrl(endpoints.entity.issues, entityId), issueData),
    
    resolve: (issueId: number) =>
      apiRequest('PATCH', buildUrl(endpoints.issues.resolve, issueId)),
  },

  // Debug (development only)
  debug: {
    getTeams: () =>
      apiRequest('GET', buildUrl(endpoints.debug.teams)),
  },
};

/**
 * Type-safe URL builders for direct use with apiRequest
 * Usage: const res = await apiRequest('GET', buildUrl(endpoints.teams));
 */
export { buildUrl, buildUrlWithParams, endpoints };

