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

// MSAL configuration
const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || 'default-client-id',
    authority: import.meta.env.VITE_AZURE_AUTHORITY || 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

// Initialize MSAL instance (wrapped in a function to prevent immediate execution)
let msalInstance: PublicClientApplication | null = null;

function initializeMsal() {
  try {
    // Only initialize if Azure client ID is properly set
    if (import.meta.env.VITE_AZURE_CLIENT_ID && 
        import.meta.env.VITE_AZURE_CLIENT_ID !== 'default-client-id') {
      msalInstance = new PublicClientApplication(msalConfig);
      return msalInstance;
    } else {
      console.log("Azure AD not configured with proper client ID, skipping initialization");
      return null;
    }
  } catch (err) {
    console.error("Error initializing MSAL:", err);
    return null;
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
        // Initialize MSAL if not already initialized
        if (!msalInstance) {
          msalInstance = initializeMsal();
        }
        
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
        // Don't block authentication flow on Azure error
      }
    };

    initializeAzureAuth();
  }, []);

  // Traditional login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
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
    // Try to initialize MSAL if not already initialized
    if (!msalInstance) {
      msalInstance = initializeMsal();
      
      if (!msalInstance) {
        // Fall back to local login if Azure not available
        setAzureError("Azure AD authentication is not available");
        toast({
          title: "Azure AD unavailable",
          description: "Please use username/password login instead",
          variant: "destructive",
        });
        return;
      }
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
        description: "Please try using username/password login instead",
        variant: "destructive",
      });
    } finally {
      setIsAzureLoading(false);
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    if (authMethod === 'azure' && msalInstance) {
      try {
        const logoutRequest = {
          account: msalInstance.getActiveAccount(),
        };
        
        msalInstance.logout(logoutRequest);
        setAzureUser(null);
        setAuthMethod(null);
      } catch (err) {
        console.error('Azure logout error:', err);
      }
    } else if (authMethod === 'local') {
      try {
        await apiRequest("POST", "/api/logout");
        queryClient.setQueryData(["/api/user"], null);
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        setAuthMethod(null);
      } catch (err) {
        console.error('Local logout error:', err);
      }
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