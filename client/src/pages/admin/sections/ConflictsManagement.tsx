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
  isResolving?: boolean;
}

interface PayloadData {
  loading: boolean;
  data: any;
  error?: string;
}

const ConflictDetailsDialog = ({ open, onClose, conflict, onResolve, isResolving = false }: ConflictDetailsDialogProps) => {
  const [resolutionType, setResolutionType] = useState('create_shared');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showPayload, setShowPayload] = useState(false);
  const [payloadData, setPayloadData] = useState<PayloadData>({ loading: false, data: null });

  const handleResolve = () => {
    if (!conflict || !resolutionNotes.trim()) {
      alert('Please provide resolution notes');
      return;
    }
    
    onResolve(conflict.notificationId, {
      resolutionType,
      resolutionNotes: resolutionNotes.trim(),
    });
    onClose();
  };

  const fetchPayload = async () => {
    if (!conflict) return;
    
    setPayloadData({ loading: true, data: null });
    try {
      // Call FastAPI directly for payload (not cached)
      const response = await fetch(`/api/fastapi/conflicts/${conflict.notificationId}/payload`);
      if (!response.ok) throw new Error('Failed to fetch payload');
      const data = await response.json();
      setPayloadData({ loading: false, data });
    } catch (error) {
      setPayloadData({ loading: false, data: null, error: 'Failed to load payload' });
    }
  };

  const handleTogglePayload = () => {
    if (!showPayload) {
      setShowPayload(true);
      fetchPayload();
    } else {
      setShowPayload(false);
    }
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
                  <strong>Existing Owner:</strong> {(conflict as any).conflictDetails?.existingOwner || 'Unknown'}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Requested By:</strong> {(conflict as any).conflictDetails?.requestedBy || 'Unknown'}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Created:</strong> {new Date(conflict.createdAt).toLocaleDateString()}
                </Typography>
                
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CodeIcon />}
                    onClick={handleTogglePayload}
                    disabled={showPayload && payloadData.loading}
                  >
                    {payloadData.loading ? 'Loading...' : showPayload ? 'Hide' : 'Show'} Payload
                  </Button>
                  
                  {showPayload && (
                    <Paper sx={{ mt: 2, p: 2, bgcolor: 'grey.50' }}>
                      {payloadData.loading && (
                        <Typography variant="caption">Loading payload...</Typography>
                      )}
                      {payloadData.error && (
                        <Typography variant="caption" color="error">{payloadData.error}</Typography>
                      )}
                      {payloadData.data && (
                        <Typography variant="caption" component="pre" sx={{ fontSize: '0.75rem' }}>
                          {JSON.stringify(payloadData.data, null, 2)}
                        </Typography>
                      )}
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
                      value="create_shared" 
                      control={<Radio />} 
                      label="Create shared ownership entity" 
                    />
                    <FormControlLabel 
                      value="reject_shared" 
                      control={<Radio />} 
                      label="Reject shared ownership entity request" 
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
                  required
                  error={!resolutionNotes.trim()}
                  helperText={!resolutionNotes.trim() ? "Resolution notes are required" : ""}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleResolve} 
          variant="contained" 
          color="primary"
          disabled={!resolutionNotes.trim() || isResolving}
        >
          {isResolving ? 'Applying...' : 'Apply Resolution'}
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
    queryKey: ['admin', 'conflicts'],
    staleTime: 6 * 60 * 60 * 1000, // Cache for 6 hours
    gcTime: 6 * 60 * 60 * 1000,    // Keep in memory for 6 hours
    queryFn: async () => {
      // Mock data for now - replace with real API
      const mockConflicts = [
        {
          id: 1,
          notificationId: 'CONF-2025-001',
          entityType: 'dag',
          conflictingTeams: ['PGM', 'Data Engineering'],
          originalPayload: {
            name: 'daily_revenue_dag',
            dag_name: 'daily_revenue_processing',
            dag_schedule: '0 2 * * *',
            team: 'Data Engineering',
            description: 'Daily revenue aggregation pipeline'
          },
          conflictDetails: {
            existingOwner: 'PGM',
            requestedBy: 'Data Engineering',
            reason: 'DAG name already exists with different ownership'
          },
          status: 'pending',
          createdAt: new Date('2025-09-07'),
          resolvedAt: null,
          resolutionType: null,
          resolutionNotes: null,
          resolvedBy: null
        },
        {
          id: 2,
          notificationId: 'CONF-2025-002',
          entityType: 'table',
          conflictingTeams: ['CDM', 'Analytics'],
          originalPayload: {
            name: 'customer_metrics',
            table_name: 'customer_daily_metrics',
            schema_name: 'analytics',
            team: 'Analytics',
            description: 'Customer behavior metrics table'
          },
          conflictDetails: {
            existingOwner: 'CDM',
            requestedBy: 'Analytics',
            reason: 'Table schema conflicts with existing CDM table'
          },
          status: 'pending',
          createdAt: new Date('2025-09-08'),
          resolvedAt: null,
          resolutionType: null,
          resolutionNotes: null,
          resolvedBy: null
        },
        {
          id: 3,
          notificationId: 'CONF-2025-003',
          entityType: 'dag',
          conflictingTeams: ['Core', 'CDM'],
          originalPayload: {
            name: 'etl_process_dag',
            dag_name: 'core_etl_pipeline',
            dag_schedule: '0 1 * * *',
            team: 'CDM',
            description: 'Core ETL processing pipeline'
          },
          conflictDetails: {
            existingOwner: 'Core',
            requestedBy: 'CDM',
            reason: 'Pipeline name conflicts with existing Core DAG'
          },
          status: 'pending',
          createdAt: new Date('2025-09-09'),
          resolvedAt: null,
          resolutionType: null,
          resolutionNotes: null,
          resolvedBy: null
        }
      ] as ConflictNotification[];
      
      return mockConflicts;
    },
  });

  // Resolve conflict mutation
  const resolveConflictMutation = useMutation({
    mutationFn: async ({ conflictId, resolution }: { conflictId: string; resolution: any }) => {
      // Call FastAPI endpoint to resolve conflict
      const response = await fetch(`/api/fastapi/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resolution),
      });
      
      if (!response.ok) {
        throw new Error('Failed to resolve conflict');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate admin conflicts cache
      queryClient.invalidateQueries({ queryKey: ['admin', 'conflicts'] });
      
      // Find the conflict to get team/tenant info for targeted cache invalidation
      const conflict = conflicts.find(c => c.notificationId === variables.conflictId);
      if (conflict && variables.resolution.resolutionType === 'create_shared') {
        // Invalidate specific team+tenant cache combinations
        const { conflictingTeams } = conflict;
        const requestedBy = (conflict as any).conflictDetails?.requestedBy;
        
        if (requestedBy && conflictingTeams.includes(requestedBy)) {
          // Invalidate cache for the requesting team's entities
          queryClient.invalidateQueries({ 
            queryKey: ['/api/entities'], 
            predicate: (query) => {
              // Invalidate queries that might include this team's data
              return query.queryKey.includes('/api/entities') || 
                     query.queryKey.includes('/api/dashboard');
            }
          });
          
          // Send WebSocket notification to users subscribed to this team/tenant combo
          // This will be handled by the WebSocket system to notify specific subscribers
          if (typeof window !== 'undefined' && (window as any).wsClient) {
            (window as any).wsClient.send(JSON.stringify({
              type: 'ENTITY_OWNERSHIP_UPDATED',
              team: requestedBy,
              conflictId: variables.conflictId,
              action: variables.resolution.resolutionType
            }));
          }
        }
      }
      
      toast({
        title: "Conflict Resolved",
        description: `The ownership conflict has been ${variables.resolution.resolutionType === 'create_shared' ? 'resolved with shared ownership' : 'rejected'}.`,
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
                  <TableCell>Conflicting Teams/Tenants</TableCell>
                  <TableCell>Existing Owner(s)</TableCell>
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
                        <Chip 
                          label={(conflict as any).conflictDetails?.existingOwner || 'Unknown'} 
                          size="small" 
                          color="primary" 
                          variant="outlined"
                        />
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
                        {conflict.status === 'pending' ? (
                          <Button 
                            size="small" 
                            variant="contained"
                            color="primary"
                            startIcon={<ResolveIcon />}
                            onClick={() => handleViewConflict(conflict)}
                          >
                            Resolve
                          </Button>
                        ) : (
                          <Chip 
                            label="Resolved" 
                            size="small" 
                            color="success"
                          />
                        )}
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
        isResolving={resolveConflictMutation.isPending}
      />
    </Box>
  );
};

export default ConflictsManagement;