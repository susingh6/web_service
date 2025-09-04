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
    
    getMembers: (teamName: string) =>
      apiRequest('GET', buildUrl(endpoints.users.getTeamMembers, teamName)),
    
    updateMembers: (teamName: string, memberData: any) =>
      apiRequest('POST', buildUrl(endpoints.teamMembers, teamName), memberData),
  },

  // Users
  users: {
    getAll: () =>
      apiRequest('GET', buildUrl(endpoints.users.getAll)),
  },

  // Entities
  entities: {
    getAll: () =>
      apiRequest('GET', buildUrl(endpoints.entities)),
    
    // Enhanced entity filtering with intelligent routing
    getAllWithFilters: (params: {
      tenant?: string;
      teamId?: number;
      type?: 'table' | 'dag';
      dateFilter?: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month';
    }) => {
      const queryParams = new URLSearchParams();
      
      if (params.tenant) queryParams.set('tenant', params.tenant);
      if (params.teamId) queryParams.set('teamId', params.teamId.toString());
      if (params.type) queryParams.set('type', params.type);
      if (params.dateFilter) queryParams.set('date_filter', params.dateFilter);
      
      const url = queryParams.toString() ? 
        `${endpoints.entities}?${queryParams}` : 
        endpoints.entities;
        
      return apiRequest('GET', url);
    },
    
    // Custom date range queries (not cached)
    getByCustomDateRange: (params: {
      startDate: string; // ISO date string
      endDate: string;   // ISO date string
      teamId?: number;
      tenant?: string;
    }) => {
      const queryParams = new URLSearchParams();
      
      queryParams.set('start_date', params.startDate);
      queryParams.set('end_date', params.endDate);
      if (params.teamId) queryParams.set('team_id', params.teamId.toString());
      if (params.tenant) queryParams.set('tenant', params.tenant);
      
      const url = `/api/entities/custom?${queryParams}`;
      return apiRequest('GET', url);
    },
    
    // Smart entity fetching - automatically routes to cached or custom endpoint
    getWithSmartFiltering: async (params: {
      tenant?: string;
      teamId?: number;
      type?: 'table' | 'dag';
      // Pre-defined ranges use cache (instant)
      dateFilter?: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month';
      // Custom ranges use fresh API call
      customDateRange?: {
        startDate: string; // ISO date string  
        endDate: string;   // ISO date string
      };
    }) => {
      // Route to custom endpoint for custom date ranges
      if (params.customDateRange) {
        const response = await apiRequest('GET', `/api/entities/custom?${new URLSearchParams({
          start_date: params.customDateRange.startDate,
          end_date: params.customDateRange.endDate,
          ...(params.teamId && { team_id: params.teamId.toString() }),
          ...(params.tenant && { tenant: params.tenant })
        })}`);
        
        const data = await response.json();
        return {
          entities: data.entities,
          totalCount: data.totalCount,
          cached: data.cached,
          dateRange: data.dateRange
        };
      }
      
      // Route to cached endpoint for pre-defined ranges (or no date filter)
      const queryParams = new URLSearchParams();
      if (params.tenant) queryParams.set('tenant', params.tenant);
      if (params.teamId) queryParams.set('teamId', params.teamId.toString());
      if (params.type) queryParams.set('type', params.type);
      if (params.dateFilter) queryParams.set('date_filter', params.dateFilter);
      
      // Request metadata to get consistent response format
      queryParams.set('include_metadata', 'true');
      
      const url = `${endpoints.entities}?${queryParams}`;
      const response = await apiRequest('GET', url);
      const data = await response.json();
      
      // Return consistent format
      return {
        entities: data.entities,
        totalCount: data.totalCount,
        cached: data.cached,
        dateFilter: data.dateFilter
      };
    },

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

