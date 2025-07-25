import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect, Route } from 'wouter';
import { Box, CircularProgress, Alert, AlertTitle } from '@mui/material';

interface AdminRouteProps {
  component: React.ComponentType;
  path: string;
}

export function AdminRoute({
  component: Component,
  path,
  ...rest
}: AdminRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
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

  // Check if user is authenticated
  if (!isAuthenticated) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Check if user has admin role
  const userRole = (user as any)?.role;
  if (userRole !== 'admin') {
    return (
      <Route path={path}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            padding: 3,
          }}
        >
          <Alert severity="error" sx={{ maxWidth: 500 }}>
            <AlertTitle>Access Denied</AlertTitle>
            Only administrators can access this application. Please contact your system administrator to request admin privileges.
          </Alert>
        </Box>
      </Route>
    );
  }

  return (
    <Route path={path} {...rest}>
      <Component />
    </Route>
  );
}