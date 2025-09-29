import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { config } from '@/config';
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

interface WebSocketContextValue {
  ws: WebSocket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  connectionError: string | null;
  subscribe: (tenantName: string, teamName: string) => void;
  unsubscribe: (tenantName: string, teamName: string) => void;
  sendMessage: (message: any) => void;
  addEventListener: (event: string, callback: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const activeSubscriptions = useRef<Set<string>>(new Set());
  const eventListeners = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const lastVersions = useRef<Map<string, number>>(new Map());

  const authenticate = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    const sessionId = localStorage.getItem('fastapi_session_id');
    const componentType = 'singleton'; // Single connection for all components

    ws.current.send(JSON.stringify({
      type: 'authenticate',
      sessionId: sessionId || 'anonymous',
      userId: 'anonymous',
      componentType
    }));
  };

  const rehydrateSubscriptions = () => {
    activeSubscriptions.current.forEach(subscription => {
      const [tenantName, teamName] = subscription.split(':');
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'subscribe',
          tenantName,
          teamName
        }));
      }
    });
  };

  const connect = () => {
    try {
      const environment = import.meta.env.MODE || 'development';
      const forceSecure = environment === 'staging' || environment === 'production';
      const protocol = (window.location.protocol === 'https:' || forceSecure) ? 'wss:' : 'ws:';
      const host = window.location.host || 'localhost:5000';
      const wsUrl = `${protocol}//${host}${config.websocket.path}`;
      
      log.info('[WebSocket Singleton] Connecting to:', wsUrl);
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        log.info('[WebSocket Singleton] Connected');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        authenticate();
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.event === 'auth-required') {
            authenticate();
            return;
          }

          if (message.event === 'auth-success') {
            setIsAuthenticated(true);
            rehydrateSubscriptions();
            return;
          }
          
          if (message.event === 'auth-error' || message.event === 'auth-required') {
            setIsAuthenticated(false);
            return;
          }
          
          // Enhanced versioning for entity events
          if (message.event === config.websocket.events.entityUpdated) {
            const entityEvent = message.data;
            if (entityEvent?.version && entityEvent?.entityId) {
              const versionKey = `entity-${entityEvent.entityId}`;
              const lastVersion = lastVersions.current.get(versionKey) || 0;
              if (entityEvent.version <= lastVersion) {
                return;
              }
              lastVersions.current.set(versionKey, entityEvent.version);
            }
          }

          // Enhanced versioning for team member events
          if (message.event === config.websocket.events.teamMembersUpdated) {
            const teamEvent = message.data;
            if (teamEvent?.version && teamEvent?.teamName) {
              const versionKey = `team-${teamEvent.teamName}`;
              const lastVersion = lastVersions.current.get(versionKey) || 0;
              if (teamEvent.version <= lastVersion) {
                return;
              }
              lastVersions.current.set(versionKey, teamEvent.version);
            }
          }
          
          // Notify all listeners for this event
          const listeners = eventListeners.current.get(message.event);
          if (listeners) {
            listeners.forEach(callback => {
              try {
                callback(message.data);
              } catch (error) {
                log.error('[WebSocket Singleton] Error in event listener:', error);
              }
            });
          }

          // Notify wildcard '*' listeners
          const wildcardListeners = eventListeners.current.get('*');
          if (wildcardListeners) {
            wildcardListeners.forEach(callback => {
              try {
                callback(message);
              } catch (error) {
                log.error('[WebSocket Singleton] Error in wildcard listener:', error);
              }
            });
          }

          // Also notify cache-updated listeners with cacheType
          if (message.event === config.websocket.events.cacheUpdated) {
            const cacheListeners = eventListeners.current.get('cache-updated-with-type');
            if (cacheListeners) {
              cacheListeners.forEach(callback => {
                try {
                  callback({ data: message.data, cacheType: message.cacheType });
                } catch (error) {
                  log.error('[WebSocket Singleton] Error in cache listener:', error);
                }
              });
            }
          }
        } catch (error) {
          log.error('[WebSocket Singleton] Error parsing message:', error);
        }
      };

      ws.current.onerror = (error) => {
        log.error('[WebSocket Singleton] Error:', error);
        setConnectionError('WebSocket connection error');
      };

      ws.current.onclose = () => {
        log.info('[WebSocket Singleton] Disconnected');
        setIsConnected(false);
        setIsAuthenticated(false);
        
        // Attempt reconnection
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
          log.info(`[WebSocket Singleton] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setConnectionError('Failed to connect after maximum retry attempts');
        }
      };
    } catch (error) {
      log.error('[WebSocket Singleton] Failed to create connection:', error);
      setConnectionError('Failed to create WebSocket connection');
    }
  };

  const subscribe = (tenantName: string, teamName: string) => {
    const subscription = `${tenantName}:${teamName}`;
    activeSubscriptions.current.add(subscription);
    
    if (ws.current && ws.current.readyState === WebSocket.OPEN && isAuthenticated) {
      ws.current.send(JSON.stringify({
        type: 'subscribe',
        tenantName,
        teamName
      }));
    }
  };

  const unsubscribe = (tenantName: string, teamName: string) => {
    const subscription = `${tenantName}:${teamName}`;
    activeSubscriptions.current.delete(subscription);
    
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'unsubscribe',
        tenantName,
        teamName
      }));
    }
  };

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      log.warn('[WebSocket Singleton] Not connected, message not sent:', message);
    }
  };

  const addEventListener = (event: string, callback: (data: any) => void) => {
    if (!eventListeners.current.has(event)) {
      eventListeners.current.set(event, new Set());
    }
    eventListeners.current.get(event)!.add(callback);
    
    // Return cleanup function
    return () => {
      const listeners = eventListeners.current.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          eventListeners.current.delete(event);
        }
      }
    };
  };

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const value: WebSocketContextValue = {
    ws: ws.current,
    isConnected,
    isAuthenticated,
    connectionError,
    subscribe,
    unsubscribe,
    sendMessage,
    addEventListener
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
};
