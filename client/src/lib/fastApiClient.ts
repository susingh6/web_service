import { endpoints } from "@/config/index";

/**
 * FastAPI client for making authenticated requests with session headers
 */
export class FastAPIClient {
  private sessionId: string | null = null;
  private baseUrl: string;
  private refreshHandler: (() => Promise<boolean>) | null = null;
  private isRefreshing: boolean = false;

  constructor() {
    const fastApiConfig = endpoints.fastapi || {
      baseUrl: "http://localhost:8080",
      auth: {
        login: "/api/v1/auth/login",
        logout: "/api/v1/auth/logout"
      }
    };
    this.baseUrl = fastApiConfig.baseUrl;
  }

  /**
   * Set the session ID for authenticated requests
   */
  setSessionId(sessionId: string | null) {
    this.sessionId = sessionId;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set the refresh handler for automatic session renewal
   */
  setRefreshHandler(handler: () => Promise<boolean>) {
    this.refreshHandler = handler;
  }

  /**
   * Make authenticated API request to FastAPI backend with automatic retry on 401
   */
  async request(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});

    // Add session header if available
    if (this.sessionId) {
      headers.set('X-Session-ID', this.sessionId);
    }

    // Add content type for JSON requests
    if (!headers.has('Content-Type') && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle session expiration with automatic refresh and retry
    if (response.status === 401 && this.sessionId && !isRetry) {
      console.log('[FastAPI Client] Received 401, attempting session refresh...');
      
      // Try to refresh the session if handler is available
      if (this.refreshHandler && !this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const refreshSuccess = await this.refreshHandler();
          this.isRefreshing = false;
          
          if (refreshSuccess) {
            console.log('[FastAPI Client] Session refreshed, retrying request...');
            // Retry the request with new session
            return this.request(endpoint, options, true);
          }
        } catch (error) {
          this.isRefreshing = false;
          console.error('[FastAPI Client] Refresh failed:', error);
        }
      }
      
      // If refresh failed or not available, clear session and redirect
      console.log('[FastAPI Client] Session refresh failed, redirecting to login...');
      localStorage.removeItem('fastapi_session_id');
      localStorage.removeItem('fastapi_session_expiry');
      localStorage.removeItem('fastapi_user');
      this.sessionId = null;
      window.location.href = '/auth';
      throw new Error('Session expired');
    }

    return response;
  }

  /**
   * GET request helper
   */
  async get(endpoint: string, options: RequestInit = {}): Promise<Response> {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request helper
   */
  async post(endpoint: string, data?: any, options: RequestInit = {}): Promise<Response> {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request helper
   */
  async put(endpoint: string, data?: any, options: RequestInit = {}): Promise<Response> {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request helper
   */
  async delete(endpoint: string, options: RequestInit = {}): Promise<Response> {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const fastApiClient = new FastAPIClient();

/**
 * Initialize FastAPI client with session from localStorage
 */
export const initializeFastAPIClient = () => {
  const sessionId = localStorage.getItem('fastapi_session_id');
  if (sessionId) {
    fastApiClient.setSessionId(sessionId);
  }
};

/**
 * Hook to get FastAPI client with current session
 */
export const useFastAPIClient = () => {
  return fastApiClient;
};