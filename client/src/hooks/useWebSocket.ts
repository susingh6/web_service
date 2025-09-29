import { useEffect, useRef, useState } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { config } from '@/config';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger();

interface WebSocketMessage {
  event: string;
  cacheType?: string;
  data: any;
  timestamp: string;
  originalEvent?: string;
  isEcho?: boolean;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onCacheUpdated?: (data: any, cacheType?: string) => void;
  onEntityUpdated?: (data: any) => void;
  onTeamMembersUpdated?: (data: any) => void;
  onUserStatusChanged?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  tenantName?: string;
  teamName?: string;
  sessionId?: string;
  userId?: string;
  componentType?: string;
}

/**
 * Lightweight WebSocket hook that uses the singleton connection from WebSocketContext.
 * Maintains full backward compatibility with existing infrastructure while preventing
 * multiple connection issues.
 */
export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const wsContext = useWebSocketContext();
  const [connectionState, setConnectionState] = useState({
    isConnected: wsContext.isConnected,
    isAuthenticated: wsContext.isAuthenticated,
    connectionError: wsContext.connectionError
  });
  
  const componentType = options.componentType || 'unknown';
  const lastVersions = useRef<Map<string, number>>(new Map());
  const cleanupFuncsRef = useRef<Array<() => void>>([]);

  // Sync connection state
  useEffect(() => {
    setConnectionState({
      isConnected: wsContext.isConnected,
      isAuthenticated: wsContext.isAuthenticated,
      connectionError: wsContext.connectionError
    });

    if (wsContext.isConnected && !connectionState.isConnected) {
      options.onConnect?.();
    } else if (!wsContext.isConnected && connectionState.isConnected) {
      options.onDisconnect?.();
    }
  }, [wsContext.isConnected, wsContext.isAuthenticated, wsContext.connectionError]);

  // Register event listeners on the singleton
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // Generic message handler
    if (options.onMessage) {
      const cleanup = wsContext.addEventListener('*', options.onMessage);
      cleanups.push(cleanup);
    }

    // Cache updated handler with granular cache type support
    if (options.onCacheUpdated) {
      const cleanup = wsContext.addEventListener('cache-updated-with-type', (payload) => {
        options.onCacheUpdated?.(payload.data, payload.cacheType);
      });
      cleanups.push(cleanup);
    }

    // Entity updated handler with versioning
    if (options.onEntityUpdated) {
      const cleanup = wsContext.addEventListener(config.websocket.events.entityUpdated, (data) => {
        // Enhanced versioning for entity events
        const entityEvent = data;
        if (entityEvent?.version && entityEvent?.entityId) {
          const versionKey = `entity-${entityEvent.entityId}`;
          const lastVersion = lastVersions.current.get(versionKey) || 0;
          if (entityEvent.version <= lastVersion) {
            log.debug(`[${componentType}] Ignoring out-of-order entity event ${entityEvent.version} <= ${lastVersion} for entity ${entityEvent.entityId}`);
            return;
          }
          lastVersions.current.set(versionKey, entityEvent.version);
        }
        options.onEntityUpdated?.(data);
      });
      cleanups.push(cleanup);
    }

    // Team members updated handler with versioning
    if (options.onTeamMembersUpdated) {
      const cleanup = wsContext.addEventListener(config.websocket.events.teamMembersUpdated, (data) => {
        // Enhanced versioning for team member events
        const teamEvent = data;
        if (teamEvent?.version && teamEvent?.teamName) {
          const versionKey = `team-${teamEvent.teamName}`;
          const lastVersion = lastVersions.current.get(versionKey) || 0;
          if (teamEvent.version <= lastVersion) {
            log.debug(`[${componentType}] Ignoring out-of-order team event ${teamEvent.version} <= ${lastVersion} for team ${teamEvent.teamName}`);
            return;
          }
          lastVersions.current.set(versionKey, teamEvent.version);
        }
        options.onTeamMembersUpdated?.(data);
      });
      cleanups.push(cleanup);
    }

    // User status changed handler with toast notifications
    if (options.onUserStatusChanged && config.websocket.events.userStatusChanged) {
      const cleanup = wsContext.addEventListener(config.websocket.events.userStatusChanged, (data) => {
        const userStatusEvent = data;
        log.info(`[${componentType}] User status changed:`, userStatusEvent);
        
        // Show toast notification based on status change
        if (userStatusEvent?.user_email && userStatusEvent?.is_active !== undefined) {
          const statusText = userStatusEvent.is_active ? 'activated' : 'deactivated';
          const toastVariant = userStatusEvent.is_active ? 'default' : 'destructive';
          
          toast({
            title: "User Status Changed",
            description: `User ${userStatusEvent.user_email} has been ${statusText}`,
            variant: toastVariant,
          });
        }
        
        options.onUserStatusChanged?.(data);
      });
      cleanups.push(cleanup);
    }

    // Echo-to-origin handler for instant feedback
    const echoCleanup = wsContext.addEventListener(config.websocket.events.echoToOrigin, (message) => {
      log.debug(`[${componentType}] Received echo-to-origin:`, message.data);
      
      // Process echo as the original event type for instant UI updates
      if (message.originalEvent === config.websocket.events.entityUpdated) {
        options.onEntityUpdated?.(message.data);
      } else if (message.originalEvent === config.websocket.events.teamMembersUpdated) {
        options.onTeamMembersUpdated?.(message.data);
      }
    });
    cleanups.push(echoCleanup);

    cleanupFuncsRef.current = cleanups;

    return () => {
      cleanups.forEach(cleanup => cleanup());
      cleanupFuncsRef.current = [];
    };
  }, [
    options.onMessage, 
    options.onCacheUpdated, 
    options.onEntityUpdated, 
    options.onTeamMembersUpdated, 
    options.onUserStatusChanged,
    componentType
  ]);

  // Auto-subscribe when tenantName/teamName are provided and authenticated
  useEffect(() => {
    if (wsContext.isAuthenticated && options.tenantName && options.teamName) {
      wsContext.subscribe(options.tenantName, options.teamName);
      
      return () => {
        if (options.tenantName && options.teamName) {
          wsContext.unsubscribe(options.tenantName, options.teamName);
        }
      };
    }
  }, [wsContext.isAuthenticated, options.tenantName, options.teamName]);

  return {
    isConnected: connectionState.isConnected,
    connectionError: connectionState.connectionError,
    isAuthenticated: connectionState.isAuthenticated,
    connect: () => log.warn('[useWebSocket] connect() called but using singleton - no-op'),
    disconnect: () => log.warn('[useWebSocket] disconnect() called but using singleton - no-op'),
    sendMessage: wsContext.sendMessage,
    subscribe: wsContext.subscribe,
    unsubscribe: wsContext.unsubscribe,
  };
};
