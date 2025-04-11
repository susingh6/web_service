import { ReactNode, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect, Route } from 'wouter';
import { Box, CircularProgress } from '@mui/material';

interface ProtectedRouteProps {
  component: React.ComponentType;
  path: string;
}

export function ProtectedRoute({
  component: Component,
  path,
  ...rest
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading for up to 3 seconds max, then redirect to auth if still not resolved
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // If loading, set a timeout to redirect after 3 seconds
    if (isLoading) {
      const timer = setTimeout(() => {
        if (isLoading) {
          // Still loading after timeout, force redirect to auth
          setTimedOut(true);
        }
      }, 3000); // 3 seconds timeout
      
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (isLoading && !timedOut) {
    return (
      <Route path={path}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          <CircularProgress />
        </Box>
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
}