// Environment-based configuration
import { devConfig } from './dev';
import { stagingConfig } from './staging';
import { prodConfig } from './prod';

const env = import.meta.env.MODE || 'development';

interface ApiConfig {
  baseUrl: string;
  endpoints: {
    auth: {
      login: string;
      logout: string;
      register: string;
      user: string;
    };
    entities: string;
    teams: string;
    dashboard: {
      summary: string;
      teamPerformance: string;
      complianceTrend: string;
    };
    entity: {
      byId: (id: number) => string;
      byTeam: (teamId: number) => string;
      history: (entityId: number) => string;
      issues: (entityId: number) => string;
    };
    issues: {
      resolve: (issueId: number) => string;
    };
    debug: {
      teams: string;
    };
  };
  debug: boolean;
  logLevel: string;
  enableMockData: boolean;
}

const configs: Record<string, ApiConfig> = {
  development: devConfig,
  staging: stagingConfig,
  production: prodConfig,
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

// Export environment info
export const isDevelopment = env === 'development';
export const isStaging = env === 'staging';
export const isProduction = env === 'production'; 