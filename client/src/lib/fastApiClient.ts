import { endpoints } from "@/config/index";

/**
 * FastAPI client for making authenticated requests with session headers
 */
export class FastAPIClient {
  private sessionId: string | null = null;
  private baseUrl: string;

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
   * Make authenticated API request to FastAPI backend
   */
  async request(
    endpoint: string,
    options: RequestInit = {}
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

    // Handle session expiration
    if (response.status === 401 && this.sessionId) {
      // Session expired, clear local storage and redirect to login
      localStorage.removeItem('fastapi_session_id');
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