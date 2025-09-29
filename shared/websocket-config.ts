// Shared WebSocket configuration for both client and server
export const WEBSOCKET_CONFIG = {
  componentTypes: {
    APP_LAYOUT: 'app-layout',
    TEAMS_MANAGEMENT: 'teams-management', 
    TEAM_DASHBOARD: 'team-dashboard',
    SUMMARY_DASHBOARD: 'summary-dashboard',
    ROLLBACK_MANAGEMENT: 'rollback-management',
    CONFLICTS_MANAGEMENT: 'conflicts-management',
    USERS_MANAGEMENT: 'users-management',
  },
  
  // Cache update types for granular filtering
  cacheUpdateTypes: {
    TEAM_MEMBERS: 'team-members-cache',
    TEAM_DETAILS: 'team-details-cache',
    TEAM_NOTIFICATIONS: 'team-notifications-cache',
    ENTITIES: 'entities-cache',
    ENTITY_OWNERSHIP: 'entity-ownership-cache',
    USERS: 'users-cache',
    TENANTS: 'tenants-cache',
    CONFLICTS: 'conflicts-cache',
    METRICS: 'metrics-cache',
    GENERAL: 'general-cache', // Fallback for operations affecting multiple areas
  },
  
  eventFiltering: {
    'team-members-updated': ['app-layout', 'teams-management', 'team-dashboard'],
    'entity-updated': ['summary-dashboard', 'team-dashboard', 'teams-management'],
    'cache-updated': ['summary-dashboard', 'team-dashboard', 'teams-management'],
    'user_status_changed': ['users-management', 'teams-management'],
  } as Record<string, string[]>,
  
  // Granular cache update filtering - maps cache types to components that need them
  cacheUpdateFiltering: {
    'team-members-cache': ['teams-management', 'team-dashboard', 'singleton'],
    'team-details-cache': ['teams-management', 'team-dashboard', 'singleton'],
    'team-notifications-cache': ['teams-management', 'singleton'],
    'entities-cache': ['summary-dashboard', 'team-dashboard', 'teams-management', 'rollback-management', 'singleton'],
    'entity-ownership-cache': ['summary-dashboard', 'team-dashboard', 'teams-management', 'singleton'],
    'users-cache': ['teams-management', 'users-management', 'singleton'],
    'tenants-cache': ['teams-management', 'summary-dashboard', 'singleton'],
    'conflicts-cache': ['conflicts-management', 'singleton'],
    'metrics-cache': ['summary-dashboard', 'team-dashboard', 'singleton'],
    'general-cache': ['summary-dashboard', 'team-dashboard', 'teams-management', 'singleton'], // Broad updates
  } as Record<string, string[]>,
  
  events: {
    CACHE_UPDATED: 'cache-updated',
    ENTITY_UPDATED: 'entity-updated',
    ENTITIES_UPDATED: 'entities-updated',
    TEAM_MEMBERS_UPDATED: 'team-members-updated',
    ECHO_TO_ORIGIN: 'echo-to-origin',
    USER_STATUS_CHANGED: 'user_status_changed',
  }
} as const;

// Helper function to check if a component should receive an event
export const shouldReceiveEvent = (event: string, componentType: string): boolean => {
  const allowedComponents = (WEBSOCKET_CONFIG.eventFiltering as Record<string, string[]>)[event];
  return allowedComponents ? allowedComponents.includes(componentType) : true;
};

// Helper function to check if a component should receive a cache update
export const shouldReceiveCacheUpdate = (cacheType: string, componentType: string): boolean => {
  const allowedComponents = (WEBSOCKET_CONFIG.cacheUpdateFiltering as Record<string, string[]>)[cacheType];
  return allowedComponents ? allowedComponents.includes(componentType) : true;
};

// Type definitions for better type safety
export type ComponentType = typeof WEBSOCKET_CONFIG.componentTypes[keyof typeof WEBSOCKET_CONFIG.componentTypes];
export type WebSocketEvent = typeof WEBSOCKET_CONFIG.events[keyof typeof WEBSOCKET_CONFIG.events];
export type CacheUpdateType = typeof WEBSOCKET_CONFIG.cacheUpdateTypes[keyof typeof WEBSOCKET_CONFIG.cacheUpdateTypes];

// Shared SocketData interface for authenticated WebSocket connections
// This ensures type consistency between routes.ts and redis-cache.ts
export interface SocketData {
  sessionId: string;
  userId: string;
  componentType: string; // Required - no optional, defaults to 'unknown' during authentication
  subscriptions: Set<string>; // tenant:team format
  lastPong?: number; // Optional - for heartbeat monitoring
  isAlive?: boolean; // Optional - for heartbeat status
}