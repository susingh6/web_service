import { useState, useMemo, useDeferredValue } from 'react';
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
  Tooltip,
  InputAdornment
} from '@mui/material';
import {
  Visibility as ViewIcon,
  CheckCircle as ResolveIcon,
  Cancel as RejectIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material';
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
  const [payloadText, setPayloadText] = useState<string>('');
  const [payloadError, setPayloadError] = useState<string | undefined>(undefined);

  const handleResolve = () => {
    if (!conflict || !resolutionNotes.trim()) {
      alert('Please provide resolution notes');
      return;
    }
    // Parse edited payload if present
    let editedPayload: any | undefined = undefined;
    if (showPayload && payloadText.trim()) {
      try {
        editedPayload = JSON.parse(payloadText);
        setPayloadError(undefined);
      } catch {
        setPayloadError('Invalid JSON');
        return;
      }
    }

    onResolve(conflict.notificationId, {
      resolutionType,
      resolutionNotes: resolutionNotes.trim(),
      payload: editedPayload ?? payloadData.data ?? undefined,
    });
    onClose();
  };

  const loadLocalPayload = () => {
    if (!conflict) return;
    setPayloadData({ loading: false, data: null });
    const localPayload = (conflict as any).originalPayload;
    if (localPayload && Object.keys(localPayload).length > 0) {
      setPayloadData({ loading: false, data: localPayload });
      try {
        setPayloadText(JSON.stringify(localPayload, null, 2));
        setPayloadError(undefined);
      } catch {
        setPayloadText('');
        setPayloadError('Failed to stringify payload');
      }
    } else {
      setPayloadData({ loading: false, data: null, error: 'No payload stored with this conflict' });
      setPayloadText('');
      setPayloadError(undefined);
    }
  };

  const handleTogglePayload = () => {
    if (!showPayload) {
      setShowPayload(true);
      loadLocalPayload();
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
                  <strong>Conflicting Entity:</strong> {(conflict as any).entityName || 'Unknown'}
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
                      <TextField
                        fullWidth
                        multiline
                        minRows={12}
                        value={payloadText}
                        onChange={(e) => setPayloadText(e.target.value)}
                        placeholder={'{\n  "name": "..."\n}'}
                        InputProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: '0.8rem' } }}
                        error={!!payloadError}
                        helperText={payloadError}
                      />
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
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch conflicts data
  const { data: conflicts = [], isLoading } = useQuery<ConflictNotification[]>({
    queryKey: ['admin', 'conflicts', 'v2'], // Changed key to force refresh
    staleTime: 6 * 60 * 60 * 1000, // Cache for 6 hours
    gcTime: 6 * 60 * 60 * 1000,    // Keep in memory for 6 hours
    queryFn: async () => {
      // Fetch from server (returns empty if Redis connected, mock if Redis unavailable)
      const res = await fetch('/api/v1/conflicts');
      if (!res.ok) {
        console.warn('Failed to fetch conflicts, returning empty array');
        return [];
      }
      return res.json();
      
      // Old mock data (kept as reference):
      /*
      const mockConflicts = [
        {
          id: 1,
          notificationId: 'CONF-2025-001',
          entityType: 'dag',
          conflictingTeams: ['PGM', 'Core'],
          entityName: 'daily_revenue_processing',
          originalPayload: {
            name: 'daily_revenue_dag',
            dag_name: 'daily_revenue_processing',
            dag_schedule: '0 2 * * *',
            team: 'Core',
            description: 'Daily revenue aggregation pipeline'
          },
          conflictDetails: {
            existingOwner: 'PGM',
            requestedBy: 'sarah.lee@company.com',
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
          conflictingTeams: ['CDM', 'Viewer Product'],
          entityName: 'analytics.customer_daily_metrics',
          originalPayload: {
            name: 'customer_metrics',
            table_name: 'customer_daily_metrics',
            schema_name: 'analytics',
            team: 'Viewer Product',
            description: 'Customer behavior metrics table'
          },
          conflictDetails: {
            existingOwner: 'CDM',
            requestedBy: 'mike.johnson@company.com',
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
          conflictingTeams: ['IOT', 'Ad Serving'],
          entityName: 'core_etl_pipeline',
          originalPayload: {
            name: 'etl_process_dag',
            dag_name: 'core_etl_pipeline',
            dag_schedule: '0 1 * * *',
            team: 'CDM',
            description: 'Core ETL processing pipeline'
          },
          conflictDetails: {
            existingOwner: 'Core',
            requestedBy: 'alice.wong@company.com',
            reason: 'Pipeline name conflicts with existing Core DAG'
          },
          status: 'pending',
          createdAt: new Date('2025-09-09'),
          resolvedAt: null,
          resolutionType: null,
          resolutionNotes: null,
          resolvedBy: null
        }
      ];
      
      return mockConflicts as unknown as ConflictNotification[];
      */
    },
  });

  // Resolve conflict mutation
  const resolveConflictMutation = useMutation({
    mutationFn: async ({ conflictId, resolution }: { conflictId: string; resolution: any }) => {
      // Call FastAPI endpoint to resolve conflict
      const response = await fetch(`/api/v1/conflicts/${conflictId}/resolve`, {
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
      // Central admin cache invalidation
      // Prefer centralized helper to keep parity with other admin sections
      import('@/lib/cacheKeys').then(({ invalidateAdminCaches }) => invalidateAdminCaches(queryClient));
      
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

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsConflict, setDetailsConflict] = useState<ConflictNotification | null>(null);
  const openResolutionDetails = (conflict: ConflictNotification) => {
    setDetailsConflict(conflict);
    setDetailsOpen(true);
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

  // Filter conflicts using tokenized AND search across several fields
  const filteredConflicts = useMemo(() => {
    if (!conflicts || conflicts.length === 0) return [] as ConflictNotification[];
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return conflicts as ConflictNotification[];
    const tokens = q.split(' ').filter(Boolean);
    return (conflicts as any[]).filter((c) => {
      const fields = [
        c.notificationId,
        c.entityType,
        (c as any).entityName || '',
        (c.conflictingTeams || []).join(' '),
        (c as any).conflictDetails?.existingOwner || '',
        (c as any).conflictDetails?.requestedBy || (c as any).originalPayload?.action_by_user_email || (c as any).originalPayload?.user_email || ''
      ].join(' ').toLowerCase();
      return tokens.every(tok => fields.includes(tok));
    });
  }, [conflicts, deferredSearchQuery]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Ownership Conflicts
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Resolve entity ownership conflicts between teams
        </Typography>
        <TextField
          size="small"
          placeholder="Search conflicts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ minWidth: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')} edge="end">
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Pending Conflicts ({filteredConflicts.filter(c => c.status === 'pending').length})
          </Typography>
          
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Notification ID</TableCell>
                  <TableCell>Entity Type</TableCell>
                  <TableCell>Conflicting Entity</TableCell>
                  <TableCell>Conflicting Teams</TableCell>
                  <TableCell>Existing Owner(s)</TableCell>
                  <TableCell>Requested By</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredConflicts.map((conflict) => {
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
                        <Typography variant="body2" fontWeight="medium">
                          {(conflict as any).entityName || 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {(conflict.conflictingTeams || []).map((team: string) => (
                            <Chip key={team} label={team} size="small" />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={(conflict as any).conflictDetails?.existingOwner || 'Unknown'} 
                          size="small" 
                          color="primary" 
                          variant="filled"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {(conflict as any).conflictDetails?.requestedBy || (conflict as any).originalPayload?.action_by_user_email || (conflict as any).originalPayload?.user_email || 'Unknown'}
                        </Typography>
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
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openResolutionDetails(conflict)}
                          >
                            Resolution Details
                          </Button>
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

      {/* Read-only resolution details dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Resolution Details: {detailsConflict?.notificationId}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid size={12} sx={{ md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Summary
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    <strong>Status:</strong> {detailsConflict?.status}
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    <strong>Resolution:</strong> {(detailsConflict as any)?.resolutionType || 'Unknown'}
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    <strong>Notes:</strong> {(detailsConflict as any)?.resolutionNotes || '—'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={12} sx={{ md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {((detailsConflict as any)?.status === 'rejected') ? 'Rejected Payload' : 'Applied Payload'}
                  </Typography>
                  <Paper sx={{ mt: 1, p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="caption" component="pre" sx={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify((detailsConflict as any)?.appliedPayload || (detailsConflict as any)?.originalPayload || {}, null, 2)}
                    </Typography>
                  </Paper>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ConflictsManagement;