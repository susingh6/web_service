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

type AuthUser = User | AccountInfo | null | undefined;

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
  authMethod: 'azure' | 'local' | null;
  
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
  const [authMethod, setAuthMethod] = useState<'azure' | 'local' | null>(null);
  const [azureUser, setAzureUser] = useState<AccountInfo | null>(null);
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
      const res = await apiRequest("POST", "/api/register", data);
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

  // Azure AD login function
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
      
      // Redirect to Microsoft login page
      const response: AuthenticationResult = await msalInstance.loginPopup(loginRequest);
      
      if (response) {
        msalInstance.setActiveAccount(response.account);
        setAzureUser(response.account);
        setAuthMethod('azure');
        toast({
          title: "Login successful",
          description: `Welcome, ${response.account.name || response.account.username}!`,
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

  // Logout function with improved browser state/cache handling
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
      
      if (authMethod === 'azure' && msalInstance) {
        try {
          // Clear React state before MSAL logout
          setAzureUser(null);
          setAuthMethod(null);
          
          // Set up MSAL logout request
          const logoutRequest = {
            account: msalInstance.getActiveAccount(),
            postLogoutRedirectUri: window.location.origin + '/auth',
          };

          // Perform a simple redirect rather than using MSAL's logout
          // which can sometimes cause issues
          await apiRequest("POST", "/api/logout");
          window.location.href = '/auth';
          
          // The below code is commented out because it can cause issues
          // msalInstance.logout(logoutRequest);
        } catch (err) {
          console.error('Azure logout error:', err);
          // Even on error, force redirect to login page
          window.location.href = '/auth';
        }
      } else {
        try {
          // Send logout request to server
          await apiRequest("POST", "/api/logout");
          
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
  const user = authMethod === 'azure' ? azureUser : localUser;
  
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