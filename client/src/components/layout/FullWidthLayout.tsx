import React, { useState, useEffect } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { styled } from '@mui/material/styles';
import Header from './Header';
import Navigation from './Navigation';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';

// Using viewport-relative units to ensure the layout always fills the screen
const LayoutRoot = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  width: '100%',
  maxWidth: '100%',
  margin: 0,
  padding: 0,
  overflow: 'hidden',
  boxSizing: 'border-box',
  position: 'relative',
});

const LayoutContent = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  width: '100%',
  maxWidth: '100%',
  overflowX: 'hidden',
  position: 'relative',
});

// Responsive padding based on screen size
const ContentWrapper = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: '100%',
  padding: theme.spacing(3),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
  boxSizing: 'border-box',
  overflow: 'hidden', // Prevents horizontal scrolling
}));

interface FullWidthLayoutProps {
  children: React.ReactNode;
}

const FullWidthLayout: React.FC<FullWidthLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !location.startsWith('/auth')) {
      setLocation('/auth');
    }
  }, [isAuthenticated, isLoading, location, setLocation]);
  
  // Show loading spinner when authentication is in progress
  if (isLoading) {
    return (
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
    );
  }
  
  // Don't wrap auth pages with the full app layout
  if (location.startsWith('/auth')) {
    return <>{children}</>;
  }
  
  // Main layout with responsive adjustments
  return (
    <LayoutRoot>
      <Header />
      <Navigation />
      <LayoutContent>
        <ContentWrapper sx={{ 
          px: isMobile ? 1 : 3, // Responsive padding
          py: 2
        }}>
          {children}
        </ContentWrapper>
      </LayoutContent>
    </LayoutRoot>
  );
};

export default FullWidthLayout;