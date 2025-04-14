import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Alert
} from '@mui/material';
import { format } from 'date-fns';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { dagsApi } from '@/features/sla/api';
import { Entity } from '@shared/schema';

const DagList = () => {
  const { data: dags, isLoading, error } = useQuery<Entity[]>({
    queryKey: ['/api/dags'],
    queryFn: () => dagsApi.getAll(),
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" m={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Error loading DAGs: {error instanceof Error ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  if (!dags || dags.length === 0) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        No DAGs found in the system.
      </Alert>
    );
  }

  const getStatusIcon = (status: string | null | undefined) => {
    if (!status) return <AlertTriangle color="orange" size={18} />;
    
    switch (status.toLowerCase()) {
      case 'success':
      case 'healthy':
        return <CheckCircle color="green" size={18} />;
      case 'failed':
      case 'critical':
        return <XCircle color="red" size={18} />;
      case 'running':
        return <CircularProgress size={18} />;
      case 'warning':
        return <AlertTriangle color="orange" size={18} />;
      default:
        return <AlertTriangle color="orange" size={18} />;
    }
  };

  return (
    <Paper elevation={3} sx={{ margin: 2, overflow: 'hidden' }}>
      <Box p={2} bgcolor="primary.main" color="primary.contrastText">
        <Typography variant="h6" component="h2">
          DAG Entities
        </Typography>
      </Box>
      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Schedule</TableCell>
              <TableCell>Last Run</TableCell>
              <TableCell>Team</TableCell>
              <TableCell>Compliance</TableCell>
              <TableCell>Owner</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dags.map((dag) => (
              <TableRow 
                key={dag.id}
                hover
                sx={{ 
                  '&:hover': { 
                    cursor: 'pointer',
                    backgroundColor: 'action.hover' 
                  }
                }}
              >
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {dag.dag_name || dag.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dag.dag_description || dag.description}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    {getStatusIcon(dag.lastStatus || dag.status)}
                    <Typography variant="body2">
                      {dag.lastStatus || dag.status}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {dag.dag_schedule || "* * * * *"}
                  </Typography>
                </TableCell>
                <TableCell>
                  {dag.lastRun ? (
                    <Typography variant="body2">
                      {format(new Date(dag.lastRun), 'yyyy-MM-dd HH:mm')}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Never
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={dag.team_name || `Team ${dag.teamId}`}
                    size="small"
                    sx={{ 
                      backgroundColor: 'primary.light',
                      color: 'primary.contrastText'
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography 
                    variant="body2" 
                    color={dag.currentSla && dag.currentSla > 95 ? 'success.main' : 'error.main'}
                    fontWeight="medium"
                  >
                    {dag.currentSla ? `${dag.currentSla.toFixed(1)}%` : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {dag.user_name || dag.owner || "Unassigned"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dag.user_email || dag.ownerEmail || "No email"}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default DagList;