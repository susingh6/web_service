import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Container, 
  Paper, 
  Button, 
  CircularProgress, 
  Alert, 
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material';
import { Plus, Download, AlertTriangle } from 'lucide-react';
import DagList from '@/components/dashboard/DagList';
import { useQuery } from '@tanstack/react-query';
import { Entity } from '@shared/schema';
import { teamsApi } from '@/features/sla/api';

const DagsPage: React.FC = () => {
  const [showLoginDialog, setShowLoginDialog] = useState(true);
  
  // Fetch teams for filtering options
  const { data: teams = [], isLoading: isLoadingTeams } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: () => teamsApi.getAll(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const handleCloseLoginDialog = () => {
    setShowLoginDialog(false);
  };
  
  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          DAG Monitoring
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Download />}
            size="medium"
          >
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<Plus />}
            size="medium"
          >
            Add DAG
          </Button>
        </Box>
      </Box>
      
      <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
        <Typography variant="body1" color="text.secondary">
          Manage and monitor all DAG entities in the system. View schedules, dependencies, and performance metrics.
        </Typography>
      </Paper>
      
      <DagList 
        dags={[]} 
        isLoading={false} 
        error={null} 
        showActions={false} // Don't show actions in summary pages
      />
      
      {/* Login reminder dialog */}
      <Dialog open={showLoginDialog} onClose={handleCloseLoginDialog}>
        <DialogTitle display="flex" alignItems="center" gap={1}>
          <AlertTriangle color="orange" size={24} />
          Authentication Required
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are viewing the application in test mode. Some features like editing and saving may not work until you log in. 
            You can use the credentials below for testing:
          </DialogContentText>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1, fontFamily: 'monospace' }}>
            <Typography variant="body2">Username: azure_test_user</Typography>
            <Typography variant="body2">Password: Azure123!</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseLoginDialog} color="primary">
            Continue in Test Mode
          </Button>
          <Button onClick={() => window.location.href = "/auth"} variant="contained" color="primary">
            Go to Login
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DagsPage;