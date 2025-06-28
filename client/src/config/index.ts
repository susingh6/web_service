// Environment-based configuration
import { devConfig } from './dev.js';
import { stagingConfig } from './staging.js';
import { prodConfig } from './prod.js';

const env = import.meta.env.MODE || 'development';

interface ApiConfig {
  baseUrl: string;
  endpoints: {
    entities: string;
    teams: string;
    dags: string;
    tables: string;
    dashboard: {
      summary: string;
      teamPerformance: string;
      complianceTrend: string;
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
export const buildUrl = (endpoint: string, params?: Record<string, string | number>): string => {
  let url = `${config.baseUrl}${endpoint}`;

  if (params && Object.keys(params).length > 0) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    url += `?${queryParams.toString()}`;
  }

  return url;
};

// Export individual endpoints for convenience
export const endpoints = config.endpoints;

// Export environment info
export const isDevelopment = env === 'development';
export const isStaging = env === 'staging';
export const isProduction = env === 'production'; 