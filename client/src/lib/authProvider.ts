import { PublicClientApplication, Configuration, AuthenticationResult, AccountInfo } from '@azure/msal-browser';
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

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

// MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Authentication request scopes
const loginRequest = {
  scopes: ['User.Read', 'profile', 'openid', 'email'],
};

// Types for auth context
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | null>;
  error: string | null;
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<AccountInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state on component mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if there are any accounts in the cache
        const accounts = msalInstance.getAllAccounts();
        
        if (accounts.length > 0) {
          msalInstance.setActiveAccount(accounts[0]);
          setUser(accounts[0]);
          setIsAuthenticated(true);
        }
      } catch (err) {
        setError(`Authentication initialization error: ${err}`);
        console.error('Authentication initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Redirect to Microsoft login page
      const response: AuthenticationResult = await msalInstance.loginPopup(loginRequest);
      
      if (response) {
        msalInstance.setActiveAccount(response.account);
        setUser(response.account);
        setIsAuthenticated(true);
      }
    } catch (err) {
      setError(`Login failed: ${err}`);
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = (): void => {
    try {
      const logoutRequest = {
        account: msalInstance.getActiveAccount(),
      };
      
      msalInstance.logout(logoutRequest);
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      setError(`Logout failed: ${err}`);
      console.error('Logout error:', err);
    }
  };

  // Get access token for API calls
  const getToken = async (): Promise<string | null> => {
    try {
      const account = msalInstance.getActiveAccount();
      
      if (!account) {
        return null;
      }
      
      const response = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      
      return response.accessToken;
    } catch (err) {
      console.error('Error acquiring token:', err);
      return null;
    }
  };

  // Context value
  const contextValue: AuthContextType = {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    getToken,
    error,
  };

  return React.createElement(AuthContext.Provider, { value: contextValue }, children);
}

// Custom hook to use the auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
