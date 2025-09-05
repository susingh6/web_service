import { useQueryClient } from '@tanstack/react-query';

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
    // DON'T invalidate summary cache - let it refresh on schedule
  ],
  
  DAG_ENTITY_CREATED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('dag'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'dag'),
    // DON'T invalidate summary cache - let it refresh on schedule
  ],
  
  TABLE_ENTITY_UPDATED: (entityId: number, teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('table'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'table'),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
    // DON'T invalidate summary cache - let it refresh on schedule
  ],
  
  DAG_ENTITY_UPDATED: (entityId: number, teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('dag'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'dag'),
    ...CACHE_PATTERNS.ENTITIES.DETAILS(entityId),
    ...CACHE_PATTERNS.ENTITIES.HISTORY(entityId),
    // DON'T invalidate summary cache - let it refresh on schedule
  ],
  
  TABLE_ENTITY_DELETED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('table'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'table'),
    // DON'T invalidate summary cache - let it refresh on schedule
  ],
  
  DAG_ENTITY_DELETED: (teamId: number) => [
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
    ...CACHE_PATTERNS.ENTITIES.BY_TYPE('dag'),
    ...CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, 'dag'),
    // DON'T invalidate summary cache - let it refresh on schedule
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
          
          const response = await fetch(`/api/entities?teamId=${teamId}&type=${entityType}`, {
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
          
          const response = await fetch(`/api/entities?teamId=${teamId}`, {
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
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();

  const createEntity = async (entityData: any) => {
    const entityType = entityData.type as 'table' | 'dag';
    const scenario = entityType === 'table' ? 'TABLE_ENTITY_CREATED' : 'DAG_ENTITY_CREATED';
    
    // Generate optimistic ID for tracking
    const optimisticId = Date.now();
    const optimisticEntity = { ...entityData, id: optimisticId };
    
    const result = await executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.ENTITIES.BY_TEAM(entityData.teamId),
        updater: (old: any[] | undefined) => old ? [...old, optimisticEntity] : [optimisticEntity],
      },
      mutationFn: async () => {
        // Build headers with session ID for RBAC enforcement
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        
        // CRITICAL: Add X-Session-ID header for FastAPI RBAC
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) {
          headers['X-Session-ID'] = sessionId;
        }
        
        const response = await fetch('/api/entities', {
          method: 'POST',
          headers,
          body: JSON.stringify(entityData),
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to create entity');
        return response.json();
      },
      invalidationScenario: {
        scenario,
        params: [entityData.teamId],
        rebuildOptions: { teamId: entityData.teamId, entityType },
      },
      rollbackKeys: [CACHE_PATTERNS.ENTITIES.BY_TEAM(entityData.teamId)],
    });

    // After successful creation, replace optimistic entry with real server response
    if (result) {
      cacheManager.setOptimisticData(
        CACHE_PATTERNS.ENTITIES.BY_TEAM(entityData.teamId),
        (old: any[] | undefined) => {
          if (!old) return [result];
          // Replace optimistic entity with real server response
          return old.map(entity => entity.id === optimisticId ? result : entity);
        }
      );
      
      // Process any queued operations for this optimistic entity
      const queuedOps = pendingOperationsQueue.get(optimisticId);
      if (queuedOps && queuedOps.length > 0) {
        // Apply queued operations to the real entity
        queuedOps.forEach(async (op) => {
          try {
            if (result && typeof result === 'object' && 'id' in result) {
              if (op.type === 'update') {
                // Apply the queued update to the real entity
                await updateEntity(result.id as number, op.entityData);
              } else if (op.type === 'delete') {
                // Apply the queued delete to the real entity
                await deleteEntity(result.id as number, op.teamId, op.entityType);
              }
            }
          } catch (error) {
            console.warn(`Failed to apply queued ${op.type} operation:`, error);
          }
        });
        
        // Clean up the queue
        pendingOperationsQueue.delete(optimisticId);
      }
    }

    return result;
  };

  const updateEntity = async (entityId: number, entityData: any) => {
    const entityType = entityData.type as 'table' | 'dag';
    const scenario = entityType === 'table' ? 'TABLE_ENTITY_UPDATED' : 'DAG_ENTITY_UPDATED';
    
    // Handle optimistic entities differently
    if (isOptimisticId(entityId)) {
      // Queue the operation for when real ID arrives
      const existingQueue = pendingOperationsQueue.get(entityId) || [];
      existingQueue.push({
        type: 'update',
        entityData,
        teamId: entityData.teamId,
        entityType,
        timestamp: Date.now()
      });
      pendingOperationsQueue.set(entityId, existingQueue);
      
      // Apply optimistic update to cache immediately
      cacheManager.setOptimisticData(
        CACHE_PATTERNS.ENTITIES.BY_TEAM(entityData.teamId),
        (old: any[] | undefined) => {
          if (!old) return [];
          return old.map(entity => 
            entity.id === entityId ? { ...entity, ...entityData } : entity
          );
        }
      );
      
      // Return optimistic entity
      return { ...entityData, id: entityId };
    }
    
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.ENTITIES.BY_TEAM(entityData.teamId),
        updater: (old: any[] | undefined) => {
          if (!old) return [];
          return old.map(entity => 
            entity.id === entityId ? { ...entity, ...entityData } : entity
          );
        },
      },
      mutationFn: async () => {
        // Build headers with session ID for RBAC enforcement
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        
        // CRITICAL: Add X-Session-ID header for FastAPI RBAC
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) {
          headers['X-Session-ID'] = sessionId;
        }
        
        const response = await fetch(`/api/entities/${entityId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(entityData),
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to update entity');
        return response.json();
      },
      invalidationScenario: {
        scenario,
        params: [entityId, entityData.teamId],
        rebuildOptions: { teamId: entityData.teamId, entityType },
      },
      rollbackKeys: [CACHE_PATTERNS.ENTITIES.BY_TEAM(entityData.teamId)],
    });
  };

  const deleteEntity = async (entityId: number, teamId: number, entityType: 'table' | 'dag') => {
    const scenario = entityType === 'table' ? 'TABLE_ENTITY_DELETED' : 'DAG_ENTITY_DELETED';
    
    // Handle optimistic entities differently  
    if (isOptimisticId(entityId)) {
      // For optimistic entities, just remove from cache immediately
      // No API call needed since entity doesn't exist on server yet
      cacheManager.setOptimisticData(
        CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
        (old: any[] | undefined) => 
          old ? old.filter(entity => entity.id !== entityId) : []
      );
      
      // Clean up any pending operations for this entity
      pendingOperationsQueue.delete(entityId);
      
      // Return success immediately
      return true;
    }
    
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId),
        updater: (old: any[] | undefined) => 
          old ? old.filter(entity => entity.id !== entityId) : [],
      },
      mutationFn: async () => {
        // Build headers with session ID for RBAC enforcement
        const headers: Record<string, string> = {};
        
        // CRITICAL: Add X-Session-ID header for FastAPI RBAC
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) {
          headers['X-Session-ID'] = sessionId;
        }
        
        const response = await fetch(`/api/entities/${entityId}`, {
          method: 'DELETE',
          headers,
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to delete entity');
        return response.ok;
      },
      invalidationScenario: {
        scenario,
        params: [teamId],
        rebuildOptions: { teamId, entityType },
      },
      rollbackKeys: [CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId)],
    });
  };

  return { createEntity, updateEntity, deleteEntity };
}