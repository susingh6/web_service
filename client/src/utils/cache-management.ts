import { useQueryClient } from '@tanstack/react-query';

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
    ...CACHE_PATTERNS.TEAMS.DETAILS(teamName),
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.USERS.ALL,
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(),
  ],
  
  TEAM_MEMBER_REMOVED: (teamName: string) => [
    ...CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
    ...CACHE_PATTERNS.TEAMS.DETAILS(teamName),
    ...CACHE_PATTERNS.TEAMS.LIST,
    ...CACHE_PATTERNS.DASHBOARD.SUMMARY(),
  ],
  
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
      keys.map(key => queryClient.invalidateQueries({ queryKey: key }))
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

  return {
    invalidateCache,
    invalidateByScenario,
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
    mutationFn: (variables: TVariables) => Promise<TData>;
    invalidationScenario?: {
      scenario: keyof typeof INVALIDATION_SCENARIOS;
      params: any[];
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
        await cacheManager.invalidateByScenario(
          invalidationScenario.scenario,
          ...invalidationScenario.params
        );
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

// Specialized hooks for common operations
export function useTeamMemberMutation() {
  const { executeWithOptimism } = useOptimisticMutation();

  const addMember = async (teamName: string, userId: string, user: any) => {
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
        updater: (old: any[] | undefined) => old ? [...old, user] : [user],
      },
      mutationFn: async () => {
        // This would be the actual API call
        const response = await fetch(`/api/teams/${teamName}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', memberId: userId }),
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
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TEAMS.MEMBERS(teamName),
        updater: (old: any[] | undefined) => 
          old ? old.filter(member => member.id !== parseInt(userId)) : [],
      },
      mutationFn: async () => {
        const response = await fetch(`/api/teams/${teamName}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove', memberId: userId }),
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
  const { executeWithOptimism } = useOptimisticMutation();

  const createEntity = async (entityData: any) => {
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.ENTITIES.LIST,
        updater: (old: any[] | undefined) => old ? [...old, { ...entityData, id: Date.now() }] : [entityData],
      },
      mutationFn: async () => {
        const response = await fetch('/api/entities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entityData),
        });
        if (!response.ok) throw new Error('Failed to create entity');
        return response.json();
      },
      invalidationScenario: {
        scenario: 'ENTITY_CREATED',
        params: [entityData.teamId],
      },
      rollbackKeys: [CACHE_PATTERNS.ENTITIES.LIST],
    });
  };

  const updateEntity = async (entityId: number, entityData: any) => {
    return executeWithOptimism({
      mutationFn: async () => {
        const response = await fetch(`/api/entities/${entityId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entityData),
        });
        if (!response.ok) throw new Error('Failed to update entity');
        return response.json();
      },
      invalidationScenario: {
        scenario: 'ENTITY_UPDATED',
        params: [entityId, entityData.teamId],
      },
    });
  };

  const deleteEntity = async (entityId: number, teamId: number) => {
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.ENTITIES.LIST,
        updater: (old: any[] | undefined) => 
          old ? old.filter(entity => entity.id !== entityId) : [],
      },
      mutationFn: async () => {
        const response = await fetch(`/api/entities/${entityId}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete entity');
        return response.ok;
      },
      invalidationScenario: {
        scenario: 'ENTITY_DELETED',
        params: [teamId],
      },
      rollbackKeys: [CACHE_PATTERNS.ENTITIES.LIST],
    });
  };

  return { createEntity, updateEntity, deleteEntity };
}