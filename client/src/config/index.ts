// Environment-based configuration
import { devConfig } from './dev';
import { stagingConfig } from './staging';
import { prodConfig } from './prod';
import { fieldDefinitions } from './schemas';

const env = import.meta.env.MODE || 'development';

interface ApiConfig {
  baseUrl: string;
  endpoints: {
    auth: {
      login: string;
      logout: string;
      register: string;
      user: string;
      azureValidate: string;
    };
    entities: string;
    teams: string;
    tenants: string;
    teamDetails: (teamName: string) => string;
    teamMembers: (teamName: string) => string;
    users: {
      getAll: string;
      getTeamMembers: (teamName: string) => string;
    };
    dashboard: {
      summary: string;
      teamPerformance: (teamId: number) => string;
      complianceTrend: string;
    };
    entity: {
      byId: (id: number) => string;
      byTeam: (teamId: number) => string;
      history: (entityId: number) => string;
      issues: (entityId: number) => string;
      details: (entityId: number) => string;
      tasks: (entityId: number) => string;
      notificationTimelines: (entityId: number) => string;
      trends30Day: string;
      delete: (id: number) => string;
      currentDagSettings: (teamName: string, entityName: string) => string;
      currentTableSettings: (teamName: string, entityName: string) => string;
      historyChanges: (entityId: number) => string;
      ownerAndSlaSettings: (entityType: string, teamName: string, entityName: string) => string;
      slaStatusHistory: (entityType: string, teamName: string, entityName: string) => string;
      recentSettingsChanges: (entityType: string, teamName: string, entityName: string) => string;
    };
    tasks: {
      byDag: (dagId: number) => string;
      updatePriority: (taskId: number) => string;
    };
    issues: {
      resolve: (issueId: number) => string;
    };
    notificationTimelines: {
      create: string;
      byId: (id: string) => string;
      update: (id: string) => string;
      delete: (id: string) => string;
    };
    debug: {
      teams: string;
    };
    agent: {
      conversationSummaries: (dagId: number) => string;
      fullConversation: (conversationId: string) => string;
      sendMessage: (dagId: number) => string;
    };
    admin: {
      conflicts: {
        getAll: string;
        getById: (notificationId: string) => string;
        resolve: (notificationId: string) => string;
        create: string;
      };
      teams: {
        create: string;
        update: (teamId: number) => string;
        disable: (teamId: number) => string;
        enable: (teamId: number) => string;
      };
      tenants: {
        create: string;
        getAll: string;
        update: (tenantId: number) => string;
        disable: (tenantId: number) => string;
      };
      users: {
        getAll: string;
        create: string;
        update: (userId: number) => string;
        disable: (userId: number) => string;
        enable: (userId: number) => string;
      };
      roles: {
        getAll: string;
        create: string;
        update: (roleId: number) => string;
      };
    };
    fastapi?: {
      baseUrl: string;
      auth: {
        login: string;
        logout: string;
      };
    };
  };
  slaColorThresholds: {
    green: {
      min: number;
    };
    amber: {
      min: number;
      max: number;
    };
    red: {
      max: number;
    };
  };
  cacheConfig: {
    tenantRefreshHours: number;
    entityRefreshHours: number;
    trendRefreshHours: number;
    cacheStatus: string;
    cacheRefresh: string;
    incrementalUpdate: string;
    recentChanges: string;
  };
  websocket: {
    path: string;
    events: {
      cacheUpdated: string;
      entityUpdated: string;
      entitiesUpdated: string;
      teamMembersUpdated: string;
      echoToOrigin: string;
    };
    features: {
      enableEchoToOrigin: boolean;
      enableEventVersioning: boolean;
      multiTabSubscriptions: boolean;
    };
  };
  debug: boolean;
  logLevel: string;
  enableMockData: boolean;
  mock?: {
    entities?: boolean;
    dashboard?: boolean;
    teams?: boolean;
    tasks?: boolean;
    notifications?: boolean;
    agent?: boolean;
  };
}

const configs: Record<string, ApiConfig> = {
  development: devConfig as ApiConfig,
  staging: stagingConfig as ApiConfig,
  production: prodConfig as ApiConfig,
};

// Get current config based on environment
export const config = configs[env] || configs.development;

// Helper function to build full URL
export const buildUrl = (
  endpoint: string | ((...args: any[]) => string), 
  ...params: any[]
): string => {
  let path: string;
  
  if (typeof endpoint === 'function') {
    path = endpoint(...params);
  } else {
    path = endpoint;
  }
  
  return `${config.baseUrl}${path}`;
};

// Helper function for query parameters
export const buildUrlWithParams = (
  endpoint: string | ((...args: any[]) => string),
  queryParams?: Record<string, string | number>,
  ...pathParams: any[]
): string => {
  let url = buildUrl(endpoint, ...pathParams);

  if (queryParams && Object.keys(queryParams).length > 0) {
    const searchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });
    url += `?${searchParams.toString()}`;
  }

  return url;
};

// Export individual endpoints for convenience
export const endpoints = config.endpoints;

// SLA Color Threshold Utilities
export const getSlaColor = (compliancePercentage: number): 'green' | 'amber' | 'red' => {
  const thresholds = config.slaColorThresholds;
  
  if (compliancePercentage >= thresholds.green.min) {
    return 'green';
  } else if (compliancePercentage >= thresholds.amber.min && compliancePercentage <= thresholds.amber.max) {
    return 'amber';
  } else {
    return 'red';
  }
};

export const getSlaColorCode = (compliancePercentage: number): string => {
  const colorType = getSlaColor(compliancePercentage);
  
  switch (colorType) {
    case 'green':
      return '#4caf50'; // Material-UI green
    case 'amber':
      return '#ff9800'; // Material-UI orange/amber
    case 'red':
      return '#f44336'; // Material-UI red
    default:
      return '#9e9e9e'; // Material-UI grey fallback
  }
};

export const slaColorThresholds = config.slaColorThresholds;

// Export environment info
export const isDevelopment = env === 'development';
export const isStaging = env === 'staging';
export const isProduction = env === 'production';

// Export field definitions for centralized configuration
export { fieldDefinitions }; 