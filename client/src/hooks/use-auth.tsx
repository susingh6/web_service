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

// Initialize MSAL instance
let msalInstance: PublicClientApplication;
try {
  msalInstance = new PublicClientApplication(msalConfig);
} catch (err) {
  console.error("Error initializing MSAL:", err);
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

  // Azure AD login function (simplified to use test credentials)
  const loginWithAzure = async (): Promise<void> => {
    try {
      setIsAzureLoading(true);
      setAzureError(null);
      
      // Instead of Azure authentication, use test credentials
      const testCredentials = {
        username: "azure_test_user",
        password: "Azure123!",
      };
      
      // Use the regular login mutation with test credentials
      loginMutation.mutate(testCredentials, {
        onSuccess: () => {
          toast({
            title: "Azure login simulation",
            description: "Using test credentials instead of actual Azure AD",
            variant: "default",
          });
        }
      });
    } catch (err) {
      setAzureError(`Login failed: ${err}`);
      console.error('Login error:', err);
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsAzureLoading(false);
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    // For both auth methods (simulated Azure or local), use the standard logout endpoint
    try {
      await apiRequest("POST", "/api/logout");
      queryClient.setQueryData(["/api/user"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setAuthMethod(null);
      setAzureUser(null);
      
      // Show a toast to indicate successful logout
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
        variant: "default",
      });
    } catch (err) {
      console.error('Logout error:', err);
      toast({
        title: "Logout error",
        description: "An error occurred during logout",
        variant: "destructive",
      });
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