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
import { buildUrl, endpoints, config } from "@/config/index";

// Check if Azure AD is configured using centralized config
const isAzureConfigured = !!(config.azure.clientId && config.azure.authority);

// MSAL configuration using centralized config
const msalConfig: Configuration | null = isAzureConfigured ? {
  auth: {
    clientId: config.azure.clientId,
    authority: config.azure.authority,
    redirectUri: config.azure.redirectUri,
    postLogoutRedirectUri: config.azure.postLogoutRedirectUri,
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

// Azure AD login request scopes using centralized config
const loginRequest = {
  scopes: config.azure.scopes,
};

// Session-based authentication types
type SessionInfo = {
  session_id: string;
  session_type: string;
  created_at: string;
  expires_at: string;
  last_activity: string;
  storage_type: string;
};

type FastAPIUser = {
  user_id: number;
  email: string;
  name: string;
  roles: string[];
  type: string;
};

type FastAPIAuthResponse = {
  user: FastAPIUser;
  session: SessionInfo;
};

type AuthUser = User | AccountInfo | FastAPIUser | null | undefined;

// Types for local auth
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
  
  // Traditional login methods
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

  // Local authentication with the server
  const {
    data: localUser,
    error: localError,
    isLoading: isLocalLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Check if user is authenticated on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check for existing session in localStorage
        const storedSessionId = localStorage.getItem('session_id');
        const storedExpires = localStorage.getItem('session_expires');
        
        if (storedSessionId && storedExpires) {
          const expiresAt = new Date(storedExpires);
          const now = new Date();
          
          if (now < expiresAt) {
            // Session is still valid, validate with FastAPI
            try {
              const validateResponse = await fetch(`${config.fastapi.baseUrl}${endpoints.auth.validate}`, {
                method: 'GET',
                headers: {
                  'X-Session-ID': storedSessionId,
                  'Content-Type': 'application/json',
                },
              });
              
              if (validateResponse.ok) {
                const userData: FastAPIUser = await validateResponse.json();
                setFastApiUser(userData);
                setSessionId(storedSessionId);
                setAuthMethod('fastapi');
                return;
              }
            } catch (err) {
              console.error('Session validation error:', err);
            }
          }
          
          // Session is expired or invalid, clean up
          localStorage.removeItem('session_id');
          localStorage.removeItem('session_expires');
        }
        
        // Check if there are any Azure AD accounts in the cache
        if (msalInstance) {
          const accounts = msalInstance.getAllAccounts();
          
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
            setAzureUser(accounts[0]);
            setAuthMethod('azure');
          }
        }
      } catch (err) {
        console.error('Authentication initialization error:', err);
      }
    };

    initializeAuth();
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

  // Azure AD login function with FastAPI session exchange
  const loginWithAzure = async (): Promise<void> => {
    if (!isAzureConfigured || !msalInstance) {
      setAzureError("Azure AD authentication is not configured");
      toast({
        title: "Login failed",
        description: "Azure AD authentication is not configured. Please use username/password login.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsAzureLoading(true);
      setAzureError(null);
      
      // Step 1: Get Azure AD token
      const azureResponse: AuthenticationResult = await msalInstance.loginPopup(loginRequest);
      
      if (azureResponse && azureResponse.accessToken) {
        // Step 2: Exchange Azure token for FastAPI session
        const basicAuth = btoa(`${config.fastapi.clientId}:${config.fastapi.clientSecret}`);
        
        const fastApiResponse = await fetch(`${config.fastapi.baseUrl}${endpoints.auth.login}`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
            'X-Azure-Token': azureResponse.accessToken,
          },
          body: JSON.stringify({
            azure_token: azureResponse.accessToken,
            user_info: {
              name: azureResponse.account.name,
              email: azureResponse.account.username,
              id: azureResponse.account.localAccountId,
            },
          }),
        });
        
        if (!fastApiResponse.ok) {
          throw new Error(`FastAPI authentication failed: ${fastApiResponse.status}`);
        }
        
        const fastApiData: FastAPIAuthResponse = await fastApiResponse.json();
        
        // Step 3: Store session information
        msalInstance.setActiveAccount(azureResponse.account);
        setAzureUser(azureResponse.account);
        setFastApiUser(fastApiData.user);
        setSessionId(fastApiData.session.session_id);
        setAuthMethod('fastapi');
        
        // Store session ID in localStorage for persistence
        localStorage.setItem('session_id', fastApiData.session.session_id);
        localStorage.setItem('session_expires', fastApiData.session.expires_at);
        
        toast({
          title: "Login successful",
          description: `Welcome, ${fastApiData.user.name}!`,
          variant: "default",
        });
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
          // Send logout request to FastAPI with session ID
          await fetch(`${config.fastapi.baseUrl}${endpoints.auth.logout}`, {
            method: 'POST',
            headers: {
              'X-Session-ID': sessionId,
              'Content-Type': 'application/json',
            },
          });
          
          // Clear local storage
          localStorage.removeItem('session_id');
          localStorage.removeItem('session_expires');
          
          // Clear React state
          setFastApiUser(null);
          setSessionId(null);
          setAzureUser(null);
          setAuthMethod(null);
          
          // Clear Azure state if it exists
          if (msalInstance) {
            msalInstance.setActiveAccount(null);
          }
          
          window.location.href = '/auth';
        } catch (err) {
          console.error('FastAPI logout error:', err);
          // Even on error, clean up and redirect
          localStorage.removeItem('session_id');
          localStorage.removeItem('session_expires');
          window.location.href = '/auth';
        }
      } else if (authMethod === 'azure' && msalInstance) {
        try {
          // Clear React state before MSAL logout
          setAzureUser(null);
          setAuthMethod(null);
          
          // Clear any FastAPI session data
          localStorage.removeItem('session_id');
          localStorage.removeItem('session_expires');
          
          // Perform a simple redirect rather than using MSAL's logout
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