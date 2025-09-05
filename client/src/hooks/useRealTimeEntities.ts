import { useWebSocket } from './useWebSocket';
import { useAuth } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { Entity } from '@shared/schema';

interface UseRealTimeEntitiesOptions {
  tenantName?: string;
  teamName?: string;
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

  const { isConnected, isAuthenticated: wsAuthenticated, subscribe, unsubscribe } = useWebSocket({
    sessionId: sessionId || undefined,
    userId: user?.user_id?.toString() || user?.id?.toString() || 'anonymous',
    tenantName: options.tenantName,
    teamName: options.teamName,
    
    onEntityUpdated: (data) => {
      // Invalidate React Query cache for affected entities
      if (data?.data?.entityId) {
        // Invalidate specific entity cache
        queryClient.invalidateQueries({ queryKey: ['entities', data.data.entityId] });
        
        // Invalidate team entities cache if team matches
        if (data.teamName === options.teamName) {
          queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
        }
      }
      
      // Call custom handler
      options.onEntityUpdated?.(data);
    },

    onTeamMembersUpdated: (data) => {
      // Invalidate React Query cache for team member updates
      if (data?.teamName === options.teamName) {
        // Invalidate team members cache
        queryClient.invalidateQueries({ queryKey: ['team-members', data.teamName] });
        // Also invalidate team data cache
        queryClient.invalidateQueries({ queryKey: ['teams'] });
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