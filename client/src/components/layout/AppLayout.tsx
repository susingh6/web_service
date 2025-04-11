import React, { useEffect } from 'react';
import { Box, Container, CssBaseline, ThemeProvider } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useLocation } from 'wouter';
import Header from './Header';
import Navigation from './Navigation';
import { useAuth } from '@/hooks/use-auth';
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
  console.log("Rendering AppLayout");
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  
  console.log("AppLayout state:", { isAuthenticated, isLoading, location });
  
  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isLoading && !isAuthenticated && !location.startsWith('/auth')) {
      console.log("Redirecting to /auth from AppLayout");
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
        <Navigation />
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
