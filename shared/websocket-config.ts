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
  
  eventFiltering: {
    'team-members-updated': ['app-layout', 'teams-management', 'team-dashboard'],
    'entity-updated': ['summary-dashboard', 'team-dashboard', 'teams-management'],
    'cache-updated': ['summary-dashboard', 'team-dashboard', 'teams-management'],
    'user_status_changed': ['users-management', 'teams-management'],
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

// Type definitions for better type safety
export type ComponentType = typeof WEBSOCKET_CONFIG.componentTypes[keyof typeof WEBSOCKET_CONFIG.componentTypes];
export type WebSocketEvent = typeof WEBSOCKET_CONFIG.events[keyof typeof WEBSOCKET_CONFIG.events];