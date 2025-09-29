import { useWebSocket } from './useWebSocket';
import { useAuth } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { cacheKeys, invalidateEntityCaches } from '@/lib/cacheKeys';
import { Entity } from '@shared/schema';
import { useEffect, useRef } from 'react';

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

  // Coalesced invalidation buffers
  const pendingEntityInvalidationsRef = useRef<Array<{ tenant?: string; teamId?: number; entityId?: number | string; startDate?: string; endDate?: string }>>([]);
  const pendingQueryKeysRef = useRef<((string | object)[])[]>([]);
  const pendingGlobalInvalidateRef = useRef(false);
  const flushTimerRef = useRef<any>(null);

  const scheduleFlush = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(async () => {
      const entityParams = pendingEntityInvalidationsRef.current;
      const queryKeys = pendingQueryKeysRef.current;
      const doGlobal = pendingGlobalInvalidateRef.current;

      // Reset buffers before running invalidations to catch new events during work
      pendingEntityInvalidationsRef.current = [];
      pendingQueryKeysRef.current = [];
      pendingGlobalInvalidateRef.current = false;
      flushTimerRef.current = null;

      try {
        // Prefer targeted invalidations first
        if (entityParams.length > 0) {
          // Deduplicate param objects by JSON signature
          const seen = new Set<string>();
          for (const p of entityParams) {
            const sig = JSON.stringify(p);
            if (seen.has(sig)) continue;
            seen.add(sig);
            await invalidateEntityCaches(queryClient, p);
          }
        }

        if (queryKeys.length > 0) {
          // Deduplicate keys by JSON signature
          const seenKeys = new Set<string>();
          for (const key of queryKeys) {
            const sig = JSON.stringify(key);
            if (seenKeys.has(sig)) continue;
            seenKeys.add(sig);
            await queryClient.invalidateQueries({ queryKey: key });
          }
        }

        if (doGlobal) {
          await queryClient.invalidateQueries();
        }
      } catch (_err) {
        // Swallow errors; next events or user interactions will recover
      }
    }, 250);
  };

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
      // Queue targeted invalidations (coalesced)
      if (options.tenantName) {
        pendingEntityInvalidationsRef.current.push({
          tenant: options.tenantName,
          teamId: options.teamId,
          entityId: data?.data?.entityId,
        });
        scheduleFlush();
      }
      
      // Call custom handler
      options.onEntityUpdated?.(data);
    },

    onTeamMembersUpdated: (data) => {
      console.log('🔍 useRealTimeEntities: Received team members update:', {
        receivedData: data,
        currentOptions: {
          teamName: options.teamName,
          tenantName: options.tenantName,
          teamId: options.teamId
        },
        teamNameMatch: data?.teamName === options.teamName,
        hasRequiredOptions: !!(options.tenantName && options.teamId)
      });
      
      // Queue team members cache invalidation (coalesced)
      if (data?.teamName === options.teamName && options.tenantName && options.teamId) {
        console.log('✅ Team member cache invalidation scheduled for:', cacheKeys.teamMembers(options.tenantName, options.teamId));
        pendingQueryKeysRef.current.push([...cacheKeys.teamMembers(options.tenantName, options.teamId)] as (string | object)[]);
        scheduleFlush();
      } else {
        console.warn('❌ Team member cache invalidation skipped - conditions not met');
      }
      
      // Call custom handler
      options.onTeamMembersUpdated?.(data);
    },

    onCacheUpdated: (data) => {
      // Debounced global invalidation to avoid refetch storms
      pendingGlobalInvalidateRef.current = true;
      scheduleFlush();
    },

    onConnect: () => {
      console.log('WebSocket connected - real-time updates enabled');
    },

    onDisconnect: () => {
      console.log('WebSocket disconnected - real-time updates paused');
    }
  });

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingEntityInvalidationsRef.current = [];
      pendingQueryKeysRef.current = [];
      pendingGlobalInvalidateRef.current = false;
    };
  }, []);

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