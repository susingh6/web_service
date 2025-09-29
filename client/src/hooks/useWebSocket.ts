import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';
const log = getLogger();

interface WebSocketMessage {
  event: string;
  data: any;
  timestamp: string;
  originalEvent?: string;
  isEcho?: boolean;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onCacheUpdated?: (data: any) => void;
  onEntityUpdated?: (data: any) => void;
  onTeamMembersUpdated?: (data: any) => void;
  onUserStatusChanged?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  // For subscription management
  tenantName?: string;
  teamName?: string;
  sessionId?: string;
  userId?: string;
  componentType?: string;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const activeSubscriptions = useRef<Set<string>>(new Set());
  const lastVersions = useRef<Map<string, number>>(new Map());

  const connect = () => {
    try {
      // Force WSS in staging/production, allow WS only in development
      const environment = import.meta.env.MODE || 'development';
      const forceSecure = environment === 'staging' || environment === 'production';
      const protocol = (window.location.protocol === 'https:' || forceSecure) ? 'wss:' : 'ws:';
      
      // Handle undefined host with proper fallback
      const host = window.location.host || 'localhost:5000';
      const wsUrl = `${protocol}//${host}${config.websocket.path}`;
      
      log.info('Connecting to WebSocket:', wsUrl);
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        // WebSocket connected
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        // Authenticate immediately if we have session info
        if (options.sessionId) {
          authenticate();
        }
        
        options.onConnect?.();
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Dev-friendly: auto-authenticate if server requests it
          if (message.event === 'auth-required') {
            authenticate();
            return;
          }

          // Handle authentication responses
          if (message.event === 'auth-success') {
            setIsAuthenticated(true);
            // Re-subscribe to all active subscriptions after authentication
            rehydrateSubscriptions();
            
            // Also subscribe to current page if not already subscribed
            if (options.tenantName && options.teamName) {
              subscribe(options.tenantName, options.teamName);
            }
            return;
          }
          
          if (message.event === 'auth-error' || message.event === 'auth-required') {
            setIsAuthenticated(false);
            return;
          }
          
          // Call general message handler
          options.onMessage?.(message);
          
          // Call specific event handlers with enhanced versioning protection
          switch (message.event) {
            case config.websocket.events.cacheUpdated:
              options.onCacheUpdated?.(message.data);
              break;
            case config.websocket.events.entityUpdated:
              // Enhanced versioning for entity events
              const entityEvent = message.data;
              if (entityEvent?.version && entityEvent?.entityId) {
                const versionKey = `entity-${entityEvent.entityId}`;
                const lastVersion = lastVersions.current.get(versionKey) || 0;
                if (entityEvent.version <= lastVersion) {
                  log.debug(`Ignoring out-of-order entity event ${entityEvent.version} <= ${lastVersion} for entity ${entityEvent.entityId}`);
                  return;
                }
                lastVersions.current.set(versionKey, entityEvent.version);
              }
              options.onEntityUpdated?.(message.data);
              break;
            case config.websocket.events.teamMembersUpdated:
              // Enhanced versioning for team member events
              const teamEvent = message.data;
              if (teamEvent?.version && teamEvent?.teamName) {
                const versionKey = `team-${teamEvent.teamName}`;
                const lastVersion = lastVersions.current.get(versionKey) || 0;
                if (teamEvent.version <= lastVersion) {
                  console.warn(`⏸️ Ignoring out-of-order team event ${teamEvent.version} <= ${lastVersion} for team ${teamEvent.teamName}`);
                  log.debug(`Ignoring out-of-order team event ${teamEvent.version} <= ${lastVersion} for team ${teamEvent.teamName}`);
                  return;
                }
                lastVersions.current.set(versionKey, teamEvent.version);
              }
              options.onTeamMembersUpdated?.(message.data);
              break;
            case config.websocket.events.userStatusChanged:
              // Handle user status changed events with toast notifications
              const userStatusEvent = message.data;
              log.info('User status changed:', userStatusEvent);
              
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
              
              // Call custom handler if provided
              options.onUserStatusChanged?.(message.data);
              break;
            case config.websocket.events.echoToOrigin:
              // Handle echo-to-origin for instant feedback
              log.debug('Received echo-to-origin:', message.data);
              // Process echo as the original event type for instant UI updates
              if (message.originalEvent === config.websocket.events.entityUpdated) {
                options.onEntityUpdated?.(message.data);
              } else if (message.originalEvent === config.websocket.events.teamMembersUpdated) {
                options.onTeamMembersUpdated?.(message.data);
              }
              break;
            default:
              // Handle heartbeat and other system messages
              if (message.event === 'heartbeat-ping') {
                // Respond to server heartbeat
                sendMessage({ type: 'pong', timestamp: new Date().toISOString() });
              } else if (message.event === 'pong') {
                // Server responding to our ping
                log.debug('Received pong from server');
              } else {
                log.debug('Unknown WebSocket event:', message.event);
              }
          }
        } catch (error) {
          log.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = () => {
        // WebSocket disconnected
        setIsConnected(false);
        setIsAuthenticated(false);
        options.onDisconnect?.();
        
        log.info(`WebSocket disconnected. Active subscriptions to rehydrate:`, Array.from(activeSubscriptions.current));
        
        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          setConnectionError('Max reconnection attempts reached');
          console.error('Max reconnection attempts reached. Active subscriptions lost:', Array.from(activeSubscriptions.current));
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('WebSocket connection error');
        options.onError?.(error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError('Failed to create WebSocket connection');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    setIsConnected(false);
    reconnectAttempts.current = 0;
  };

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  };

  const authenticate = () => {
    sendMessage({
      type: 'authenticate',
      sessionId: options.sessionId || 'anonymous',
      userId: options.userId || 'anonymous',
      componentType: options.componentType || 'unknown'
    });
  };

  const subscribe = (tenantName: string, teamName: string) => {
    if (!isAuthenticated) return;
    
    const subscriptionKey = `${tenantName}:${teamName}`;
    if (activeSubscriptions.current.has(subscriptionKey)) return;
    
    // Add to active subscriptions and send subscribe message
    activeSubscriptions.current.add(subscriptionKey);
    sendMessage({
      type: 'subscribe',
      tenantName,
      teamName
    });
    
    console.log(`Subscribed to ${subscriptionKey}. Active subscriptions:`, Array.from(activeSubscriptions.current));
  };

  const unsubscribe = (tenantName?: string, teamName?: string) => {
    if (!isAuthenticated) return;
    
    if (tenantName && teamName) {
      // Unsubscribe from specific tenant:team
      const subscriptionKey = `${tenantName}:${teamName}`;
      if (activeSubscriptions.current.has(subscriptionKey)) {
        activeSubscriptions.current.delete(subscriptionKey);
        sendMessage({
          type: 'unsubscribe',
          tenantName,
          teamName
        });
        console.log(`Unsubscribed from ${subscriptionKey}. Active subscriptions:`, Array.from(activeSubscriptions.current));
      }
    } else {
      // Unsubscribe from all
      activeSubscriptions.current.forEach(subscriptionKey => {
        const [tenant, team] = subscriptionKey.split(':');
        sendMessage({
          type: 'unsubscribe',
          tenantName: tenant,
          teamName: team
        });
      });
      activeSubscriptions.current.clear();
      console.log('Unsubscribed from all subscriptions');
    }
  };

  // Rehydrate all active subscriptions on reconnect
  const rehydrateSubscriptions = () => {
    if (!isAuthenticated || activeSubscriptions.current.size === 0) return;
    
    console.log('Rehydrating subscriptions:', Array.from(activeSubscriptions.current));
    
    // Re-subscribe to all active subscriptions
    activeSubscriptions.current.forEach(subscriptionKey => {
      const [tenantName, teamName] = subscriptionKey.split(':');
      if (tenantName && teamName) {
        sendMessage({
          type: 'subscribe',
          tenantName,
          teamName
        });
      }
    });
  };

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-subscribe when tenantName/teamName change
  useEffect(() => {
    if (isAuthenticated && options.tenantName && options.teamName) {
      subscribe(options.tenantName, options.teamName);
    }
    
    // Cleanup: unsubscribe when component unmounts or dependencies change
    return () => {
      if (options.tenantName && options.teamName) {
        unsubscribe(options.tenantName, options.teamName);
      }
    };
  }, [isAuthenticated, options.tenantName, options.teamName]);

  return {
    isConnected,
    connectionError,
    isAuthenticated,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
  };
};