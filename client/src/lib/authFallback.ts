// Authentication fallback utility - development-only Express fallback
import { buildUrl, endpoints, isDevelopment } from "@/config/index";

interface AuthEndpoints {
  login: string;
  logout: string;
  register: string;
  user: string;
  azureValidate: string;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterData {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
  team?: string;
}

// Check if FastAPI is reachable
async function checkFastAPIAvailable(): Promise<boolean> {
  try {
    // Try FastAPI health endpoint with short timeout
    const response = await fetch('/api/v1/health', { 
      method: 'GET',
      signal: AbortSignal.timeout(1000) // 1 second timeout
    });
    return response.ok;
  } catch (error) {
    console.log('FastAPI not available, using Express fallback');
    return false;
  }
}

// Get the correct endpoints based on availability and environment
export async function getAuthEndpoints(): Promise<AuthEndpoints> {
  const isFastAPIAvailable = await checkFastAPIAvailable();
  
  if (isFastAPIAvailable) {
    console.log('Using FastAPI auth endpoints');
    return {
      login: buildUrl(endpoints.auth.login),
      logout: buildUrl(endpoints.auth.logout), 
      register: buildUrl(endpoints.auth.register),
      user: buildUrl(endpoints.auth.user),
      azureValidate: buildUrl(endpoints.auth.azureValidate),
    };
  } else {
    // Only allow Express fallback in development environment
    if (isDevelopment) {
      // Check if fallback endpoints are available in config
      if (!endpoints.auth.loginFallback || !endpoints.auth.logoutFallback || 
          !endpoints.auth.registerFallback || !endpoints.auth.userFallback || 
          !endpoints.auth.azureValidateFallback) {
        throw new Error('FastAPI unavailable and Express fallback endpoints not configured in development environment');
      }
      
      console.log('FastAPI unavailable in development, falling back to Express auth endpoints');
      return {
        login: buildUrl(endpoints.auth.loginFallback),
        logout: buildUrl(endpoints.auth.logoutFallback),
        register: buildUrl(endpoints.auth.registerFallback), 
        user: buildUrl(endpoints.auth.userFallback),
        azureValidate: buildUrl(endpoints.auth.azureValidateFallback),
      };
    } else {
      // In staging/production, do not allow fallback - throw error
      throw new Error('FastAPI authentication service is unavailable. Express fallback is disabled in production environments for security compliance.');
    }
  }
}

// Fallback authentication request function
export async function authRequest(
  method: 'GET' | 'POST', 
  endpoint: keyof AuthEndpoints,
  data?: LoginCredentials | RegisterData | any
): Promise<Response> {
  const authEndpoints = await getAuthEndpoints();
  const url = authEndpoints[endpoint];
  
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add session headers if available (for continuity)
  const sessionId = localStorage.getItem('fastapi_session_id');
  const userData = localStorage.getItem('fastapi_user');
  
  if (sessionId && userData) {
    try {
      const user = JSON.parse(userData);
      headers["X-Session-ID"] = sessionId;
      headers["X-User-ID"] = String(user.user_id || '');
      headers["X-User-Email"] = user.email || '';
      headers["X-Session-Type"] = user.type || 'client_credentials';
      headers["X-User-Roles"] = Array.isArray(user.roles) ? user.roles.join(',') : (user.roles || '');
      headers["X-User-Name"] = user.name || '';
    } catch (error) {
      console.warn('Failed to parse user data for headers:', error);
      headers["X-Session-ID"] = sessionId;
    }
  }
  
  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // Important for Express session cookies
  });

  // Don't throw on 401 for some endpoints
  if (response.status === 401 && endpoint === 'user') {
    return response; // Let the caller handle 401 for user endpoint
  }
  
  if (!response.ok) {
    const text = (await response.text()) || response.statusText;
    throw new Error(`${response.status}: ${text}`);
  }
  
  return response;
}

// Specific auth functions using fallback
export const authFallback = {
  // Check current user
  async getCurrentUser(): Promise<any> {
    try {
      const response = await authRequest('GET', 'user');
      if (response.status === 401) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('Failed to get current user:', error);
      // Re-throw errors related to environment restrictions
      if (error instanceof Error && error.message.includes('Express fallback is disabled in production')) {
        throw error;
      }
      return null;
    }
  },

  // Login
  async login(credentials: LoginCredentials): Promise<any> {
    const response = await authRequest('POST', 'login', credentials);
    return await response.json();
  },

  // Register
  async register(userData: RegisterData): Promise<any> {
    const response = await authRequest('POST', 'register', userData);
    return await response.json();
  },

  // Logout
  async logout(): Promise<void> {
    try {
      await authRequest('POST', 'logout');
    } catch (error) {
      console.warn('Logout failed, but clearing local session:', error);
    }
    
    // Always clear local session data
    localStorage.removeItem('fastapi_session_id');
    localStorage.removeItem('fastapi_session_expiry');
    localStorage.removeItem('fastapi_user');
  },

  // Azure validation
  async validateAzure(token: any, claims: any): Promise<any> {
    const response = await authRequest('POST', 'azureValidate', { token, claims });
    return await response.json();
  }
};