import React from 'react';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import theme from '@/lib/theme';
import { useLocation } from 'wouter';

interface SimpleAppLayoutProps {
  children: React.ReactNode;
}

/**
 * Simplified App Layout that doesn't depend on the auth provider
 * Used as a temporary solution while we fix the authentication issues
 */
const SimpleAppLayout = ({ children }: SimpleAppLayoutProps) => {
  const [location] = useLocation();
  
  // Don't add layout to login/auth pages
  if (location === '/login' || location === '/auth') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    );
  }
  
  // Basic layout for other pages
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box display="flex" flexDirection="column" minHeight="100vh">
        <Box 
          component="header" 
          sx={{ 
            py: 2, 
            px: 3,
            bgcolor: theme.palette.primary.main,
            color: 'white',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>SLA Monitoring Tool</h1>
        </Box>
        
        <Box 
          component="main"
          sx={{ 
            flexGrow: 1, 
            p: 3, 
            bgcolor: theme.palette.background.default 
          }}
        >
          {children}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default SimpleAppLayout;