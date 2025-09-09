import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Paper,
  Grid,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Visibility as ViewIcon,
  CheckCircle as ResolveIcon,
  Cancel as RejectIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { apiRequest } from '@/lib/queryClient';
import { ConflictNotification } from '@shared/schema';

interface ConflictDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  conflict: ConflictNotification | null;
  onResolve: (conflictId: string, resolution: any) => void;
}

const ConflictDetailsDialog = ({ open, onClose, conflict, onResolve }: ConflictDetailsDialogProps) => {
  const [resolutionType, setResolutionType] = useState('shared_ownership');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showPayload, setShowPayload] = useState(false);

  const handleResolve = () => {
    if (!conflict) return;
    
    onResolve(conflict.notificationId, {
      resolutionType,
      resolutionNotes,
    });
    onClose();
  };

  if (!conflict) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Resolve Conflict: {conflict.notificationId}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={3}>
          <Grid size={12} sx={{ md: 6 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Conflict Details
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Entity Type:</strong> {conflict.entityType}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Conflicting Teams:</strong> {conflict.conflictingTeams.join(', ')}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Created:</strong> {new Date(conflict.createdAt).toLocaleDateString()}
                </Typography>
                
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CodeIcon />}
                    onClick={() => setShowPayload(!showPayload)}
                  >
                    {showPayload ? 'Hide' : 'Show'} Payload
                  </Button>
                  
                  {showPayload && (
                    <Paper sx={{ mt: 2, p: 2, bgcolor: 'grey.50' }}>
                      <Typography variant="caption" component="pre" sx={{ fontSize: '0.75rem' }}>
                        {JSON.stringify(conflict.originalPayload, null, 2)}
                      </Typography>
                    </Paper>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid size={12} sx={{ md: 6 }}>
            <Card variant="outlined">
              <CardContent>
                <FormControl component="fieldset">
                  <FormLabel component="legend">Resolution Options</FormLabel>
                  <RadioGroup
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value)}
                  >
                    <FormControlLabel 
                      value="shared_ownership" 
                      control={<Radio />} 
                      label="Create shared ownership entity" 
                    />
                    <FormControlLabel 
                      value="approve_original" 
                      control={<Radio />} 
                      label="Approve original request" 
                    />
                    <FormControlLabel 
                      value="approve_new" 
                      control={<Radio />} 
                      label="Approve new request" 
                    />
                    <FormControlLabel 
                      value="reject_both" 
                      control={<Radio />} 
                      label="Reject both (manual coordination)" 
                    />
                  </RadioGroup>
                </FormControl>
                
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Resolution Notes"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  sx={{ mt: 2 }}
                  placeholder="Explain the resolution decision..."
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleResolve} variant="contained" color="primary">
          Apply Resolution
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ConflictsManagement = () => {
  const [selectedConflict, setSelectedConflict] = useState<ConflictNotification | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch conflicts data
  const { data: conflicts = [], isLoading } = useQuery<ConflictNotification[]>({
    queryKey: ['/api/admin/conflicts'],
    queryFn: async () => {
      // Mock data for now - replace with real API
      return [
        {
          id: 1,
          notificationId: 'NOT-001',
          entityType: 'dag',
          conflictingTeams: ['PGM', 'CDM'],
          originalPayload: {
            name: 'agg_daily_pgm',
            dag_name: 'agg_daily',
            dag_schedule: '0 2 * * *',
            team: 'CDM'
          },
          status: 'pending',
          createdAt: new Date('2025-01-07'),
        },
        {
          id: 2,
          notificationId: 'NOT-002',
          entityType: 'table',
          conflictingTeams: ['Core', 'CDM'],
          originalPayload: {
            name: 'user_metrics',
            table_name: 'user_metrics',
            team: 'CDM'
          },
          status: 'pending',
          createdAt: new Date('2025-01-08'),
        },
      ] as ConflictNotification[];
    },
  });

  // Resolve conflict mutation
  const resolveConflictMutation = useMutation({
    mutationFn: async ({ conflictId, resolution }: { conflictId: string; resolution: any }) => {
      return await apiRequest('POST', buildUrl(endpoints.admin.conflicts.resolve, conflictId), resolution);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/conflicts'] });
      toast({
        title: "Conflict Resolved",
        description: "The ownership conflict has been successfully resolved.",
      });
    },
    onError: () => {
      toast({
        title: "Resolution Failed",
        description: "Failed to resolve the conflict. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleViewConflict = (conflict: ConflictNotification) => {
    setSelectedConflict(conflict);
    setDialogOpen(true);
  };

  const handleResolveConflict = (conflictId: string, resolution: any) => {
    resolveConflictMutation.mutate({ conflictId, resolution });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'error';
      case 'resolved': return 'success';
      case 'rejected': return 'default';
      default: return 'default';
    }
  };

  const getPriorityIcon = (entityType: string, daysOld: number) => {
    if (daysOld >= 3) return '🔴';
    if (daysOld >= 1) return '🟡';
    return '🟢';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Ownership Conflicts
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Resolve entity ownership conflicts between teams
      </Typography>

      <Card elevation={2}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Pending Conflicts ({conflicts.filter(c => c.status === 'pending').length})
          </Typography>
          
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Notification ID</TableCell>
                  <TableCell>Entity Type</TableCell>
                  <TableCell>Conflicting Teams</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {conflicts.map((conflict) => {
                  const daysOld = conflict.createdAt ? Math.floor((new Date().getTime() - new Date(conflict.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  
                  return (
                    <TableRow key={conflict.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <span>{getPriorityIcon(conflict.entityType, daysOld)}</span>
                          <Typography variant="body2" fontWeight="medium">
                            {conflict.notificationId}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={conflict.entityType?.toUpperCase() || 'UNKNOWN'} 
                          size="small" 
                          variant="outlined"
                          color={conflict.entityType === 'dag' ? 'primary' : 'secondary'}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {(conflict.conflictingTeams || []).map((team) => (
                            <Chip key={team} label={team} size="small" />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {conflict.createdAt ? new Date(conflict.createdAt).toLocaleDateString() : 'Unknown'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {daysOld} days ago
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={conflict.status} 
                          size="small" 
                          color={getStatusColor(conflict.status) as any}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="View Details">
                            <IconButton 
                              size="small" 
                              onClick={() => handleViewConflict(conflict)}
                            >
                              <ViewIcon />
                            </IconButton>
                          </Tooltip>
                          {conflict.status === 'pending' && (
                            <Tooltip title="Resolve">
                              <IconButton 
                                size="small" 
                                color="primary"
                                onClick={() => handleViewConflict(conflict)}
                              >
                                <ResolveIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <ConflictDetailsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        conflict={selectedConflict}
        onResolve={handleResolveConflict}
      />
    </Box>
  );
};

export default ConflictsManagement;