import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect, Route } from 'wouter';
import { Box, CircularProgress } from '@mui/material';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  component: React.ComponentType;
  path: string;
}

export function ProtectedRoute({
  component: Component,
  path,
  ...rest
}: ProtectedRouteProps) {
  try {
    const { isAuthenticated, isLoading } = useAuth();
    
    // Add console log for debugging
    console.log(`Protected route (${path}):`, { isAuthenticated, isLoading });

    if (isLoading) {
      return (
        <Route path={path}>
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </Route>
      );
    }

    return (
      <Route
        path={path}
        {...rest}
      >
        {isAuthenticated ? <Component /> : <Redirect to="/auth" />}
      </Route>
    );
  } catch (error) {
    console.error("Error in ProtectedRoute:", error);
    // If there's an authentication error, redirect to auth page
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }
}