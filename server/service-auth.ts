import { config } from './config';

// Service session state management
interface ServiceSession {
  sessionId: string;
  loginTime: Date;
  lastRefresh: Date;
  expiresAt: Date;
  isValid: boolean;
}

class ServiceAuthManager {
  private session: ServiceSession | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;

  /**
   * Login service account using Basic Auth with client-id:client-secret
   * Returns service session-id or throws error
   */
  async loginServiceAccount(): Promise<string> {
    const { clientId, clientSecret, fastApiBaseUrl } = config.serviceAccount;
    
    if (!clientId || !clientSecret) {
      throw new Error('Service account credentials not configured. Set SERVICE_CLIENT_ID and SERVICE_CLIENT_SECRET environment variables.');
    }

    try {
      // Create Basic Auth header with client-id:client-secret
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      console.log('🔐 Authenticating service account with FastAPI...');
      
      const response = await fetch(`${fastApiBaseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SLA-Monitor-Service/1.0'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Service authentication failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const sessionData = await response.json();
      
      if (!sessionData.session?.session_id) {
        throw new Error('Invalid session response: missing session_id');
      }
      
      // Store service session with expiry tracking
      const now = new Date();
      const expiresAt = new Date(now.getTime() + config.serviceAccount.sessionExpiryMs);
      
      this.session = {
        sessionId: sessionData.session.session_id,
        loginTime: now,
        lastRefresh: now,
        expiresAt: expiresAt,
        isValid: true
      };
      
      // Schedule session refresh before expiry
      this.scheduleSessionRefresh();
      
      console.log(`✅ Service account authenticated successfully. Session expires at: ${expiresAt.toISOString()}`);
      
      return this.session.sessionId;
      
    } catch (error: any) {
      console.error('❌ Service account authentication failed:', error.message);
      this.session = null;
      throw error;
    }
  }

  /**
   * Logout service account and clean up session
   */
  async logoutServiceAccount(): Promise<void> {
    if (!this.session?.sessionId) {
      console.log('🚪 No active service session to logout');
      return;
    }

    const { fastApiBaseUrl } = config.serviceAccount;
    
    try {
      console.log('🚪 Logging out service account...');
      
      const response = await fetch(`${fastApiBaseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'X-Session-ID': this.session.sessionId,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn(`Service logout warning: ${response.status} ${response.statusText}`);
      } else {
        console.log('✅ Service account logged out successfully');
      }
      
    } catch (error: any) {
      console.warn('Service logout error (non-fatal):', error.message);
    } finally {
      // Clean up local session state regardless of API call result
      this.clearSession();
    }
  }

  /**
   * Get current valid service session-id
   * Auto-refreshes if session is near expiry
   */
  async getServiceSessionId(): Promise<string | null> {
    if (!this.session) {
      return null;
    }

    // Check if session is expired
    if (new Date() >= this.session.expiresAt) {
      console.warn('⚠️ Service session expired, attempting refresh...');
      await this.refreshServiceSession();
      return this.session?.sessionId || null;
    }

    // Check if session needs proactive refresh (5.5 hours)
    const warningTime = new Date(this.session.loginTime.getTime() + config.serviceAccount.sessionExpiryWarningMs);
    if (new Date() >= warningTime && !this.isRefreshing) {
      console.log('🔄 Service session near expiry, proactively refreshing...');
      this.refreshServiceSession().catch((error: any) => {
        console.error('Proactive session refresh failed:', error.message);
      });
    }

    return this.session.sessionId;
  }

  /**
   * Refresh service session when it expires or is near expiry
   */
  async refreshServiceSession(): Promise<void> {
    if (this.isRefreshing) {
      console.log('🔄 Session refresh already in progress, waiting...');
      // Wait for ongoing refresh to complete
      let attempts = 0;
      while (this.isRefreshing && attempts < 30) { // Max 30 seconds
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      return;
    }

    this.isRefreshing = true;
    
    try {
      console.log('🔄 Refreshing service session...');
      
      // Clear current session
      this.clearSession();
      
      // Re-authenticate 
      await this.loginServiceAccount();
      
      console.log('✅ Service session refreshed successfully');
      
    } catch (error: any) {
      console.error('❌ Service session refresh failed:', error.message);
      this.session = null;
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Handle 401/403 errors during FastAPI calls - auto re-authenticate
   */
  async handleAuthError(error: any): Promise<string | null> {
    if (error.status === 401 || error.status === 403) {
      console.warn('🔑 Received auth error, attempting session refresh...');
      
      try {
        await this.refreshServiceSession();
        return this.session?.sessionId || null;
      } catch (refreshError: any) {
        console.error('Failed to recover from auth error:', refreshError.message);
        return null;
      }
    }
    
    // Not an auth error, re-throw
    throw error;
  }

  /**
   * Check if service account is properly configured
   */
  isConfigured(): boolean {
    return config.serviceAccount.isConfigured();
  }

  /**
   * Get session status for monitoring/debugging
   */
  getSessionStatus(): { isActive: boolean; expiresAt?: string; timeRemaining?: number } {
    if (!this.session) {
      return { isActive: false };
    }

    const now = new Date();
    const timeRemaining = this.session.expiresAt.getTime() - now.getTime();

    return {
      isActive: this.session.isValid && timeRemaining > 0,
      expiresAt: this.session.expiresAt.toISOString(),
      timeRemaining: Math.max(0, timeRemaining)
    };
  }

  /**
   * Schedule automatic session refresh before expiry
   */
  private scheduleSessionRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.session) return;

    // Schedule refresh 30 minutes before expiry
    const refreshTime = this.session.expiresAt.getTime() - (30 * 60 * 1000);
    const delay = refreshTime - Date.now();

    if (delay > 0) {
      this.refreshTimer = setTimeout(async () => {
        try {
          console.log('⏰ Scheduled session refresh triggered');
          await this.refreshServiceSession();
        } catch (error) {
          console.error('Scheduled session refresh failed:', error.message);
        }
      }, delay);

      console.log(`⏲️ Scheduled session refresh in ${Math.round(delay / 1000 / 60)} minutes`);
    }
  }

  /**
   * Clear session state and cleanup timers
   */
  private clearSession(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    this.session = null;
  }

  /**
   * Cleanup resources on shutdown
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up service authentication...');
    
    if (this.session) {
      await this.logoutServiceAccount();
    }
    
    this.clearSession();
  }
}

// Export singleton instance for global use
export const serviceAuth = new ServiceAuthManager();

// Enhanced FastAPI call wrapper with automatic service authentication
export async function serviceAuthenticatedFetch(
  url: string, 
  options: RequestInit = {},
  retryOnAuthError: boolean = true
): Promise<Response> {
  const sessionId = await serviceAuth.getServiceSessionId();
  
  if (!sessionId) {
    throw new Error('No valid service session available');
  }

  // Add service session header
  const headers = {
    'X-Session-ID': sessionId,
    'Content-Type': 'application/json',
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Handle auth errors with automatic retry
    if ((response.status === 401 || response.status === 403) && retryOnAuthError) {
      console.warn(`🔑 Auth error (${response.status}) for ${url}, refreshing session and retrying...`);
      
      const newSessionId = await serviceAuth.handleAuthError({ status: response.status });
      
      if (newSessionId) {
        // Retry with new session
        const newHeaders = {
          ...headers,
          'X-Session-ID': newSessionId
        };
        
        return await fetch(url, {
          ...options,
          headers: newHeaders
        });
      }
    }

    return response;
    
  } catch (error) {
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(`Service API unavailable: ${url}`);
    }
    throw error;
  }
}

// Service account initialization for server startup
export async function initializeServiceAuth(): Promise<void> {
  if (!serviceAuth.isConfigured()) {
    console.warn('⚠️ Service account not configured - cache building will use fallback data');
    return;
  }

  try {
    console.log('🚀 Initializing service account authentication...');
    await serviceAuth.loginServiceAccount();
    console.log('✅ Service account authentication initialized successfully');
  } catch (error: any) {
    console.error('❌ Failed to initialize service account authentication:', error.message);
    throw error;
  }
}

// Graceful shutdown helper
export async function shutdownServiceAuth(): Promise<void> {
  await serviceAuth.cleanup();
}