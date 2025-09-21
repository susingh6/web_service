import React, { useEffect } from 'react';
import { Box, Container, CssBaseline, ThemeProvider } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useLocation } from 'wouter';
import Header from './Header';
import { useAuth } from '@/hooks/use-auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppDispatch } from '@/lib/store';
import { fetchEntities } from '@/features/sla/slices/entitiesSlice';
import { fetchDashboardSummary } from '@/features/sla/slices/dashboardSlice';
import { useQueryClient } from '@tanstack/react-query';
import theme from '@/lib/theme';

const MainContent = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  overflow: 'auto',
  backgroundColor: theme.palette.background.default,
  minHeight: 'calc(100vh - 120px)', // Adjust for header and nav height
}));

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  
  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    onEntityUpdated: (data: any) => {
      if (data.type === 'deleted') {
        // Invalidate React Query cache for immediate UI updates
        queryClient.invalidateQueries({
          predicate: (query) => {
            const queryKey = query.queryKey;
            return (
              queryKey.includes('entities') || 
              queryKey.includes('/api/entities') ||
              queryKey.includes('dashboard') ||
              queryKey.includes('/api/dashboard')
            );
          }
        });
        
        // Refresh using Summary's currently selected tenant (persisted by Summary.tsx)
        try {
          const raw = sessionStorage.getItem('dashboard_ui_state_v1');
          const selectedTenantName = raw ? (JSON.parse(raw)?.selectedTenantName as string | undefined) : undefined;
          if (selectedTenantName) {
            dispatch(fetchEntities({ tenant: selectedTenantName }));
            dispatch(fetchDashboardSummary({ tenantName: selectedTenantName } as any));
          }
        } catch {
          // Ignore parse errors; no refresh if tenant unknown
        }
      }
    }
  });
  
  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isLoading && !isAuthenticated && !location.startsWith('/auth')) {
      setLocation('/auth');
    }
  }, [isAuthenticated, isLoading, location, setLocation]);
  
  if (isLoading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          bgcolor={theme.palette.background.default}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '3px solid rgba(0, 0, 0, 0.1)',
              borderTopColor: theme.palette.primary.main,
              animation: 'spin 1s linear infinite',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
        </Box>
      </ThemeProvider>
    );
  }
  
  // Don't wrap auth pages with app layout
  if (location.startsWith('/auth')) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    );
  }
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box display="flex" flexDirection="column" minHeight="100vh">
        <Header />
        <MainContent>
          <Box sx={{ p: 3, width: '100%' }}>
            {children}
          </Box>
        </MainContent>
      </Box>
    </ThemeProvider>
  );
};

export default AppLayout;
