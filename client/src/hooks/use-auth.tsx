import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
  QueryClient
} from "@tanstack/react-query";
import { PublicClientApplication, Configuration, AuthenticationResult, AccountInfo } from '@azure/msal-browser';
import { User } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { buildUrl, endpoints } from "@/config/index";
import { fastApiClient } from "../lib/fastApiClient";
import { authFallback } from "../lib/authFallback";

// Types for FastAPI authentication
interface FastAPIUser {
  user_id: number;
  email: string;
  name: string;
  roles: string[];
  type: string;
}

interface FastAPISession {
  session_id: string;
  session_type: string;
  created_at: string;
  expires_at: string;
  last_activity: string;
  storage_type: string;
}

interface FastAPIAuthResponse {
  user: FastAPIUser;
  session: FastAPISession;
}

// Check if Azure AD is configured
const isAzureConfigured = !!(import.meta.env.VITE_AZURE_CLIENT_ID && import.meta.env.VITE_AZURE_AUTHORITY);

// MSAL configuration (only if Azure is configured)
const msalConfig: Configuration | null = isAzureConfigured ? {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: import.meta.env.VITE_AZURE_AUTHORITY,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
} : null;

// Initialize MSAL instance (only if Azure is configured)
let msalInstance: PublicClientApplication | null = null;
if (isAzureConfigured && msalConfig) {
  try {
    msalInstance = new PublicClientApplication(msalConfig);
  } catch (err) {
    console.error("Error initializing MSAL:", err);
  }
}

// Azure AD login request scopes
const loginRequest = {
  scopes: ['User.Read', 'profile', 'openid', 'email'],
};

type AuthUser = FastAPIUser | User | AccountInfo | null | undefined;

// Types for local auth (legacy)
type LoginData = {
  username: string;
  password: string;
};

type RegisterData = {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
  team?: string;
};

type AuthContextType = {
  user: AuthUser;
  isLoading: boolean;
  error: Error | string | null;
  authMethod: 'azure' | 'local' | 'fastapi' | null;
  sessionId: string | null;
  
  // Additional user information needed by AdminRoute
  fastApiUser: FastAPIUser | null;
  azureUser: AccountInfo | null;
  
  // Traditional login methods (legacy)
  loginMutation: UseMutationResult<User, Error, LoginData>;
  registerMutation: UseMutationResult<User, Error, RegisterData>;
  
  // Azure AD methods
  loginWithAzure: () => Promise<void>;
  
  // Common methods
  logout: () => Promise<void>;
  isAuthenticated: boolean;
};

// Create auth context
export const AuthContext = createContext<AuthContextType | null>(null);

// Auth Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [authMethod, setAuthMethod] = useState<'azure' | 'local' | 'fastapi' | null>(null);
  const [azureUser, setAzureUser] = useState<AccountInfo | null>(null);
  const [fastApiUser, setFastApiUser] = useState<FastAPIUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAzureLoading, setIsAzureLoading] = useState<boolean>(false);
  const [azureError, setAzureError] = useState<string | null>(null);

  // Check for session expiry and auto re-authenticate  
  const checkSessionExpiry = async (): Promise<boolean> => {
    const sessionExpiry = localStorage.getItem('fastapi_session_expiry');
    if (!sessionExpiry) return false;
    
    const expiryTime = new Date(sessionExpiry);
    const now = new Date();
    
    // If session expires within 5 minutes, try to refresh it
    const timeUntilExpiry = expiryTime.getTime() - now.getTime();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (timeUntilExpiry < fiveMinutes) {
      console.log('Session expiring soon, attempting to refresh...');
      try {
        // Try to re-authenticate with Azure
        await loginWithAzure();
        return true;
      } catch (error) {
        console.error('Failed to refresh session:', error);
        // Clear expired session
        localStorage.removeItem('fastapi_session_id');
        localStorage.removeItem('fastapi_session_expiry');
        localStorage.removeItem('fastapi_user');
        setSessionId(null);
        setFastApiUser(null);
        setAuthMethod(null);
        return false;
      }
    }
    
    return true;
  };

  // Load session from localStorage on mount with expiry check
  useEffect(() => {
    const savedSessionId = localStorage.getItem('fastapi_session_id');
    const savedUser = localStorage.getItem('fastapi_user');
    const sessionExpiry = localStorage.getItem('fastapi_session_expiry');
    
    if (savedSessionId && savedUser && sessionExpiry) {
      try {
        const user = JSON.parse(savedUser) as FastAPIUser;
        const expiryTime = new Date(sessionExpiry);
        const now = new Date();
        
        // Check if session is still valid
        if (expiryTime > now) {
          setSessionId(savedSessionId);
          setFastApiUser(user);
          setAuthMethod('fastapi');
          
          // Initialize FastAPI client with saved session
          fastApiClient.setSessionId(savedSessionId);
          
          // Set up automatic session refresh check
          const timeUntilExpiry = expiryTime.getTime() - now.getTime();
          setTimeout(checkSessionExpiry, Math.max(0, timeUntilExpiry - 5 * 60 * 1000));
        } else {
          // Session expired, clear storage
          localStorage.removeItem('fastapi_session_id');
          localStorage.removeItem('fastapi_session_expiry');
          localStorage.removeItem('fastapi_user');
        }
      } catch (error) {
        console.error('Error loading saved session:', error);
        localStorage.removeItem('fastapi_session_id');
        localStorage.removeItem('fastapi_session_expiry');
        localStorage.removeItem('fastapi_user');
      }
    }
  }, []);

  // Authentication with environment-aware fallback (FastAPI -> Express in dev only)
  const {
    data: localUser,
    error: localError,
    isLoading: isLocalLoading,
  } = useQuery<User | null, Error>({
    queryKey: ['auth-user-fallback'],
    queryFn: async () => {
      try {
        return await authFallback.getCurrentUser();
      } catch (error) {
        // Re-throw environment restriction errors to inform user
        if (error instanceof Error && error.message.includes('Express fallback is disabled in production')) {
          console.error('Authentication system error:', error.message);
          throw error; // This will be handled by React Query's error handling
        }
        console.warn('Auth fallback failed:', error);
        return null;
      }
    },
  });

  // Check if user is authenticated with Azure AD on mount
  useEffect(() => {
    const initializeAzureAuth = async () => {
      try {
        // Check if there are any accounts in the cache
        if (msalInstance) {
          const accounts = msalInstance?.getAllAccounts() || [];
          
          if (accounts.length > 0 && msalInstance) {
            msalInstance.setActiveAccount(accounts[0]);
            setAzureUser(accounts[0]);
            setAuthMethod('azure');
          }
        }
      } catch (err) {
        console.error('Azure AD authentication initialization error:', err);
      }
    };

    initializeAzureAuth();
  }, []);

  // Traditional login mutation with fallback
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      return await authFallback.login(credentials);
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(['auth-user-fallback'], user);
      setAuthMethod('local');
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.username}!`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Registration mutation with fallback
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      return await authFallback.register(data);
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(['auth-user-fallback'], user);
      setAuthMethod('local');
      toast({
        title: "Registration successful",
        description: `Welcome, ${user.username}!`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // FastAPI authentication with Azure token
  const authenticateWithFastAPI = async (azureToken: string, userDetails?: any): Promise<void> => {
    try {
      // Get FastAPI config from centralized config
      const config = await import('../config');
      const fastApiConfig = config.endpoints.fastapi || {
        baseUrl: "http://localhost:8080",
        auth: {
          login: config.endpoints.auth.login,
          logout: config.endpoints.auth.logout
        }
      };

      // Use Bearer token as expected by FastAPI with user details
      const response = await fetch(`${fastApiConfig.baseUrl}${fastApiConfig.auth.login}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${azureToken}`,
          'Accept': 'application/json'
        },
        body: userDetails ? JSON.stringify(userDetails) : undefined
      });

      if (!response.ok) {
        throw new Error(`FastAPI authentication failed: ${response.status}`);
      }

      // Extract session ID from response header
      const sessionId = response.headers.get('X-Session-ID');
      if (!sessionId) {
        throw new Error('No session ID received from FastAPI');
      }

      const authResponse: FastAPIAuthResponse = await response.json();
      
      // Store session and user info with 6-hour expiry timestamp
      const sessionExpiry = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours from now
      setSessionId(sessionId);
      setFastApiUser(authResponse.user);
      setAuthMethod('fastapi');
      
      // Initialize FastAPI client with session
      fastApiClient.setSessionId(sessionId);
      
      // Persist to localStorage with expiry
      localStorage.setItem('fastapi_session_id', sessionId);
      localStorage.setItem('fastapi_session_expiry', sessionExpiry.toISOString());
      localStorage.setItem('fastapi_user', JSON.stringify(authResponse.user));
      
      toast({
        title: "Authentication successful",
        description: `Welcome, ${authResponse.user.name}!`,
        variant: "default",
      });
    } catch (error) {
      console.error('FastAPI authentication error:', error);
      throw error;
    }
  };

  // Azure AD login function with admin role validation
  const loginWithAzure = async (): Promise<void> => {
    try {
      setIsAzureLoading(true);
      setAzureError(null);
      
      // For testing purposes, simulate Azure SSO with admin validation
      // In production, this would use actual Azure MSAL tokens and claims
      const mockAzureClaims = {
        email: "azure_test_user@example.com",
        name: "Azure Test User", 
        role: "admin", // Admin role required for access
        oid: "test-azure-object-id"
      };
      
      // Call Azure validation endpoint with centralized config
      const azureValidateUrl = endpoints.auth?.azureValidate || '/api/auth/azure/validate';
      const res = await apiRequest("POST", buildUrl(azureValidateUrl), {
        token: "mock-azure-token", // In production, this would be real Azure JWT
        claims: mockAzureClaims
      });
      
      const response = await res.json();
      
      if (!response.success) {
        // Admin role validation failed
        setAzureError(response.message);
        toast({
          title: "Access Denied",
          description: response.message,
          variant: "destructive",
        });
        return;
      }
      
      // Azure admin validation successful - now authenticate with FastAPI
      queryClient.setQueryData([buildUrl(endpoints.auth.user)], response.user);
      
      try {
        // Extract user details for FastAPI
        const userDetails = {
          email: response.user.email,
          name: response.user.displayName,
          roles: response.user.roles || ['admin'], // Default to admin for mock Azure
          oid: response.user.id
        };
        
        // Authenticate with FastAPI using mock Azure token  
        await authenticateWithFastAPI("mock-azure-token", userDetails);
        
        toast({
          title: "Authentication successful",
          description: `Welcome, ${response.user.displayName}! You have admin access.`,
          variant: "default",
        });
      } catch (fastApiError) {
        console.error('FastAPI authentication failed:', fastApiError);
        // Fall back to Azure-only auth if FastAPI fails
        setAuthMethod('azure');
        setAzureUser(response.user);
        
        toast({
          title: "Authentication successful",
          description: `Welcome, ${response.user.displayName}! (Local mode)`,
          variant: "default",
        });
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setAzureError(`Azure authentication failed: ${errorMessage}`);
      toast({
        title: "Authentication failed", 
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAzureLoading(false);
    }
      return;
  };

  // Logout function with fallback support
  const logout = async (): Promise<void> => {
    try {
      // First, show a toast to indicate logout is in progress
      toast({
        title: "Logging out...",
        description: "Please wait while we log you out.",
        variant: "default",
      });
      
      // Clear React Query cache to prevent stale data
      queryClient.clear();
      queryClient.setQueryData(['auth-user-fallback'], null);
      queryClient.removeQueries();
      
      // Use fallback logout for all auth methods
      try {
        await authFallback.logout();
      } catch (err) {
        console.warn('Logout request failed, but clearing local session:', err);
      }
      
      // Clear all auth state regardless of auth method
      setAzureUser(null);
      setFastApiUser(null);
      setSessionId(null);
      setAuthMethod(null);
      
      // Clear FastAPI client session
      fastApiClient.setSessionId(null);
      
      // Redirect to auth page
      window.location.href = '/auth';
      
    } catch (error) {
      // Catch-all for unexpected errors
      console.error('Unexpected logout error:', error);
      // Always redirect to auth page in case of any errors
      window.location.href = '/auth';
    }
  };

  // Determine the current user based on auth method
  const user = authMethod === 'fastapi' ? fastApiUser : (authMethod === 'azure' ? azureUser : localUser);
  
  // Determine authentication status
  const isAuthenticated = !!user;
  
  // Determine loading status
  const isLoading = isLocalLoading || isAzureLoading;
  
  // Determine error status
  const error = localError || azureError;

  // Context value
  const contextValue: AuthContextType = {
    user,
    isLoading,
    error,
    authMethod,
    sessionId,
    fastApiUser,
    azureUser,
    loginMutation,
    registerMutation,
    loginWithAzure,
    logout,
    isAuthenticated,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}