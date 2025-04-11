import React from 'react';
import { Box, Container, CssBaseline, ThemeProvider } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useLocation } from 'wouter';
import Header from './Header';
import Navigation from './Navigation';
import { useAuth } from '@/hooks/use-auth';
import theme from '@/lib/theme';
import { Redirect } from 'wouter';

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
  
  // Debug logs for Replit webview issue
  console.log("AppLayout loading state:", isLoading);
  
  // Comment out loading spinner to debug Replit webview issue
  // if (isLoading) {
  //   return (
  //     <Box
  //       display="flex"
  //       justifyContent="center"
  //       alignItems="center"
  //       minHeight="100vh"
  //       bgcolor={theme.palette.background.default}
  //     >
  //       <Box
  //         sx={{
  //           width: 40,
  //           height: 40,
  //           borderRadius: '50%',
  //           border: '3px solid rgba(0, 0, 0, 0.1)',
  //           borderTopColor: theme.palette.primary.main,
  //           animation: 'spin 1s linear infinite',
  //           '@keyframes spin': {
  //             '0%': { transform: 'rotate(0deg)' },
  //             '100%': { transform: 'rotate(360deg)' },
  //           },
  //         }}
  //       />
  //     </Box>
  //   );
  // }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect to="/auth" />;
  }
  
  return (
    <Box display="flex" flexDirection="column" minHeight="100vh">
      <Header />
      <Navigation />
      <MainContent>
        <Box sx={{ p: 3, width: '100%' }}>
          {children}
        </Box>
      </MainContent>
    </Box>
  );
};

export default AppLayout;
