import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Grid,
  Chip,
  Button,
  Paper,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Settings as SettingsIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Analytics as AnalyticsIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { Entity, Issue } from '@shared/schema';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import SlaStatusChart from '@/components/charts/SlaStatusChart';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { buildUrl, endpoints } from '@/config';
import { useQuery } from '@tanstack/react-query';

interface EntityDetailsModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
}

// Helper function to get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'error';
    default:
      return 'default';
  }
};

// Mock issues data - in a real app, this would come from an API
const mockIssues: Issue[] = [
  {
    id: 1,
    entityId: 1,
    type: 'delay',
    description: 'Refresh delay detected',
    severity: 'medium',
    date: new Date(2023, 3, 12),
    resolved: false,
    resolvedAt: null,
  },
  {
    id: 2,
    entityId: 1,
    type: 'quality',
    description: 'Data quality check failed',
    severity: 'high',
    date: new Date(2023, 3, 5),
    resolved: false,
    resolvedAt: null,
  },
];

const EntityDetailsModal = ({ open, onClose, entity, teams }: EntityDetailsModalProps) => {
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [isEditingOwner, setIsEditingOwner] = useState(false);
  const [ownerEmailInput, setOwnerEmailInput] = useState('');
  const [isUpdatingOwner, setIsUpdatingOwner] = useState(false);
  
  // State for rollback functionality
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [selectedRollbackVersion, setSelectedRollbackVersion] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Find team name - do this before early return to avoid hooks order issues
  const teamName = entity ? teams.find(team => team.id === entity.teamId)?.name || 'Unknown Team' : '';
  
  // Update owner functionality
  const updateOwner = async () => {
    if (!entity || !teamName) return;
    
    // Get user email from authentication context with proper type checking
    const getUserEmail = () => {
      if (!user) return '';
      
      // Type guard to check if user has email property
      if ('email' in user && typeof user.email === 'string') return user.email;
      
      // Check for Azure AD properties with type safety
      const azureUser = user as Record<string, any>;
      if (typeof azureUser.mail === 'string') return azureUser.mail;
      if (typeof azureUser.preferredUsername === 'string') return azureUser.preferredUsername;
      if (typeof azureUser.upn === 'string') return azureUser.upn;
      
      return '';
    };
    
    const userEmail = getUserEmail();
    if (!userEmail) {
      toast({
        title: 'Error',
        description: 'User email not found. Please log in again.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUpdatingOwner(true);
    try {
      const payload = {
        user_email: userEmail,
        team_name: teamName,
        tenant_name: entity.tenant_name || 'Data Engineering',
        owner_email: ownerEmailInput,
      };
      
      // Make PATCH request to update owner
      const response = await apiRequest('PATCH', buildUrl(`/api/entities/${entity.id}/owner`), payload);
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Owner updated successfully.',
          variant: 'default',
        });
        
        // Refresh the owner data
        queryClient.invalidateQueries({ queryKey: ['ownerSlaSettings', entity?.type, teamName, entity?.name] });
        
        // Reset edit state
        setIsEditingOwner(false);
        setOwnerEmailInput('');
      } else {
        throw new Error('Failed to update owner');
      }
    } catch (error) {
      console.error('Error updating owner:', error);
      toast({
        title: 'Error',
        description: 'Failed to update owner. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingOwner(false);
    }
  };
  
  // Handle starting edit mode
  const startEditingOwner = () => {
    // Try multiple possible field names for owner email
    const currentOwnerEmail = ownerSlaSettings?.ownerEmail || 
                             ownerSlaSettings?.owner_email || 
                             ownerSlaSettings?.email ||
                             'rachel.green@company.com'; // Fallback for demo
    console.log('Owner SLA Settings:', ownerSlaSettings);
    console.log('Setting owner email input to:', currentOwnerEmail);
    setOwnerEmailInput(currentOwnerEmail);
    setIsEditingOwner(true);
  };
  
  // Handle canceling edit mode
  const cancelEditingOwner = () => {
    setIsEditingOwner(false);
    setOwnerEmailInput('');
  };

  // Handle rollback functionality
  const handleRollbackClick = (version: number) => {
    setSelectedRollbackVersion(version);
    setRollbackConfirmOpen(true);
  };

  const handleRollbackConfirm = async () => {
    if (!entity || !teamName || selectedRollbackVersion === null) return;
    
    // Get user email from authentication context with proper type checking
    const getUserEmail = () => {
      if (!user) return '';
      
      // Type guard to check if user has email property
      if ('email' in user && typeof user.email === 'string') return user.email;
      
      // Check for Azure AD properties with type safety
      const azureUser = user as Record<string, any>;
      if (typeof azureUser.mail === 'string') return azureUser.mail;
      if (typeof azureUser.preferredUsername === 'string') return azureUser.preferredUsername;
      if (typeof azureUser.upn === 'string') return azureUser.upn;
      
      return '';
    };
    
    const userEmail = getUserEmail();
    if (!userEmail) {
      toast({
        title: 'Error',
        description: 'User email not found. Please log in again.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsRollingBack(true);
    try {
      const payload = {
        toVersion: selectedRollbackVersion,
        user_email: userEmail,
        reason: `Rollback to version ${selectedRollbackVersion}`
      };
      
      // Make POST request to rollback endpoint
      const response = await apiRequest('POST', buildUrl(`/api/teams/${teamName}/${entity.type}/${entity.name}/rollback`), payload);
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: `Successfully rolled back to version ${selectedRollbackVersion}.`,
          variant: 'default',
        });
        
        // Comprehensive cache invalidation after rollback to ensure all entity data is refreshed
        
        // 1. Entity-specific modal data (current implementation)
        queryClient.invalidateQueries({ queryKey: ['ownerSlaSettings', entity?.type, teamName, entity?.name] });
        queryClient.invalidateQueries({ queryKey: ['recentSettingsChanges', entity?.type, teamName, entity?.name] });
        queryClient.invalidateQueries({ queryKey: ['slaStatusHistory', entity?.type, teamName, entity?.name] });
        
        // 2. General entity list caches (used throughout the application)
        queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
        queryClient.invalidateQueries({ queryKey: ['/api/entities', { teamId: entity.teamId }] });
        queryClient.invalidateQueries({ queryKey: ['/api/entities', { type: entity.type }] });
        queryClient.invalidateQueries({ queryKey: ['/api/entities', { teamId: entity.teamId, type: entity.type }] });
        
        // 3. Specific entity detail and history caches
        queryClient.invalidateQueries({ queryKey: [`/api/entities/${entity.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/entities/${entity.id}/history`] });
        
        // 4. WebSocket real-time entity caches (used by useRealTimeEntities)
        queryClient.invalidateQueries({ queryKey: ['entities', entity.id] });
        
        // 5. Dashboard summary cache (rollback affects overall metrics)
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
        
        // 6. Team data caches (rollback may affect team-level aggregations)
        queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
        
        console.log(`Cache invalidated after rollback for entity ${entity.name} (${entity.type}) to version ${selectedRollbackVersion}`);
        
        // Close the confirmation dialog
        setRollbackConfirmOpen(false);
        setSelectedRollbackVersion(null);
      } else {
        throw new Error('Failed to rollback entity');
      }
    } catch (error) {
      console.error('Error rolling back entity:', error);
      toast({
        title: 'Error',
        description: 'Failed to rollback entity. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleRollbackCancel = () => {
    setRollbackConfirmOpen(false);
    setSelectedRollbackVersion(null);
  };
  
  // Fetch owner and SLA settings (combined API call)
  const { data: ownerSlaSettings, isLoading: ownerSlaLoading } = useQuery({
    queryKey: ['ownerSlaSettings', entity?.type, teamName, entity?.name],
    queryFn: async () => {
      if (!entity || !teamName) return null;
      try {
        const response = await apiRequest('GET', endpoints.entity.ownerAndSlaSettings(entity.type, teamName, entity.name));
        return response.json();
      } catch (error) {
        console.warn('Owner/SLA settings API not available, using fallback data');
        // Fallback to mock data structure
        return {
          owner: entity.owner || 'Unknown Owner',
          ownerEmail: 'owner@company.com',
          userEmail: 'user@company.com',
          entityName: entity.name,
          team: teamName,
          description: entity.description || `${entity.type} entity for data processing`,
          schedule: entity.dag_schedule || entity.table_schedule || '0 2 * * *',
          expectedRuntime: entity.expected_runtime_minutes || 45,
          donemarkerLocation: entity.donemarker_location || `s3://analytics-${entity.type}s/${entity.name}/`,
          donemarkerLookback: entity.donemarker_lookback || 2,
          dependency: entity.dag_dependency || entity.table_dependency || 'upstream_dependencies',
          isActive: entity.is_active !== undefined ? entity.is_active : true,
          ...(entity.type === 'dag' && { serverName: 'airflow-prod-01' }),
        };
      }
    },
    enabled: open && !!entity && !!teamName,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Fetch SLA status history for last 30 days
  const { data: slaStatusData, isLoading: slaStatusLoading } = useQuery({
    queryKey: ['slaStatusHistory', entity?.type, teamName, entity?.name],
    queryFn: async () => {
      if (!entity || !teamName) return [];
      try {
        const response = await apiRequest('GET', endpoints.entity.slaStatusHistory(entity.type, teamName, entity.name));
        return response.json();
      } catch (error) {
        console.warn('SLA status history API not available, using demo data');
        return []; // SlaStatusChart will generate demo data
      }
    },
    enabled: open && !!entity && !!teamName,
    staleTime: 30 * 60 * 1000, // 30 minutes cache
  });

  // Fetch recent settings changes
  const { data: recentChanges, isLoading: recentChangesLoading } = useQuery({
    queryKey: ['recentSettingsChanges', entity?.type, teamName, entity?.name],
    queryFn: async () => {
      if (!entity || !teamName) return [];
      try {
        const response = await apiRequest('GET', endpoints.entity.recentSettingsChanges(entity.type, teamName, entity.name));
        return response.json();
      } catch (error) {
        console.warn('Recent settings changes API not available, using fallback data');
        // Fallback to mock recent changes
        return [
          {
            fieldChanged: 'Schedule',
            changedBy: 'john.smith@company.com',
            changedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
            oldValue: '0 1 * * *',
            newValue: '0 2 * * *',
            description: 'Updated schedule from 1 AM to 2 AM daily'
          },
          {
            fieldChanged: 'Expected Runtime',
            changedBy: 'sarah.jones@company.com',
            changedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
            oldValue: '30 minutes',
            newValue: '45 minutes',
            description: 'Increased expected runtime due to data volume growth'
          },
          {
            fieldChanged: 'Owner Email',
            changedBy: 'admin@company.com',
            changedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            oldValue: 'old.owner@company.com',
            newValue: entity.owner || 'new.owner@company.com',
            description: 'Owner transferred due to team restructure'
          }
        ];
      }
    },
    enabled: open && !!entity && !!teamName,
    staleTime: 10 * 60 * 1000, // 10 minutes cache
  });
  
  // Early return after all hooks have been called
  if (!entity) return null;
  
  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return format(date, 'MMM d, yyyy • h:mm a');
  };
  
  const handleDelete = () => {
    setOpenDeleteDialog(true);
  };
  
  const handleConfirmDelete = async () => {
    try {
      await apiRequest("DELETE", buildUrl(endpoints.entity.delete(entity.id)));
      
      toast({
        title: 'Success',
        description: `${entity.name} has been deleted.`,
        variant: 'default',
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      
      setOpenDeleteDialog(false);
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to delete: ${error}`,
        variant: 'destructive',
      });
    }
  };
  
  // Get user initials for avatar
  const getUserInitials = () => {
    if (!entity.owner) return '?';
    
    const names = entity.owner.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return names[0].substring(0, 2).toUpperCase();
  };
  
  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
            Entity Details
          </Typography>
          <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ p: 3 }}>
          {/* Entity header */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              bgcolor: 'primary.light',
              color: 'primary.contrastText',
              borderLeft: 4,
              borderColor: 'primary.main',
              borderRadius: 1,
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="h6" fontWeight={600}>
                  {entity.name}
                </Typography>
                <Typography variant="body2">
                  {teamName}
                </Typography>
              </Box>
              <Chip
                label={entity.status ? entity.status.charAt(0).toUpperCase() + entity.status.slice(1) : 'Unknown'}
                color={getStatusColor(entity.status || 'unknown') as "success" | "warning" | "error" | "default"}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>
          </Paper>
          
          {/* Key metrics */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Current SLA
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {entity.currentSla?.toFixed(1) || 'N/A'}%
                </Typography>
              </Paper>
            </Grid>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Last Refreshed
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {formatDate(entity.lastRefreshed)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Type
                </Typography>
                <Typography variant="h6" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
                  {entity.type}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    Owner
                  </Typography>
                  {!ownerSlaLoading && !isEditingOwner && (
                    <IconButton
                      size="small"
                      onClick={startEditingOwner}
                      sx={{ ml: 1, width: 20, height: 20 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                
                {ownerSlaLoading ? (
                  <Box display="flex" alignItems="center" mt={1}>
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Loading...
                    </Typography>
                  </Box>
                ) : isEditingOwner ? (
                  <Box sx={{ mt: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      value={ownerEmailInput}
                      onChange={(e) => setOwnerEmailInput(e.target.value)}
                      placeholder="Enter comma-separated emails"
                      disabled={isUpdatingOwner}
                      helperText="Enter owner emails separated by commas"
                      sx={{ mb: 1 }}
                    />
                    <Box display="flex" gap={1}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={updateOwner}
                        disabled={isUpdatingOwner || !ownerEmailInput.trim()}
                        startIcon={isUpdatingOwner ? <CircularProgress size={14} /> : <SaveIcon />}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        {isUpdatingOwner ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={cancelEditingOwner}
                        disabled={isUpdatingOwner}
                        startIcon={<CancelIcon />}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        Cancel
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Box display="flex" alignItems="center" mt={1}>
                    <Avatar sx={{ width: 24, height: 24, mr: 1, fontSize: '0.75rem' }}>
                      {ownerSlaSettings?.owner ? 
                        ownerSlaSettings.owner.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) :
                        getUserInitials()
                      }
                    </Avatar>
                    <Typography variant="body2">
                      {ownerSlaSettings?.owner || entity.owner || 'Unassigned'}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>
          
          {/* Performance Chart */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Performance Trend (Last 30 Days)
            </Typography>
            <Box sx={{ height: 300 }}>
              <EntityPerformanceChart entities={[entity]} />
            </Box>
          </Paper>

          {/* SLA Status History Chart */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <AnalyticsIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                SLA Status History (Last 30 Days)
              </Typography>
            </Box>
            {slaStatusLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress size={32} />
              </Box>
            ) : (
              <Box sx={{ height: 250 }}>
                <SlaStatusChart data={slaStatusData || []} />
              </Box>
            )}
          </Paper>

          {/* Current Settings */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <SettingsIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                Current {entity.type === 'dag' ? 'DAG' : 'Table'} SLA Settings
              </Typography>
            </Box>
            {ownerSlaLoading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={24} />
              </Box>
            ) : ownerSlaSettings ? (
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, width: '25%' }}>Entity Name</TableCell>
                      <TableCell>{ownerSlaSettings.entityName || entity.name}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Team</TableCell>
                      <TableCell>{ownerSlaSettings.team || teamName}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Owner</TableCell>
                      <TableCell>{ownerSlaSettings.owner || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Owner Email</TableCell>
                      <TableCell>{ownerSlaSettings.ownerEmail || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>User Email</TableCell>
                      <TableCell>{ownerSlaSettings.userEmail || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                      <TableCell>{ownerSlaSettings.description || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Schedule</TableCell>
                      <TableCell>{ownerSlaSettings.schedule || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Expected Runtime (mins)</TableCell>
                      <TableCell>{ownerSlaSettings.expectedRuntime || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Donemarker Location</TableCell>
                      <TableCell>{ownerSlaSettings.donemarkerLocation || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Donemarker Lookback (hrs)</TableCell>
                      <TableCell>{ownerSlaSettings.donemarkerLookback || 'N/A'}</TableCell>
                    </TableRow>
                    {entity.type === 'dag' && (
                      <>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>DAG Dependency</TableCell>
                          <TableCell>{ownerSlaSettings.dependency || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Server Name</TableCell>
                          <TableCell>{ownerSlaSettings.serverName || 'N/A'}</TableCell>
                        </TableRow>
                      </>
                    )}
                    {entity.type === 'table' && (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Table Dependency</TableCell>
                        <TableCell>{ownerSlaSettings.dependency || 'N/A'}</TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell>
                        <Chip 
                          label={ownerSlaSettings.isActive ? 'Active' : 'Inactive'}
                          color={ownerSlaSettings.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography color="text.secondary">Unable to load current settings</Typography>
            )}
          </Paper>

          {/* Recent Settings Changes */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <HistoryIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                Recent Settings Changes (Last 5)
              </Typography>
            </Box>
            {recentChangesLoading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={24} />
              </Box>
            ) : recentChanges && recentChanges.length > 0 ? (
              <List dense>
                {recentChanges.slice(0, 5).map((change: any, index: number) => (
                  <ListItem key={index} divider={index < 4}>
                    <ListItemIcon>
                      <PersonIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {change.actionType || change.fieldChanged || 'Settings Updated'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {change.user || change.changedBy || 'System'} • {formatDate(new Date(change.timestamp || change.changedAt || change.date))}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="body2" color="text.secondary">
                          {change.actionType === 'UPDATE' && change.diff ? 
                            Object.entries(change.diff).map(([field, values]: [string, any]) => 
                              `${field}: "${values.before}" → "${values.after}"`
                            ).join(', ') :
                            change.oldValue && change.newValue ? 
                              `Changed from "${change.oldValue}" to "${change.newValue}"` :
                              change.description || 'Configuration updated'
                          }
                        </Typography>
                      }
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleRollbackClick(change.version || index + 1)}
                      disabled={isRollingBack}
                      data-testid={`button-rollback-version-${change.version || index + 1}`}
                      sx={{ ml: 1 }}
                    >
                      <RestoreIcon fontSize="small" />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary">No recent settings changes found</Typography>
            )}
          </Paper>
          
          

        </DialogContent>
      </Dialog>
      
      <ConfirmDialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Entity"
        content={`Are you sure you want to delete "${entity.name}"? This action cannot be undone.`}
      />
      
      <ConfirmDialog
        open={rollbackConfirmOpen}
        onClose={handleRollbackCancel}
        onConfirm={handleRollbackConfirm}
        title="Rollback Entity"
        content={`Are you sure you want to rollback to version ${selectedRollbackVersion}? Any history after this version will be permanently lost and this action cannot be undone.`}
        confirmText="Rollback"
        confirmColor="warning"
      />
    </>
  );
};

export default EntityDetailsModal;