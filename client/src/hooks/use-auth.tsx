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

  // Load session from localStorage on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem('fastapi_session_id');
    const savedUser = localStorage.getItem('fastapi_user');
    
    if (savedSessionId && savedUser) {
      try {
        const user = JSON.parse(savedUser) as FastAPIUser;
        setSessionId(savedSessionId);
        setFastApiUser(user);
        setAuthMethod('fastapi');
        
        // Initialize FastAPI client with saved session
        fastApiClient.setSessionId(savedSessionId);
      } catch (error) {
        console.error('Error loading saved session:', error);
        localStorage.removeItem('fastapi_session_id');
        localStorage.removeItem('fastapi_user');
      }
    }
  }, []);

  // Local authentication with the server
  const {
    data: localUser,
    error: localError,
    isLoading: isLocalLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Check if user is authenticated with Azure AD on mount
  useEffect(() => {
    const initializeAzureAuth = async () => {
      try {
        // Check if there are any accounts in the cache
        if (msalInstance) {
          const accounts = msalInstance.getAllAccounts();
          
          if (accounts.length > 0) {
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

  // Traditional login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", buildUrl(endpoints.auth.login), credentials);
      return await res.json();
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/user"], user);
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

  // Registration mutation
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const res = await apiRequest("POST", buildUrl(endpoints.auth.register), data);
      return await res.json();
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/user"], user);
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
  const authenticateWithFastAPI = async (azureToken: string): Promise<void> => {
    try {
      const fastApiConfig = endpoints.fastapi || {
        baseUrl: "http://localhost:8080",
        auth: {
          login: "/api/v1/auth/login",
          logout: "/api/v1/auth/logout"
        }
      };

      // Create Basic Auth header from client credentials
      const clientId = import.meta.env.VITE_FASTAPI_CLIENT_ID || "9529c057-c34f-4176-a9cd-0b103be4b9f8";
      const clientSecret = import.meta.env.VITE_FASTAPI_CLIENT_SECRET || "8Uh1EnxZR@^ZbLi7wIPSJI%mpxPvz&&m";
      const basicAuth = btoa(`${clientId}:${clientSecret}`);

      const response = await fetch(`${fastApiConfig.baseUrl}${fastApiConfig.auth.login}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'X-Azure-Token': azureToken,
          'Content-Type': 'application/json'
        }
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
      
      // Store session and user info
      setSessionId(sessionId);
      setFastApiUser(authResponse.user);
      setAuthMethod('fastapi');
      
      // Initialize FastAPI client with session
      fastApiClient.setSessionId(sessionId);
      
      // Persist to localStorage
      localStorage.setItem('fastapi_session_id', sessionId);
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

  // Azure AD login function
  const loginWithAzure = async (): Promise<void> => {
    if (!isAzureConfigured || !msalInstance) {
      // Azure AD not configured, use test credentials for now
      try {
        setIsAzureLoading(true);
        setAzureError(null);
        
        // Use test credentials until Azure is configured
        const testCredentials = {
          username: "azure_test_user",
          password: "Azure123!"
        };
        
        const res = await apiRequest("POST", buildUrl(endpoints.auth.login), testCredentials);
        const user = await res.json();
        
        queryClient.setQueryData(["/api/user"], user);
        setAuthMethod('local');
        toast({
          title: "Authentication successful",
          description: `Welcome, ${user.username}!`,
          variant: "default",
        });
      } catch (err) {
        setAzureError(`Authentication failed: ${err}`);
        console.error('Authentication error:', err);
        toast({
          title: "Authentication failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        setIsAzureLoading(false);
      }
      return;
    }
    
    try {
      setIsAzureLoading(true);
      setAzureError(null);
      
      // Get Azure token via popup
      const response: AuthenticationResult = await msalInstance.loginPopup(loginRequest);
      
      if (response && response.accessToken) {
        msalInstance.setActiveAccount(response.account);
        setAzureUser(response.account);
        
        // Authenticate with FastAPI using Azure token
        await authenticateWithFastAPI(response.accessToken);
      }
    } catch (err) {
      setAzureError(`Login failed: ${err}`);
      console.error('Azure login error:', err);
      toast({
        title: "Azure AD login failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsAzureLoading(false);
    }
  };

  // Logout function with FastAPI session handling
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
      queryClient.setQueryData(["/api/user"], null);
      queryClient.removeQueries();
      
      if (authMethod === 'fastapi' && sessionId) {
        try {
          // Logout from FastAPI backend
          const fastApiConfig = endpoints.fastapi || {
            baseUrl: "http://localhost:8080",
            auth: {
              login: "/api/v1/auth/login",
              logout: "/api/v1/auth/logout"
            }
          };

          await fetch(`${fastApiConfig.baseUrl}${fastApiConfig.auth.logout}`, {
            method: 'POST',
            headers: {
              'X-Session-ID': sessionId,
              'Content-Type': 'application/json'
            }
          });

          // Clear local session data
          localStorage.removeItem('fastapi_session_id');
          localStorage.removeItem('fastapi_user');
          setSessionId(null);
          setFastApiUser(null);
          setAuthMethod(null);
          
          // Clear FastAPI client session
          fastApiClient.setSessionId(null);
          
          window.location.href = '/auth';
        } catch (err) {
          console.error('FastAPI logout error:', err);
          // Even on error, clear local data and redirect
          localStorage.removeItem('fastapi_session_id');
          localStorage.removeItem('fastapi_user');
          setSessionId(null);
          setFastApiUser(null);
          setAuthMethod(null);
          
          // Clear FastAPI client session
          fastApiClient.setSessionId(null);
          window.location.href = '/auth';
        }
      } else if (authMethod === 'azure' && msalInstance) {
        try {
          // Clear React state before MSAL logout
          setAzureUser(null);
          setAuthMethod(null);

          // Perform a simple redirect rather than using MSAL's logout
          // which can sometimes cause issues
          await apiRequest("POST", buildUrl(endpoints.auth.logout));
          window.location.href = '/auth';
        } catch (err) {
          console.error('Azure logout error:', err);
          // Even on error, force redirect to login page
          window.location.href = '/auth';
        }
      } else {
        try {
          // Send logout request to server
          await apiRequest("POST", buildUrl(endpoints.auth.logout));
          
          // Update auth state
          setAuthMethod(null);
          
          // Force page reload to clear any cached state in React components
          window.location.href = '/auth';
        } catch (err) {
          console.error('Logout error:', err);
          // Even on error, force redirect to login page
          window.location.href = '/auth';
        }
      }
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