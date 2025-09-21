import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cacheKeys, invalidateEntityCaches } from '@/lib/cacheKeys';
import { queryClient } from '@/lib/queryClient';
import { entitiesApi } from '@/features/sla/api';

// Utility to detect optimistic vs real IDs
const isOptimisticId = (id: number): boolean => {
  // Optimistic IDs are Date.now() timestamps - they're recent large numbers
  // Real IDs from server are sequential integers starting from 1
  return id > Date.now() - 60000; // Within last 60 seconds
};

// Queue for pending operations on optimistic entities
interface PendingOperation {
  type: 'update' | 'delete';
  entityData?: any;
  teamId: number;
  entityType: 'table' | 'dag';
  timestamp: number;
}

// Queue for pending team member operations
interface PendingMemberOperation {
  type: 'add' | 'remove';
  userId: string;
  userData?: any;
  teamName: string;
  timestamp: number;
}

const pendingOperationsQueue = new Map<number, PendingOperation[]>();
const pendingMemberQueue = new Map<string, PendingMemberOperation[]>();

// ===============================================================================
// STANDARDIZED CRUD PATTERN - Use this for all future CRUD operations
// ===============================================================================

interface StandardCrudConfig<T = any> {
  entityType: string;
  cacheKeyPattern: any;
  createEndpoint?: string;
  updateEndpoint?: (id: any) => string;
  deleteEndpoint?: (id: any) => string;
  customEndpoint?: string;
  identifierField?: string; // Default: 'id'
  optimisticIdGenerator?: () => any;
  isOptimisticId?: (id: any) => boolean;
}

// Standard CRUD operations that all entities should follow
export function useStandardCrud<T = any>(config: StandardCrudConfig<T>) {
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();
  const identifierField = config.identifierField || 'id';

  const standardCreate = async (data: any, scenario: any, params: any[] = []) => {
    // Generate optimistic ID using provided generator or Date.now()
    const optimisticId = config.optimisticIdGenerator ? config.optimisticIdGenerator() : Date.now();
    const optimisticEntity = { ...data, [identifierField]: optimisticId };
    
    const result = await executeWithOptimism({
      optimisticUpdate: {
        queryKey: config.cacheKeyPattern,
        updater: (old: any[] | undefined) => old ? [...old, optimisticEntity] : [optimisticEntity],
      },
      mutationFn: async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) headers['X-Session-ID'] = sessionId;
        
        const response = await fetch(config.createEndpoint || config.customEndpoint!, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          credentials: 'include',
        });
        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          // Try to parse as JSON to extract a specific error message
          try {
            const errorData = JSON.parse(text);
            if (errorData && typeof errorData.message === 'string') {
              throw new Error(errorData.message);
            }
          } catch (parseError) {
            // If JSON parsing fails, fall back to descriptive message
          }
          throw new Error(`Unable to create ${config.entityType}. Please try again or contact your administrator.`);
        }
        return response.json();
      },
      invalidationScenario: { scenario, params },
      rollbackKeys: [config.cacheKeyPattern],
    });

    // Standard reconciliation - replace optimistic with real
    if (result && typeof result === 'object' && identifierField in result) {
      cacheManager.setOptimisticData(config.cacheKeyPattern, (old: any[] | undefined) => {
        if (!old) return [result];
        return old.map(entity => entity[identifierField] === optimisticId ? result : entity);
      });
    }

    return result;
  };

  const standardUpdate = async (entityId: any, data: any, scenario: any, params: any[] = []) => {
    // Check if optimistic entity
    const isOptimistic = config.isOptimisticId ? config.isOptimisticId(entityId) : isOptimisticId(entityId);
    
    if (isOptimistic) {
      // Queue operation for optimistic entities
      console.log(`Queueing update for optimistic ${config.entityType}:`, entityId);
      // Apply optimistic update immediately
      cacheManager.setOptimisticData(config.cacheKeyPattern, (old: any[] | undefined) => {
        if (!old) return [];
        return old.map(entity => entity[identifierField] === entityId ? structuredClone({ ...entity, ...data }) : entity);
      });
      return { ...data, [identifierField]: entityId };
    }

    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: config.cacheKeyPattern,
        updater: (old: any[] | undefined) => {
          if (!old) return [];
          return old.map(entity => entity[identifierField] === entityId ? structuredClone({ ...entity, ...data }) : entity);
        },
      },
      mutationFn: async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) headers['X-Session-ID'] = sessionId;
        
        const endpoint = config.updateEndpoint ? config.updateEndpoint(entityId) : `${config.customEndpoint}/${entityId}`;
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data),
          credentials: 'include',
        });
        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          // Try to parse as JSON to extract a specific error message
          try {
            const errorData = JSON.parse(text);
            if (errorData && typeof errorData.message === 'string') {
              throw new Error(errorData.message);
            }
          } catch (parseError) {
            // If JSON parsing fails, fall back to descriptive message
          }
          throw new Error(`Unable to update ${config.entityType}. Please try again or contact your administrator.`);
        }
        return response.json();
      },
      invalidationScenario: { scenario, params },
      rollbackKeys: [config.cacheKeyPattern],
    });
  };

  const standardDelete = async (entityId: any, scenario: any, params: any[] = []) => {
    // Check if optimistic entity
    const isOptimistic = config.isOptimisticId ? config.isOptimisticId(entityId) : isOptimisticId(entityId);
    
    if (isOptimistic) {
      // Immediate removal for optimistic entities
      console.log(`Immediately deleting optimistic ${config.entityType}:`, entityId);
      cacheManager.setOptimisticData(config.cacheKeyPattern, (old: any[] | undefined) => 
        old ? old.filter(entity => entity[identifierField] !== entityId) : []
      );
      return true;
    }

    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: config.cacheKeyPattern,
        updater: (old: any[] | undefined) => 
          old ? old.filter(entity => entity[identifierField] !== entityId) : [],
      },
      mutationFn: async () => {
        const headers: Record<string, string> = {};
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) headers['X-Session-ID'] = sessionId;
        
        const endpoint = config.deleteEndpoint ? config.deleteEndpoint(entityId) : `${config.customEndpoint}/${entityId}`;
        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers,
          credentials: 'include',
        });
        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          // Try to parse as JSON to extract a specific error message
          try {
            const errorData = JSON.parse(text);
            if (errorData && typeof errorData.message === 'string') {
              throw new Error(errorData.message);
            }
          } catch (parseError) {
            // If JSON parsing fails, fall back to original behavior
          }
          throw new Error(`Unable to delete ${config.entityType}. Please try again or contact your administrator.`);
        }
        return response.ok;
      },
      invalidationScenario: { scenario, params },
      rollbackKeys: [config.cacheKeyPattern],
    });
  };

  return { standardCreate, standardUpdate, standardDelete };
}

// ===============================================================================
// END STANDARDIZED CRUD PATTERN
// ===============================================================================

// Centralized cache invalidation configuration following API config pattern
export const CACHE_PATTERNS = {
  // Team-related cache keys
  TEAMS: {
    LIST: ['/api/teams'],
    DETAILS: (teamName: string) => [`/api/get_team_details/${teamName}`],
    MEMBERS: (teamName: string) => [`/api/get_team_members/${teamName}`],
    ALL_MEMBERS: () => ['/api/get_team_members'],
  },
  
  // Entity-related cache keys  
  ENTITIES: {
    LIST: ['/api/entities'],
    BY_TEAM: (teamId: number) => [`/api/entities`, { teamId }],
    BY_TYPE: (type: string) => [`/api/entities`, { type }],
    BY_TEAM_AND_TYPE: (teamId: number, type: string) => [`/api/entities`, { teamId, type }],
    DETAILS: (entityId: number) => [`/api/entities/${entityId}`],
    DETAILS_BY_NAME: (entityName: string, teamName: string, entityType: string) => 
      ['entity-details-by-name', entityName, teamName, entityType],
    HISTORY: (entityId: number) => [`/api/entities/${entityId}/history`],
  },
  
  // User-related cache keys
  USERS: {
    ALL: ['/api/get_user'],
    PROFILE: ['/api/user'],
  },
  
  // Dashboard-related cache keys
  DASHBOARD: {
    SUMMARY: (tenant?: string) => tenant ? 
      ['/api/dashboard/summary', { tenant }] : 
      ['/api/dashboard/summary'],
  },
  
  // Task-related cache keys (6-hourly caching for tasks in team dashboards)
  TASKS: {
    LIST: ['/api/tasks'],
    BY_DAG: (dagId: number) => [`/api/dags/${dagId}/tasks`],
    BY_ENTITY: (entityId: number) => [`/api/entities/${entityId}/tasks`],
    DETAILS: (taskId: number) => [`/api/tasks/${taskId}`],
    BY_PRIORITY: (priority: 'high' | 'normal') => [`/api/tasks`, { priority }],
    BY_DAG_AND_PRIORITY: (dagId: number, priority: 'high' | 'normal') => [`/api/dags/${dagId}/tasks`, { priority }],
    BY_TEAM_DAG: (teamId: number, dagName: string) => [`/api/teams/${teamId}/dags/${dagName}/tasks`],
  },
} as const;

// Cache invalidation scenarios configuration
export const INVALIDATION_SCENARIOS = {
  TEAM_MEMBER_ADDED: (teamName: string) => [
    ...CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
    ['team-members', teamName],
    ...CACHE_PATTERNS.TEAMS.DETAILS(teamName),
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.USERS.ALL, // CRITICAL: Invalidate user cache so notification timeline sees team changes
  ],
  
  TEAM_MEMBER_REMOVED: (teamName: string) => [
    ...CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
    ['team-members', teamName],
    ...CACHE_PATTERNS.TEAMS.DETAILS(teamName),
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.USERS.ALL, // CRITICAL: Invalidate user cache so notification timeline sees team changes  
  ],
  
  // Entity-type-specific cache invalidation (targeted approach)
  TABLE_ENTITY_CREATED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('table'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'table'),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],
  
  DAG_ENTITY_CREATED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('dag'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'dag'),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],
  
  TABLE_ENTITY_UPDATED: (entityId: number, teamId: number, entityName?: string, teamName?: string) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('table'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'table'),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
    ...(entityName && teamName ? CACHE_PATTERNS.ENTITIES.DETAILS_BY_NAME(entityName, teamName, 'table') : []),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],
  
  DAG_ENTITY_UPDATED: (entityId: number, teamId: number, entityName?: string, teamName?: string) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('dag'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'dag'),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
    ...(entityName && teamName ? CACHE_PATTERNS.ENTITIES.DETAILS_BY_NAME(entityName, teamName, 'dag') : []),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],
  
  TABLE_ENTITY_DELETED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('table'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'table'),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],
  
  DAG_ENTITY_DELETED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('dag'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'dag'),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],
  
  // Legacy scenarios (kept for backward compatibility)
  ENTITY_CREATED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.LIST,
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(),
  ],
  
  ENTITY_UPDATED: (entityId: number, teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.LIST,
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(),
  ],
  
  ENTITY_DELETED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.LIST,
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(),
  ],
  
  TEAM_CREATED: () => [
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(),
  ],
  
  // Task-specific cache invalidation scenarios
  TASK_CREATED: (dagId: number, teamId?: number) => [
    ...CACHE_PATTERNS.TASKS.BY_DAG(dagId),
    ...CACHE_PATTERNS.TASKS.LIST,
    ...(teamId ? [] : []), // Add team-specific patterns if teamId provided
  ],
  
  TASK_UPDATED: (taskId: number, dagId: number, teamId?: number) => [
    ...CACHE_PATTERNS.TASKS.BY_DAG(dagId),
    ...CACHE_PATTERNS.TASKS.DETAILS(taskId),
    ...CACHE_PATTERNS.TASKS.LIST,
    ...(teamId ? [] : []), // Add team-specific patterns if teamId provided
  ],
  
  TASK_DELETED: (dagId: number, teamId?: number) => [
    ...CACHE_PATTERNS.TASKS.BY_DAG(dagId),
    ...CACHE_PATTERNS.TASKS.LIST,
    ...(teamId ? [] : []), // Add team-specific patterns if teamId provided
  ],
  
  TASK_PRIORITY_CHANGED: (taskId: number, dagId: number, oldPriority: 'high' | 'normal', newPriority: 'high' | 'normal') => [
    ...CACHE_PATTERNS.TASKS.BY_DAG(dagId),
    ...CACHE_PATTERNS.TASKS.DETAILS(taskId),
    ...CACHE_PATTERNS.TASKS.BY_PRIORITY(oldPriority),
    ...CACHE_PATTERNS.TASKS.BY_PRIORITY(newPriority),
    ...CACHE_PATTERNS.TASKS.BY_DAG_AND_PRIORITY(dagId, oldPriority),
    ...CACHE_PATTERNS.TASKS.BY_DAG_AND_PRIORITY(dagId, newPriority),
  ],

  TASK_PREFERENCE_UPDATED: (taskId: number, dagId: number, preference: 'regular' | 'AI') => [
    ...CACHE_PATTERNS.TASKS.BY_DAG(dagId),
    ...CACHE_PATTERNS.TASKS.DETAILS(taskId),
    ...CACHE_PATTERNS.TASKS.LIST,
  ],

  // Rollback-specific cache invalidation patterns
  ENTITY_ROLLBACK: (entityId: number, teamId: number, entityType: 'table' | 'dag') => [
    ...CACHE_PATTERNS.ENTITIES.LIST,
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE(entityType),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, entityType),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],

  AUDIT_ROLLBACK: (entityId: string, teamId: string, tenantId: string, entityType: 'table' | 'dag') => [
    ...CACHE_PATTERNS.ENTITIES.LIST,
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Dashboard summary
    [`/api/entities/${entityId}`], // Specific entity
    [`/api/entities`, { teamId: parseInt(teamId) }], // Team entities
    [`/api/entities`, { type: entityType }], // Type-specific entities
    [`/api/audit`, { tenant_id: tenantId }], // Audit history
    ['entities', tenantId], // Tenant entities (using cacheKeys pattern)
    ['entities', tenantId, parseInt(teamId)], // Tenant + team entities
    ['dashboardSummary', tenantId], // Dashboard summaries by tenant
    ['dashboardSummary', tenantId, parseInt(teamId)], // Dashboard summaries by tenant + team
  ],
} as const;

// Centralized cache management hook
export function useCacheManager() {
  const queryClient = useQueryClient();

  const invalidateCache = async (keys: (string | object)[][]) => {
    await Promise.all(
      keys.map(key => queryClient.invalidateQueries({ 
        queryKey: key,
        refetchType: 'active' // Force active queries to refetch immediately
      }))
    );
  };

  const invalidateByScenario = async (
    scenario: keyof typeof INVALIDATION_SCENARIOS,
    ...params: any[]
  ) => {
    const keys = (INVALIDATION_SCENARIOS[scenario] as any)(...params);
    await invalidateCache(keys);
  };

  // Optimistic update utilities
  const setOptimisticData = <T>(
    queryKey: (string | object)[],
    updater: T | ((old: T | undefined) => T)
  ) => {
    queryClient.setQueryData(queryKey, updater);
  };

  const removeOptimisticData = (queryKey: (string | object)[]) => {
    queryClient.removeQueries({ queryKey });
  };

  // Background cache rebuilding for entity-specific caches
  const rebuildEntityCacheBackground = async (teamId: number, entityType: 'table' | 'dag') => {
    try {
      // Pre-fetch the data to rebuild the cache
      await queryClient.prefetchQuery({
        queryKey: CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, entityType),
        queryFn: async () => {
          // Build headers with session ID for RBAC enforcement
          const headers: Record<string, string> = {};
          
          // CRITICAL: Add X-Session-ID header for FastAPI RBAC
          const sessionId = localStorage.getItem('fastapi_session_id');
          if (sessionId) {
            headers['X-Session-ID'] = sessionId;
          }
          
          // Import centralized endpoints to avoid hardcoded paths
          const { buildUrl, endpoints } = await import('@/config');
          const url = buildUrl(endpoints.entities) + `?teamId=${teamId}&type=${entityType}`;
          const response = await fetch(url, {
            headers,
            credentials: 'include',
          });
          if (!response.ok) {
            const text = (await response.text()) || response.statusText;
            // Try to parse as JSON to extract a specific error message
            try {
              const errorData = JSON.parse(text);
              if (errorData && typeof errorData.message === 'string') {
                throw new Error(errorData.message);
              }
            } catch (parseError) {
              // If JSON parsing fails, fall back to descriptive message
            }
            throw new Error('Unable to retrieve entities. Please try again or contact your administrator.');
          }
          return response.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
      
      // Also refresh the general team cache
      await queryClient.prefetchQuery({
        queryKey: CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
        queryFn: async () => {
          // Build headers with session ID for RBAC enforcement
          const headers: Record<string, string> = {};
          
          // CRITICAL: Add X-Session-ID header for FastAPI RBAC
          const sessionId = localStorage.getItem('fastapi_session_id');
          if (sessionId) {
            headers['X-Session-ID'] = sessionId;
          }
          
          // Import centralized endpoints to avoid hardcoded paths
          const { buildUrl, endpoints } = await import('@/config');
          const url = buildUrl(endpoints.entities) + `?teamId=${teamId}`;
          const response = await fetch(url, {
            headers,
            credentials: 'include',
          });
          if (!response.ok) {
            const text = (await response.text()) || response.statusText;
            // Try to parse as JSON to extract a specific error message
            try {
              const errorData = JSON.parse(text);
              if (errorData && typeof errorData.message === 'string') {
                throw new Error(errorData.message);
              }
            } catch (parseError) {
              // If JSON parsing fails, fall back to descriptive message
            }
            throw new Error('Unable to retrieve team entities. Please try again or contact your administrator.');
          }
          return response.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    } catch (error) {
      console.warn(`Background cache rebuild failed for team ${teamId}, type ${entityType}:`, error);
      // Fail silently - next request will rebuild via lazy loading
    }
  };

  // Smart invalidation with optional background rebuild
  const invalidateWithRebuild = async (
    scenario: keyof typeof INVALIDATION_SCENARIOS,
    rebuildOptions?: { teamId: number; entityType: 'table' | 'dag' },
    ...params: any[]
  ) => {
    // Invalidate the cache first
    await invalidateByScenario(scenario, ...params);
    
    // Background rebuild if options provided
    if (rebuildOptions) {
      rebuildEntityCacheBackground(rebuildOptions.teamId, rebuildOptions.entityType);
    }
  };

  return {
    invalidateCache,
    invalidateByScenario,
    invalidateWithRebuild,
    rebuildEntityCacheBackground,
    setOptimisticData,
    removeOptimisticData,
    queryClient,
  };
}

// Optimistic update wrapper for write operations
export function useOptimisticMutation<TData, TVariables, TOptimisticData = TData>() {
  const cacheManager = useCacheManager();

  const executeWithOptimism = async (config: {
    optimisticUpdate?: {
      queryKey: (string | object)[];
      updater: TOptimisticData | ((old: TOptimisticData | undefined) => TOptimisticData);
    };
    mutationFn: () => Promise<TData>;
    invalidationScenario?: {
      scenario: keyof typeof INVALIDATION_SCENARIOS;
      params: any[];
      rebuildOptions?: { teamId: number; entityType: 'table' | 'dag' };
    };
    rollbackKeys?: (string | object)[][];
  }) => {
    const { optimisticUpdate, mutationFn, invalidationScenario, rollbackKeys } = config;
    
    // Apply optimistic update if provided
    if (optimisticUpdate) {
      cacheManager.setOptimisticData(optimisticUpdate.queryKey, optimisticUpdate.updater);
    }

    try {
      const result = await mutationFn();
      
      // Invalidate affected cache entries after successful operation
      if (invalidationScenario) {
        if (invalidationScenario.rebuildOptions) {
          await cacheManager.invalidateWithRebuild(
            invalidationScenario.scenario,
            invalidationScenario.rebuildOptions,
            ...invalidationScenario.params
          );
        } else {
          await cacheManager.invalidateByScenario(
            invalidationScenario.scenario,
            ...invalidationScenario.params
          );
        }
      }
      
      return result;
    } catch (error) {
      // Rollback optimistic updates on failure
      if (rollbackKeys) {
        rollbackKeys.forEach(key => {
          cacheManager.removeOptimisticData(key);
        });
      }
      throw error;
    }
  };

  return { executeWithOptimism, cacheManager };
}

// Standardized CRUD operations following consistent optimistic pattern
export function useTeamMemberMutation() {
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();

  const addMember = async (teamName: string, userId: string, user: any) => {
    // Standardized optimistic add operation
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
        updater: (old: any[] | undefined) => old ? [...old, user] : [user],
      },
      mutationFn: async () => {
        // Build headers with session ID for RBAC enforcement
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        
        // CRITICAL: Add X-Session-ID header for FastAPI RBAC
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) {
          headers['X-Session-ID'] = sessionId;
        }
        
        const response = await fetch(`/api/teams/${teamName}/members`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'add', memberId: userId }),
          credentials: 'include',
        });
        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          // Try to parse as JSON to extract a specific error message
          try {
            const errorData = JSON.parse(text);
            if (errorData && typeof errorData.message === 'string') {
              throw new Error(errorData.message);
            }
          } catch (parseError) {
            // If JSON parsing fails, fall back to descriptive message
          }
          throw new Error('Unable to add team member. Please try again or contact your administrator.');
        }
        const result = await response.json();
        
        // CRITICAL: Invalidate React Query cache for notification system 
        // This ensures EmailNotificationConfig shows updated team members immediately
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
        queryClient.invalidateQueries({ queryKey: ['team-notification-settings', teamName] });
        // CRITICAL: Also invalidate notification component team member cache
        queryClient.invalidateQueries({ queryKey: [`/api/get_team_members/${teamName}`] });
        
        return result;
      },
      invalidationScenario: {
        scenario: 'TEAM_MEMBER_ADDED',
        params: [teamName],
      },
      rollbackKeys: [CACHE_PATTERNS.TEAMS.MEMBERS(teamName)],
    });
  };

  const removeMember = async (teamName: string, userId: string) => {
    // Standardized optimistic remove operation
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
        updater: (old: any[] | undefined) => 
          old ? old.filter(member => member.id !== parseInt(userId)) : [],
      },
      mutationFn: async () => {
        // Build headers with session ID for RBAC enforcement
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        
        // CRITICAL: Add X-Session-ID header for FastAPI RBAC
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) {
          headers['X-Session-ID'] = sessionId;
        }
        
        const response = await fetch(`/api/teams/${teamName}/members`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'remove', memberId: userId }),
          credentials: 'include',
        });
        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          // Try to parse as JSON to extract a specific error message
          try {
            const errorData = JSON.parse(text);
            if (errorData && typeof errorData.message === 'string') {
              throw new Error(errorData.message);
            }
          } catch (parseError) {
            // If JSON parsing fails, fall back to descriptive message
          }
          throw new Error('Unable to remove team member. Please try again or contact your administrator.');
        }
        const result = await response.json();
        
        // CRITICAL: Invalidate React Query cache for notification system 
        // This ensures EmailNotificationConfig shows updated team members immediately
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
        queryClient.invalidateQueries({ queryKey: ['team-notification-settings', teamName] });
        // CRITICAL: Also invalidate notification component team member cache
        queryClient.invalidateQueries({ queryKey: [`/api/get_team_members/${teamName}`] });
        
        return result;
      },
      invalidationScenario: {
        scenario: 'TEAM_MEMBER_REMOVED',
        params: [teamName],
      },
      rollbackKeys: [CACHE_PATTERNS.TEAMS.MEMBERS(teamName)],
    });
  };

  return { addMember, removeMember };
}

export function useEntityMutation() {
  const queryClient = useQueryClient();

  // CREATE
  const createMutation = useMutation({
    mutationFn: async (entityData: any) => {
      const { entityRequest } = await import('@/features/sla/api');
      const entityType = entityData.type as 'table' | 'dag';
      const response = await entityRequest('POST', entityType, 'create', entityData);
      
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        // Try to parse as JSON to extract a specific error message
        try {
          const errorData = JSON.parse(text);
          if (errorData && typeof errorData.message === 'string') {
            throw new Error(errorData.message);
          }
        } catch (parseError) {
          // If JSON parsing fails, fall back to descriptive message
        }
        throw new Error('Unable to create entity. Please try again or contact your administrator.');
      }
      return response.json();
    },
    onMutate: async (entityData: any) => {
      const tenant = entityData.tenant_name;
      const teamId = entityData.teamId;
      const key = cacheKeys.entitiesByTenantAndTeam(tenant, teamId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      const optimisticId = Date.now();
      const optimisticEntity = { ...entityData, id: optimisticId };
      queryClient.setQueryData<any[]>(key, (old) => old ? [...old, optimisticEntity] : [optimisticEntity]);
      return { previous, key, optimisticId };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSuccess: (result, vars, ctx: any) => {
      if (ctx?.key && ctx?.optimisticId) {
        queryClient.setQueryData<any[]>(ctx.key, (old) => {
          if (!old) return [result];
          return old.map(e => e.id === ctx.optimisticId ? result : e);
        });
      }
    },
    onSettled: async (result, _err, vars) => {
      await invalidateEntityCaches(queryClient, {
        tenant: vars?.tenant_name,
        teamId: vars?.teamId,
        entityId: result?.id,
      });
    },
  });

  // UPDATE
  const updateMutation = useMutation({
    mutationFn: async ({ entityName, entityType, entityData }: { entityName: string; entityType: 'table' | 'dag'; entityData: any }) => {
      // Use the name-based updateEntity function with FastAPI/Express fallback
      return await entitiesApi.updateEntity({
        type: entityType,
        entityName: entityName,
        entity: { name: entityName, type: entityType, ...entityData },
        updates: entityData
      });
    },
    onMutate: async ({ entityName, entityType, entityData }: { entityName: string; entityType: 'table' | 'dag'; entityData: any }) => {
      const effectiveTenant = entityData.tenant_name || 'Data Engineering';
      const key = cacheKeys.entitiesByTenantAndTeam(effectiveTenant, entityData.teamId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      
      // Optimistically update the entity in cache
      queryClient.setQueryData<any[]>(key, (old) => {
        if (!old) return [] as any[];
        return old.map(e => 
          (e.entity_name === entityName || e.name === entityName) 
            ? { ...e, ...entityData } 
            : e
        );
      });
      
      return { previous, key, tenant: effectiveTenant, teamId: entityData.teamId };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: async (_res, _err, vars) => {
      await invalidateEntityCaches(queryClient, {
        tenant: vars?.entityData?.tenant_name,
        teamId: vars?.entityData?.teamId,
        entityName: vars?.entityName,
        entityType: vars?.entityType
      });
    },
  });

  // UPDATE OWNER (specialized owner-only update)
  const updateOwnerMutation = useMutation({
    mutationFn: async ({ entityName, entityType, ownerData }: { entityName: string; entityType: 'table' | 'dag'; ownerData: any }) => {
      // Use the name-based owner update endpoints
      const { apiRequest } = await import('@/lib/queryClient');
      const { buildUrl, endpoints } = await import('@/config');
      const updateEndpoint = entityType === 'table'
        ? (endpoints.tablesOwnerUpdate ?? endpoints.tablesUpdate)
        : (endpoints.dagsOwnerUpdate ?? endpoints.dagsUpdate);
      
      const response = await apiRequest('PATCH', buildUrl(updateEndpoint, entityName), ownerData);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to update owner: ${text}`);
      }
      return response.json();
    },
    onMutate: async ({ entityName, entityType, ownerData }: { entityName: string; entityType: 'table' | 'dag'; ownerData: any }) => {
      const effectiveTenant = ownerData.tenant_name || 'Data Engineering';
      const key = cacheKeys.entitiesByTenantAndTeam(effectiveTenant, ownerData.teamId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      
      // Optimistically update owner in cache
      const normalizedOwner = Array.isArray(ownerData.owners) ? ownerData.owners.join(',') : ownerData.owners;
      queryClient.setQueryData<any[]>(key, (old) => {
        if (!old) return [] as any[];
        return old.map(e => 
          (e.entity_name === entityName || e.name === entityName) 
            ? { 
                ...e, 
                owner: normalizedOwner,
                ownerEmail: normalizedOwner,
                owner_email: normalizedOwner
              } 
            : e
        );
      });
      
      return { previous, key, tenant: effectiveTenant, teamId: ownerData.teamId };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: async (_res, _err, vars) => {
      await invalidateEntityCaches(queryClient, {
        tenant: vars?.ownerData?.tenant_name,
        teamId: vars?.ownerData?.teamId,
        entityName: vars?.entityName,
        entityType: vars?.entityType
      });
    },
  });

  // ROLLBACK ENTITY (specialized rollback operation with modern cache invalidation)
  const rollbackEntityMutation = useMutation({
    mutationFn: async ({ entityName, entityType, teamName, rollbackData }: { entityName: string; entityType: 'table' | 'dag'; teamName: string; rollbackData: any }) => {
      // Use the rollback endpoint with name-based URL
      const { apiRequest } = await import('@/lib/queryClient');
      const { buildUrl } = await import('@/config');
      
      const response = await apiRequest('POST', buildUrl(`/api/teams/${teamName}/${entityType}/${entityName}/rollback`), rollbackData);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to rollback entity: ${text}`);
      }
      return response.json();
    },
    onMutate: async ({ entityName, entityType, rollbackData }: { entityName: string; entityType: 'table' | 'dag'; teamName: string; rollbackData: any }) => {
      // For rollback, we don't do optimistic updates since we don't know what the rolled-back state will be
      // We'll let the cache invalidation handle the refresh after the API call succeeds
      return { entityName, entityType, rollbackData };
    },
    onSuccess: async (_result, vars) => {
      // Use modern cache invalidation approach instead of 15+ manual invalidations
      await invalidateEntityCaches(queryClient, {
        tenant: vars.rollbackData.tenant_name,
        teamId: vars.rollbackData.teamId,
        entityName: vars.entityName,
        entityType: vars.entityType,
        teamName: vars.teamName
      });
    },
    onError: (_err, _vars, _ctx) => {
      // No optimistic updates to revert for rollback
    },
  });

  // DELETE
  const deleteMutation = useMutation({
    mutationFn: async ({ entityName, entityType, tenant, teamId }: { entityName: string; entityType: 'table' | 'dag'; tenant?: string; teamId: number }) => {
      // Use the new deleteEntity function with FastAPI/Express fallback
      return await entitiesApi.deleteEntity({ type: entityType, entityName });
    },
    onMutate: async ({ entityName, entityType, tenant, teamId }: { entityName: string; entityType: 'table' | 'dag'; tenant?: string; teamId: number }) => {
      const effectiveTenant = tenant || 'Data Engineering';
      const key = cacheKeys.entitiesByTenantAndTeam(effectiveTenant, teamId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      // Filter by entity_name instead of id (entities have both name and entity_name fields)
      queryClient.setQueryData<any[]>(key, (old) => old ? old.filter(e => 
        e.entity_name !== entityName && e.name !== entityName
      ) : []);
      return { previous, key, tenant: effectiveTenant, teamId };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: async (_res, _err, vars: any, ctx: any) => {
      // Comprehensive cache invalidation to handle all cache patterns used throughout the app
      await Promise.all([
        // 1. Invalidate structured cache keys
        invalidateEntityCaches(queryClient, {
          tenant: ctx?.tenant,
          teamId: ctx?.teamId,
          entityId: vars?.entityName,
        }),
        
        // 2. Invalidate direct API path cache keys (used in Summary and other places)
        queryClient.invalidateQueries({ queryKey: ['/api/v1/entities'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/entities'] }),
        
        // 3. Invalidate tenant-wide cache
        ctx?.tenant ? queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenant(ctx.tenant) }) : Promise.resolve(),
        
        // 4. Invalidate team-specific cache 
        (ctx?.tenant && ctx?.teamId) ? queryClient.invalidateQueries({ queryKey: cacheKeys.entitiesByTenantAndTeam(ctx.tenant, ctx.teamId) }) : Promise.resolve(),
        
        // 5. Invalidate dashboard summary to update metrics
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] }),
        ctx?.tenant ? queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(ctx.tenant) }) : Promise.resolve(),
        (ctx?.tenant && ctx?.teamId) ? queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(ctx.tenant, ctx.teamId) }) : Promise.resolve(),
      ]);
    },
  });

  const createEntity = async (entityData: any) => createMutation.mutateAsync(entityData);
  const updateEntity = async (entityName: string, entityType: 'table' | 'dag', entityData: any) =>
    updateMutation.mutateAsync({ entityName, entityType, entityData });
  const updateOwner = async (entityName: string, entityType: 'table' | 'dag', ownerData: any) =>
    updateOwnerMutation.mutateAsync({ entityName, entityType, ownerData });
  const rollbackEntity = async (entityName: string, entityType: 'table' | 'dag', teamName: string, rollbackData: any) =>
    rollbackEntityMutation.mutateAsync({ entityName, entityType, teamName, rollbackData });
  const deleteEntity = async (entityName: string, entityType: 'table' | 'dag', teamId: number, tenantName?: string) =>
    deleteMutation.mutateAsync({ entityName, entityType, tenant: tenantName, teamId });

  return { createEntity, updateEntity, updateOwner, rollbackEntity, deleteEntity };
}

// Admin Management Hook - Modern cache-management for admin operations
export function useAdminMutation() {
  const queryClient = useQueryClient();

  // TENANT MANAGEMENT
  const createTenantMutation = useMutation({
    mutationFn: async (tenantData: any) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { isDevelopment, endpoints } = await import('@/config');
      // Try FastAPI endpoint first, then admin endpoint
      let response = await apiRequest('POST', endpoints.admin.tenants.create, tenantData);
      if (!response.ok && response.status === 404) {
        response = await apiRequest('POST', '/api/admin/tenants', tenantData);
      }
      if (!response.ok) {
        if (isDevelopment) {
          // Development fallback: return mock tenant data
          return { id: Date.now(), ...tenantData, isActive: tenantData.isActive ?? true };
        }
        const text = await response.text();
        throw new Error(`Failed to create tenant: ${text}`);
      }
      return response.json();
    },
    onSuccess: async () => {
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ tenantId, tenantData }: { tenantId: number; tenantData: any }) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { isDevelopment, endpoints } = await import('@/config');
      
      // Try FastAPI endpoint first (from config)
      let response = await apiRequest('PATCH', endpoints.admin.tenants.update(tenantId), tenantData);
      
      // Fallback to Express endpoint if FastAPI fails
      if (!response.ok && response.status === 404) {
        response = await apiRequest('PATCH', `/api/tenants/${tenantId}`, tenantData);
      }
      if (!response.ok) {
        if (isDevelopment) {
          // Development fallback: return mock updated tenant data
          return { id: tenantId, ...tenantData };
        }
        const text = await response.text();
        throw new Error(`Failed to update tenant: ${text}`);
      }
      return response.json();
    },
    onSuccess: async (result, { tenantData }) => {
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
      
      // Invalidate team caches since tenant status changes can cascade to teams
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/teams'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      
      // CRITICAL: Invalidate main dashboard caches when tenant status changes
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants', 'active'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/dashboard/summary'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/entities'] });
      
      // Emit custom event for Redux-based components (like Summary dashboard) to refresh
      window.dispatchEvent(new CustomEvent('dashboard-data-updated', { 
        detail: { 
          tenantId: result?.id, 
          tenantData, 
          source: 'tenant-status-update' 
        } 
      }));
    },
  });

  // TEAM MANAGEMENT
  const createTeamMutation = useMutation({
    mutationFn: async (teamData: any) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { isDevelopment, endpoints } = await import('@/config');
      // Try FastAPI endpoint first, then Express fallback
      let response = await apiRequest('POST', endpoints.admin.teams.create, teamData);
      if (!response.ok && response.status === 404) {
        response = await apiRequest('POST', '/api/teams', teamData);
      }
      if (!response.ok) {
        if (isDevelopment) {
          // Development fallback: return mock team data
          return { id: Date.now(), ...teamData, isActive: teamData.isActive ?? true };
        }
        const text = await response.text();
        throw new Error(`Failed to create team: ${text}`);
      }
      return response.json();
    },
    onSuccess: async () => {
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, teamData }: { teamId: number; teamData: any }) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { isDevelopment, endpoints } = await import('@/config');
      
      // Try FastAPI endpoint first (from config)
      let response = await apiRequest('PATCH', endpoints.admin.teams.update(teamId), teamData);
      
      // Fallback to Express endpoint if FastAPI fails
      if (!response.ok && response.status === 404) {
        response = await apiRequest('PATCH', `/api/teams/${teamId}`, teamData);
      }
      if (!response.ok) {
        if (isDevelopment) {
          // Development fallback: return mock updated team data
          return { id: teamId, ...teamData };
        }
        const text = await response.text();
        throw new Error(`Failed to update team: ${text}`);
      }
      return response.json();
    },
    onSuccess: async () => {
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
      // Comprehensive cache invalidation for team updates
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/dashboard/summary'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/get_team_members'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/team_members'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants', 'active'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/team_performance'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/analytics/teams'] });
    },
  });

  // USER MANAGEMENT - Use direct API call approach for simplicity
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, userData }: { userId: number; userData: any }) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { endpoints } = await import('@/config');
      
      // Try FastAPI endpoint first (from config)
      let response = await apiRequest('PATCH', endpoints.admin.users.update(userId), userData);
      
      // Fallback to Express endpoint if FastAPI fails
      if (!response.ok && response.status === 404) {
        response = await apiRequest('PATCH', `/api/users/${userId}`, userData);
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to update user: ${text}`);
      }
      return response.json();
    },
    onMutate: async ({ userId, userData }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'users']);
      queryClient.setQueryData<any[]>(['admin', 'users'], (old) => {
        if (!old) return old;
        return old.map(user => user.id === userId ? { ...user, ...userData } : user);
      });
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'users'], ctx.previous);
    },
    onSuccess: async (result, { userData }) => {
      // Invalidate team member caches when user status changes
      if (userData.is_active !== undefined) {
        await queryClient.invalidateQueries({ queryKey: ['teamMembers'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/v1/get_team_members'] });
      }
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
    },
  });

  // ROLE MANAGEMENT
  const createRoleMutation = useMutation({
    mutationFn: async (roleData: any) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { isDevelopment } = await import('@/config');
      const response = await apiRequest('POST', '/api/v1/roles', roleData);
      if (!response.ok) {
        if (isDevelopment) {
          // Development fallback: return mock role data
          return { id: Date.now(), ...roleData };
        }
        const text = await response.text();
        throw new Error(`Failed to create role: ${text}`);
      }
      return response.json();
    },
    onMutate: async (roleData: any) => {
      // Optimistic update for development
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'roles']);
      const optimistic = {
        id: Date.now(),
        role_name: roleData.role_name || 'new-role',
        description: roleData.description || '',
        role_permissions: roleData.role_permissions || [],
        is_system_role: !!roleData.is_system_role,
        is_active: roleData.is_active ?? true,
        tenant_name: roleData.tenant_name,
        team_name: roleData.team_name,
      };
      queryClient.setQueryData<any[]>(['admin', 'roles'], (old) => old ? [...old, optimistic] : [optimistic]);
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'roles'], ctx.previous);
    },
    onSuccess: async () => {
      const { isDevelopment } = await import('@/config');
      if (!isDevelopment) {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleName, roleData }: { roleName: string; roleData: any }) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { isDevelopment, endpoints } = await import('@/config');
      // Try FastAPI endpoint first
      let response = await apiRequest('PATCH', endpoints.admin.roles.update(roleName), roleData);
      
      // Fallback to Express endpoint if FastAPI fails
      if (!response.ok && response.status === 404) {
        response = await apiRequest('PATCH', `/api/roles/${roleName}`, roleData);
      }
      if (!response.ok) {
        if (isDevelopment) {
          // Development fallback: return mock updated role data
          return { role_name: roleName, ...roleData };
        }
        const text = await response.text();
        throw new Error(`Failed to update role: ${text}`);
      }
      return response.json();
    },
    onMutate: async ({ roleName, roleData }: { roleName: string; roleData: any }) => {
      // Optimistic update for development
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'roles']);
      queryClient.setQueryData<any[]>(['admin', 'roles'], (old) => 
        old ? old.map(r => r.role_name === roleName ? { ...r, ...roleData } : r) : []
      );
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'roles'], ctx.previous);
    },
    onSuccess: async () => {
      const { isDevelopment } = await import('@/config');
      if (!isDevelopment) {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      }
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleName: string) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const { isDevelopment, endpoints } = await import('@/config');
      const response = await apiRequest('DELETE', endpoints.admin.roles.delete(roleName));
      if (!response.ok) {
        if (isDevelopment) {
          // Development fallback: return success
          return true;
        }
        const text = await response.text();
        throw new Error(`Failed to delete role: ${text}`);
      }
      return response.json();
    },
    onMutate: async (roleName: string) => {
      // Optimistic update for development
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'roles']);
      queryClient.setQueryData<any[]>(['admin', 'roles'], (old) => 
        old ? old.filter(r => r.role_name !== roleName) : []
      );
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'roles'], ctx.previous);
    },
    onSuccess: async () => {
      const { isDevelopment } = await import('@/config');
      if (!isDevelopment) {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      }
    },
  });

  // ADMIN ROLLBACK MANAGEMENT
  const adminRollbackMutation = useMutation({
    mutationFn: async (entity: any) => {
      const { rollbackApi } = await import('@/features/sla/api');
      return await rollbackApi.performRollback({
        entity_id: entity.entity_id,
        entity_name: entity.entity_name,
        entity_type: entity.entity_type,
        tenant_id: entity.tenant_id,
        team_id: entity.team_id
      });
    },
    onSuccess: async (result, entity) => {
      // Use modern cache invalidation approach
      await invalidateEntityCaches(queryClient, {
        tenant: entity.tenant_name,
        teamId: parseInt(entity.team_id),
        entityId: entity.entity_id
      });
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
      
      // Emit custom event for other components to refresh
      window.dispatchEvent(new CustomEvent('dashboard-data-updated', { 
        detail: { 
          tenant: entity.tenant_name, 
          teamId: parseInt(entity.team_id), 
          entityId: entity.entity_id,
          source: 'admin-rollback' 
        } 
      }));
    },
  });

  // Return all admin functions
  const createTenant = async (tenantData: any) => createTenantMutation.mutateAsync(tenantData);
  const updateTenant = async (tenantId: number, tenantData: any) => updateTenantMutation.mutateAsync({ tenantId, tenantData });
  const createTeam = async (teamData: any) => createTeamMutation.mutateAsync(teamData);
  const updateTeam = async (teamId: number, teamData: any) => updateTeamMutation.mutateAsync({ teamId, teamData });
  const updateUser = async (userId: number, userData: any) => updateUserMutation.mutateAsync({ userId, userData });
  const createRole = async (roleData: any) => createRoleMutation.mutateAsync(roleData);
  const updateRole = async (roleName: string, roleData: any) => updateRoleMutation.mutateAsync({ roleName, roleData });
  const deleteRole = async (roleName: string) => deleteRoleMutation.mutateAsync(roleName);
  const adminRollback = async (entity: any) => adminRollbackMutation.mutateAsync(entity);

  return {
    createTenant,
    updateTenant,
    createTeam,
    updateTeam,
    updateUser,
    createRole,
    updateRole,
    deleteRole,
    adminRollback,
  };
}

// Enhanced Team Member Management Hook - Remove redundant cache invalidations
export function useTeamMemberMutationV2() {
  const queryClient = useQueryClient();

  const addMemberMutation = useMutation({
    mutationFn: async ({ teamName, userId, user, tenantName, teamId }: { teamName: string; userId: string; user: any; tenantName?: string; teamId?: number }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      
      const response = await fetch(`/api/teams/${teamName}/members`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'add', memberId: userId }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to add team member: ${text}`);
      }
      return response.json();
    },
    onMutate: async ({ teamName, user, tenantName, teamId }) => {
      // Optimistic update for multiple cache patterns
      const keys = [
        CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
        // CRITICAL: Also update TeamDashboard cache key pattern
        ...(tenantName && teamId ? [['teamMembers', tenantName, teamId, teamName]] : [])
      ];
      
      const previousData = [];
      for (const key of keys) {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<any[]>(key);
        previousData.push({ key, previous });
        queryClient.setQueryData<any[]>(key, (old) => old ? [...old, user] : [user]);
      }
      
      return { previousData };
    },
    onError: (_err, _vars, ctx: any) => {
      // Rollback all optimistic updates
      if (ctx?.previousData) {
        ctx.previousData.forEach(({ key, previous }: any) => {
          if (previous) queryClient.setQueryData(key, previous);
        });
      }
    },
    onSuccess: async (_result, { teamName, tenantName, teamId }) => {
      // Modern comprehensive cache invalidation
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      await queryClient.invalidateQueries({ queryKey: ['team-notification-settings', teamName] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      // CRITICAL: Also invalidate notification component team member cache
      await queryClient.invalidateQueries({ queryKey: [`/api/get_team_members/${teamName}`] });
      
      // CRITICAL: Invalidate TeamDashboard cache key pattern
      if (tenantName && teamId) {
        await queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
        await queryClient.refetchQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
      }
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ teamName, userId, tenantName, teamId }: { teamName: string; userId: string; tenantName?: string; teamId?: number }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      
      const response = await fetch(`/api/teams/${teamName}/members`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'remove', memberId: userId }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to remove team member: ${text}`);
      }
      return response.json();
    },
    onMutate: async ({ teamName, userId, tenantName, teamId }) => {
      // Optimistic update for multiple cache patterns
      const keys = [
        CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
        // CRITICAL: Also update TeamDashboard cache key pattern
        ...(tenantName && teamId ? [['teamMembers', tenantName, teamId, teamName]] : [])
      ];
      
      const previousData = [];
      for (const key of keys) {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<any[]>(key);
        previousData.push({ key, previous });
        queryClient.setQueryData<any[]>(key, (old) => 
          old ? old.filter(member => member.id !== parseInt(userId)) : []
        );
      }
      
      return { previousData };
    },
    onError: (_err, _vars, ctx: any) => {
      // Rollback all optimistic updates
      if (ctx?.previousData) {
        ctx.previousData.forEach(({ key, previous }: any) => {
          if (previous) queryClient.setQueryData(key, previous);
        });
      }
    },
    onSuccess: async (_result, { teamName, tenantName, teamId }) => {
      // Modern comprehensive cache invalidation
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      await queryClient.invalidateQueries({ queryKey: ['team-notification-settings', teamName] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      // CRITICAL: Also invalidate notification component team member cache
      await queryClient.invalidateQueries({ queryKey: [`/api/get_team_members/${teamName}`] });
      
      // CRITICAL: Invalidate TeamDashboard cache key pattern
      if (tenantName && teamId) {
        await queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
        await queryClient.refetchQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
      }
    },
  });

  const addMember = async (teamName: string, userId: string, user: any, tenantName?: string, teamId?: number) =>
    addMemberMutation.mutateAsync({ teamName, userId, user, tenantName, teamId });
  const removeMember = async (teamName: string, userId: string, tenantName?: string, teamId?: number) =>
    removeMemberMutation.mutateAsync({ teamName, userId, tenantName, teamId });

  return { addMember, removeMember };
}