import React, { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Box, CircularProgress, Alert, Typography, Paper } from '@mui/material';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { config } from '@/config';

interface IncidentContext {
  notification_id: string;
  task_name: string;
  error_summary: string;
  logs_url?: string;
  date_key: string;
}

interface IncidentResolutionData {
  dagId: number;
  dagEntity: any;
  incidentContext: IncidentContext;
}

const IncidentPage: React.FC = () => {
  const [match, params] = useRoute('/incident/:notificationId');
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const notificationId = params?.notificationId;

  useEffect(() => {
    if (!notificationId) {
      setError('No incident notification ID provided');
      setLoading(false);
      return;
    }

    // Wait for auth to complete
    if (authLoading) {
      return;
    }

    // Check if user is authenticated
    if (!user) {
      // Redirect to login with return URL
      navigate(`/auth?return=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    // Resolve incident to DAG entity
    resolveIncident();
  }, [notificationId, user, authLoading, navigate]);

  const resolveIncident = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call incident resolution endpoint
      const response = await apiRequest<IncidentResolutionData>(
        config.endpoints.incidents.resolve(notificationId!),
        {
          method: 'GET',
        }
      );

      if (response.dagId && response.dagEntity) {
        // Store incident context in sessionStorage for the DAG detail page
        const incidentContextKey = `incident_context_${response.dagId}`;
        sessionStorage.setItem(incidentContextKey, JSON.stringify(response.incidentContext));

        // Redirect to DAG detail page with incident context flag
        navigate(`/dag/${response.dagId}?incident=${notificationId}`);
      } else {
        setError('Invalid incident resolution data received');
      }
    } catch (err: any) {
      console.error('Error resolving incident:', err);
      
      if (err.status === 404) {
        setError('Incident not found. It may have been resolved or the link is invalid.');
      } else if (err.status === 401) {
        navigate(`/auth?return=${encodeURIComponent(window.location.pathname)}`);
        return;
      } else {
        setError('Failed to resolve incident. Please try again or contact support.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="60vh"
        gap={2}
      >
        <CircularProgress size={48} />
        <Typography variant="h6" color="textSecondary">
          {authLoading ? 'Authenticating...' : 'Resolving incident...'}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Please wait while we process your incident link
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="60vh"
        gap={2}
        px={3}
      >
        <Paper elevation={2} sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Incident Resolution Failed
            </Typography>
            <Typography variant="body2">
              {error}
            </Typography>
          </Alert>
          
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Incident ID: <code>{notificationId}</code>
          </Typography>
          
          <Box mt={3}>
            <Typography variant="body2" color="textSecondary">
              If this issue persists, please contact your system administrator 
              or check if the incident link is still valid.
            </Typography>
          </Box>
        </Paper>
      </Box>
    );
  }

  // Should not reach here normally, but just in case
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      minHeight="60vh"
    >
      <Typography variant="body1" color="textSecondary">
        Processing incident...
      </Typography>
    </Box>
  );
};

export default IncidentPage;