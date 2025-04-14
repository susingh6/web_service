import React from 'react';
import { Box, Typography, Container, Paper, Button } from '@mui/material';
import { Plus, Download } from 'lucide-react';
import DagList from '@/components/dashboard/DagList';

const DagsPage: React.FC = () => {
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
      
      <DagList />
    </Container>
  );
};

export default DagsPage;