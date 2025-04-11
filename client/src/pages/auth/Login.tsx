import { useState, useEffect } from 'react';
import { Box, Typography, Button, Card, CardContent, CircularProgress, useTheme } from '@mui/material';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';

const Login = () => {
  const theme = useTheme();
  const { login, isAuthenticated, isLoading, error } = useAuth();
  const [, setLocation] = useLocation();
  const [localLoading, setLocalLoading] = useState(false);

  useEffect(() => {
    // Redirect to home if already authenticated
    if (isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  const handleLogin = async () => {
    try {
      setLocalLoading(true);
      await login();
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor={theme.palette.background.default}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor={theme.palette.background.default}
    >
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2, borderRadius: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Box display="flex" alignItems="center" justifyContent="center" mb={4}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" color={theme.palette.primary.main}>
              <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2 0v10h9c-.5-5.05-4.76-9-10-9zm0 12v8c5.24-.1 9.5-4.05 10-9h-10z"></path>
            </svg>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                ml: 2,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
              }}
            >
              SLA Monitoring Tool
            </Typography>
          </Box>

          <Typography variant="body1" align="center" color="text.secondary" paragraph>
            Sign in with your Azure AD account to access the SLA Monitoring Tool.
          </Typography>

          {error && (
            <Typography color="error" align="center" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}

          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            onClick={handleLogin}
            disabled={localLoading}
            sx={{ mt: 2, py: 1.5 }}
          >
            {localLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Sign in with Azure AD'
            )}
          </Button>
        </CardContent>
      </Card>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
        © {new Date().getFullYear()} SLA Monitoring Tool
      </Typography>
    </Box>
  );
};

export default Login;
