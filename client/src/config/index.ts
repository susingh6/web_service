/**
 * Configuration Module
 *
 * Centralizes all application configuration and environment variables.
 * This module handles different environments (development, production)
 * and provides type-safe access to configuration values.
 *
 * @module config
 */

/**
 * Environment types recognized by the application
 */
type Environment = 'development' | 'staging' | 'production';

/**
 * API configuration options
 */
interface ApiConfig {
  /** Base URL for API requests */
  baseUrl: string;
  /** Default timeout for API requests in milliseconds */
  timeout: number;
  /** Whether to include credentials in API requests */
  withCredentials: boolean;
  /** Mock API responses in development mode */
  useMocks: boolean;
}

/**
 * Cache configuration options
 */
interface CacheConfig {
  /** Default TTL for cached data in milliseconds */
  defaultTtl: number;
  /** Whether caching is enabled */
  enabled: boolean;
  /** Maximum age for cache entries in milliseconds */
  maxAge: number;
  /** Whether to use stale-while-revalidate caching strategy */
  staleWhileRevalidate: boolean;
}

/**
 * Feature flag configuration
 */
interface FeatureFlags {
  /** Whether team comparisons feature is enabled */
  enableTeamComparisons: boolean;
  /** Whether entity history tracking is enabled */
  enableHistoryTracking: boolean;
  /** Whether to show experimental features */
  showExperimentalFeatures: boolean;
  /** Whether to enable the new notifications panel */
  enableNotificationsPanel: boolean;
}

/**
 * Authentication configuration
 */
interface AuthConfig {
  /** Whether Azure AD authentication is enabled */
  enableAzureAuth: boolean;
  /** Microsoft authentication endpoint */
  msalEndpoint: string;
  /** Client ID for Microsoft authentication */
  clientId: string;
  /** Authority URL for Microsoft authentication */
  authority: string;
  /** Redirect URI for authentication callbacks */
  redirectUri: string;
  /** Login type to use by default */
  defaultLoginType: 'azure' | 'local';
}

/**
 * Complete application configuration
 */
interface AppConfig {
  /** Current environment */
  env: Environment;
  /** Whether the application is running in development mode */
  isDevelopment: boolean;
  /** API configuration */
  api: ApiConfig;
  /** Cache configuration */
  cache: CacheConfig;
  /** Feature flags */
  features: FeatureFlags;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Application version */
  version: string;
  /** Whether debug mode is enabled */
  debug: boolean;
}

/**
 * Determines the current environment
 * 
 * @returns The current environment based on VITE_APP_ENV or NODE_ENV
 */
const getEnvironment = (): Environment => {
  const envVar = import.meta.env.VITE_APP_ENV || import.meta.env.MODE;
  
  switch (envVar) {
    case 'production':
      return 'production';
    case 'staging':
      return 'staging';
    default:
      return 'development';
  }
};

/**
 * Current environment
 */
const env = getEnvironment();

/**
 * Application configuration
 */
const config: AppConfig = {
  env,
  isDevelopment: env === 'development',
  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || '',
    timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || '30000', 10),
    withCredentials: true,
    useMocks: env === 'development' && import.meta.env.VITE_USE_MOCK_API === 'true',
  },
  cache: {
    defaultTtl: 6 * 60 * 60 * 1000, // 6 hours in milliseconds
    enabled: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    staleWhileRevalidate: true,
  },
  features: {
    enableTeamComparisons: import.meta.env.VITE_ENABLE_TEAM_COMPARISONS !== 'false',
    enableHistoryTracking: import.meta.env.VITE_ENABLE_HISTORY_TRACKING !== 'false',
    showExperimentalFeatures: import.meta.env.VITE_SHOW_EXPERIMENTAL === 'true',
    enableNotificationsPanel: import.meta.env.VITE_ENABLE_NOTIFICATIONS === 'true',
  },
  auth: {
    enableAzureAuth: import.meta.env.VITE_ENABLE_AZURE_AUTH === 'true',
    msalEndpoint: import.meta.env.VITE_MSAL_ENDPOINT || '',
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID || '',
    authority: import.meta.env.VITE_MSAL_AUTHORITY || '',
    redirectUri: import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin,
    defaultLoginType: (import.meta.env.VITE_DEFAULT_LOGIN_TYPE || 'local') as 'azure' | 'local',
  },
  version: import.meta.env.VITE_APP_VERSION || 'development',
  debug: import.meta.env.VITE_DEBUG === 'true',
};

/**
 * Override specific configuration values (useful for testing)
 * 
 * @param overrides - Configuration values to override
 * @returns Updated configuration
 */
export const overrideConfig = (overrides: Partial<AppConfig>): AppConfig => {
  return {
    ...config,
    ...overrides,
  };
};

// Export default configuration
export default config;