import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cacheKeys, invalidateEntityCaches } from '@/lib/cacheKeys';

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
        if (!response.ok) throw new Error(`Failed to create ${config.entityType}`);
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
        return old.map(entity => entity[identifierField] === entityId ? { ...entity, ...data } : entity);
      });
      return { ...data, [identifierField]: entityId };
    }

    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: config.cacheKeyPattern,
        updater: (old: any[] | undefined) => {
          if (!old) return [];
          return old.map(entity => entity[identifierField] === entityId ? { ...entity, ...data } : entity);
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
        if (!response.ok) throw new Error(`Failed to update ${config.entityType}`);
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
        if (!response.ok) throw new Error(`Failed to delete ${config.entityType}`);
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
  ],
  
  TEAM_MEMBER_REMOVED: (teamName: string) => [
    ...CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
    ['team-members', teamName],
    ...CACHE_PATTERNS.TEAMS.DETAILS(teamName),
    ...CACHE_PATTERNS.TEAMS.LIST,
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
  
  TABLE_ENTITY_UPDATED: (entityId: number, teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('table'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'table'),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(), // Invalidate summary cache for immediate count update
  ],
  
  DAG_ENTITY_UPDATED: (entityId: number, teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('dag'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'dag'),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
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
          if (!response.ok) throw new Error('Failed to fetch entities');
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
          if (!response.ok) throw new Error('Failed to fetch team entities');
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
        if (!response.ok) throw new Error('Failed to add member');
        return response.json();
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
        if (!response.ok) throw new Error('Failed to remove member');
        return response.json();
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      const response = await fetch('/api/entities', {
        method: 'POST',
        headers,
        body: JSON.stringify(entityData),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to create entity');
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
    mutationFn: async ({ entityId, entityData }: { entityId: number; entityData: any }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      const response = await fetch(`/api/entities/${entityId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(entityData),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update entity');
      return response.json();
    },
    onMutate: async ({ entityId, entityData }) => {
      const key = cacheKeys.entitiesByTenantAndTeam(entityData.tenant_name, entityData.teamId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      queryClient.setQueryData<any[]>(key, (old) => {
        if (!old) return [] as any[];
        return old.map(e => e.id === entityId ? { ...e, ...entityData } : e);
      });
      return { previous, key };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: async (_res, _err, vars) => {
      await invalidateEntityCaches(queryClient, {
        tenant: vars?.entityData?.tenant_name,
        teamId: vars?.entityData?.teamId,
        entityId: vars?.entityId,
      });
    },
  });

  // DELETE
  const deleteMutation = useMutation({
    mutationFn: async ({ entityId }: { entityId: number }) => {
      const headers: Record<string, string> = {};
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      const response = await fetch(`/api/entities/${entityId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete entity');
      return true;
    },
    onMutate: async ({ entityId, tenant, teamId }: { entityId: number; tenant?: string; teamId: number }) => {
      const effectiveTenant = tenant || 'Data Engineering';
      const key = cacheKeys.entitiesByTenantAndTeam(effectiveTenant, teamId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key);
      queryClient.setQueryData<any[]>(key, (old) => old ? old.filter(e => e.id !== entityId) : []);
      return { previous, key, tenant: effectiveTenant, teamId };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: async (_res, _err, vars: any, ctx: any) => {
      await invalidateEntityCaches(queryClient, {
        tenant: ctx?.tenant,
        teamId: ctx?.teamId,
        entityId: vars?.entityId,
      });
    },
  });

  const createEntity = async (entityData: any) => createMutation.mutateAsync(entityData);
  const updateEntity = async (entityId: number, entityData: any) => updateMutation.mutateAsync({ entityId, entityData });
  const deleteEntity = async (entityId: number, teamId: number, _entityType: 'table' | 'dag', tenantName?: string) =>
    deleteMutation.mutateAsync({ entityId, teamId, tenant: tenantName });

  return { createEntity, updateEntity, deleteEntity };
}