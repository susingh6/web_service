import { useWebSocket } from './useWebSocket';
import { useAuth } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { cacheKeys, invalidateEntityCaches } from '@/lib/cacheKeys';
import { Entity } from '@shared/schema';

interface UseRealTimeEntitiesOptions {
  tenantName?: string;
  teamName?: string;
  teamId?: number;
  onEntityUpdated?: (data: any) => void;
  onTeamMembersUpdated?: (data: any) => void;
}

/**
 * Complete real-time integration hook that combines:
 * - Authentication (session management)
 * - WebSocket subscription management (tenant/team filtering)
 * - Optimistic updates (immediate feedback)
 * - Cache invalidation (consistency)
 */
export const useRealTimeEntities = (options: UseRealTimeEntitiesOptions) => {
  const { sessionId, user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Derive userId with proper type guards for union type
  const getUserId = (): string => {
    if (!user) return 'anonymous';
    
    // FastAPIUser has user_id
    if (typeof user === 'object' && 'user_id' in user && user.user_id) {
      return String(user.user_id);
    }
    
    // User (local auth) has id
    if (typeof user === 'object' && 'id' in user && user.id) {
      return String(user.id);
    }
    
    // AccountInfo (Azure) has homeAccountId
    if (typeof user === 'object' && 'homeAccountId' in user && user.homeAccountId) {
      return user.homeAccountId;
    }
    
    return 'anonymous';
  };

  const { isConnected, isAuthenticated: wsAuthenticated, subscribe, unsubscribe } = useWebSocket({
    sessionId: sessionId || undefined,
    userId: getUserId(),
    tenantName: options.tenantName,
    teamName: options.teamName,
    
    onEntityUpdated: (data) => {
      // Invalidate React Query cache for affected entities
      if (options.tenantName) {
        invalidateEntityCaches(queryClient, {
          tenant: options.tenantName,
          teamId: options.teamId,
          entityId: data?.data?.entityId,
        });
      }
      
      // Call custom handler
      options.onEntityUpdated?.(data);
    },

    onTeamMembersUpdated: (data) => {
      // Invalidate React Query cache for team member updates
      if (data?.teamName === options.teamName && options.tenantName && options.teamId) {
        // Invalidate team members cache using normalized key
        queryClient.invalidateQueries({ queryKey: ['teamMembers', options.tenantName, options.teamId] });
      }
      
      // Call custom handler
      options.onTeamMembersUpdated?.(data);
    },

    onCacheUpdated: (data) => {
      // Invalidate all cache on general cache updates
      queryClient.invalidateQueries();
    },

    onConnect: () => {
      console.log('WebSocket connected - real-time updates enabled');
    },

    onDisconnect: () => {
      console.log('WebSocket disconnected - real-time updates paused');
    }
  });

  // Manual subscription management (for when user navigates)
  const subscribeToPage = (tenantName: string, teamName: string) => {
    if (wsAuthenticated) {
      subscribe(tenantName, teamName);
    }
  };

  const unsubscribeFromPage = () => {
    if (wsAuthenticated) {
      unsubscribe();
    }
  };

  return {
    // Connection status
    isConnected,
    wsAuthenticated,
    isRealTimeEnabled: isAuthenticated && isConnected && wsAuthenticated,
    
    // Manual subscription control
    subscribeToPage,
    unsubscribeFromPage,

    // Current subscription info
    isSubscribedTo: (tenantName: string, teamName: string) => {
      return options.tenantName === tenantName && options.teamName === teamName;
    }
  };
};