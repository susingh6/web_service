import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';

interface WebSocketMessage {
  event: string;
  data: any;
  timestamp: string;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onCacheUpdated?: (data: any) => void;
  onEntityUpdated?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  // For subscription management
  tenantName?: string;
  teamName?: string;
  sessionId?: string;
  userId?: string;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const currentSubscription = useRef<string | null>(null);
  const lastVersions = useRef<Map<string, number>>(new Map());

  const connect = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}${config.websocket.path}`;
      
      // Connecting to WebSocket
      
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
          
          // Handle authentication responses
          if (message.event === 'auth-success') {
            setIsAuthenticated(true);
            // Subscribe to current page after authentication
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
          
          // Call specific event handlers with race condition protection
          switch (message.event) {
            case config.websocket.events.cacheUpdated:
              options.onCacheUpdated?.(message.data);
              break;
            case config.websocket.events.entityUpdated:
              // Check for race conditions and out-of-order delivery
              const entityEvent = message.data;
              if (entityEvent?.version && entityEvent?.entityId) {
                const lastVersion = lastVersions.current.get(entityEvent.entityId) || 0;
                if (entityEvent.version <= lastVersion) {
                  // Ignore older or duplicate events
                  console.log(`Ignoring out-of-order event for entity ${entityEvent.entityId}`);
                  return;
                }
                lastVersions.current.set(entityEvent.entityId, entityEvent.version);
              }
              options.onEntityUpdated?.(message.data);
              break;
            default:
              // Unknown WebSocket event
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = () => {
        // WebSocket disconnected
        setIsConnected(false);
        options.onDisconnect?.();
        
        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          // Reconnecting
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          setConnectionError('Max reconnection attempts reached');
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
    if (options.sessionId) {
      sendMessage({
        type: 'authenticate',
        sessionId: options.sessionId,
        userId: options.userId || 'anonymous'
      });
    }
  };

  const subscribe = (tenantName: string, teamName: string) => {
    if (!isAuthenticated) return;
    
    const subscriptionKey = `${tenantName}:${teamName}`;
    if (currentSubscription.current === subscriptionKey) return;
    
    // Unsubscribe from previous if exists
    if (currentSubscription.current) {
      const [prevTenant, prevTeam] = currentSubscription.current.split(':');
      sendMessage({
        type: 'unsubscribe',
        tenantName: prevTenant,
        teamName: prevTeam
      });
    }
    
    // Subscribe to new
    sendMessage({
      type: 'subscribe',
      tenantName,
      teamName
    });
    
    currentSubscription.current = subscriptionKey;
  };

  const unsubscribe = () => {
    if (!isAuthenticated || !currentSubscription.current) return;
    
    const [tenantName, teamName] = currentSubscription.current.split(':');
    sendMessage({
      type: 'unsubscribe',
      tenantName,
      teamName
    });
    
    currentSubscription.current = null;
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