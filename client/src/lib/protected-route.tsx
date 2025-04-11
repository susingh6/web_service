import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect, Route } from 'wouter';
import { Box, CircularProgress } from '@mui/material';

interface ProtectedRouteProps {
  children: ReactNode;
  path: string;
}

export function ProtectedRoute({
  children,
  path,
  ...rest
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

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

  return (
    <Route
      path={path}
      {...rest}
    >
      {isAuthenticated ? children : <Redirect to="/auth" />}
    </Route>
  );
}