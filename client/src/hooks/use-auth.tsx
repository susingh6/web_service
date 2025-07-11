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
        // Check if there are any Azure AD accounts in the cache (only if Azure is configured)
        if (isAzureConfigured && msalInstance) {
          const accounts = msalInstance.getAllAccounts();
          
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
            setAzureUser(accounts[0]);
            setAuthMethod('azure');
            return;
          }
        }
        
        // TODO: FastAPI session validation will be added here later
        // For now, local authentication is handled by the existing React Query
        
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

  // Azure AD login function - placeholder for future FastAPI integration
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
      
      if (azureResponse) {
        // For now, just set Azure user directly
        // TODO: Later integrate with FastAPI session exchange
        msalInstance.setActiveAccount(azureResponse.account);
        setAzureUser(azureResponse.account);
        setAuthMethod('azure');
        
        toast({
          title: "Login successful",
          description: `Welcome, ${azureResponse.account.name || azureResponse.account.username}!`,
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

  // Logout function 
  const logout = async (): Promise<void> => {
    try {
      // Clear React Query cache to prevent stale data
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
      queryClient.removeQueries();
      
      if (authMethod === 'azure' && msalInstance) {
        try {
          // Clear React state before MSAL logout
          setAzureUser(null);
          setAuthMethod(null);
          
          // Clear any session data
          localStorage.removeItem('session_id');
          localStorage.removeItem('session_expires');
          
          // Simple redirect for now
          await apiRequest("POST", buildUrl(endpoints.auth.logout));
          window.location.href = '/auth';
        } catch (err) {
          console.error('Azure logout error:', err);
          window.location.href = '/auth';
        }
      } else {
        try {
          // Send logout request to server (local auth)
          await apiRequest("POST", buildUrl(endpoints.auth.logout));
          
          // Update auth state
          setAuthMethod(null);
          
          // Clear any session data (placeholder for future FastAPI integration)
          localStorage.removeItem('session_id');
          localStorage.removeItem('session_expires');
          
          // Force page reload to clear any cached state
          window.location.href = '/auth';
        } catch (err) {
          console.error('Logout error:', err);
          window.location.href = '/auth';
        }
      }
    } catch (error) {
      console.error('Unexpected logout error:', error);
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