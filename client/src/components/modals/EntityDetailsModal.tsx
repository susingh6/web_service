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
} from '@mui/icons-material';
import { format } from 'date-fns';
import { Entity, Issue } from '@shared/schema';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();
  
  // Find team name - do this before early return to avoid hooks order issues
  const teamName = entity ? teams.find(team => team.id === entity.teamId)?.name || 'Unknown Team' : '';
  
  // Fetch current entity settings using separate endpoints for DAG and Table
  const { data: currentSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['currentSettings', teamName, entity?.name, entity?.type],
    queryFn: async () => {
      if (!entity || !teamName) return null;
      
      let settingsEndpoint;
      if (entity.type === 'dag') {
        settingsEndpoint = endpoints.entity.currentDagSettings(teamName, entity.name);
      } else {
        settingsEndpoint = endpoints.entity.currentTableSettings(teamName, entity.name);
      }
      
      const response = await apiRequest('GET', buildUrl(settingsEndpoint));
      return response.json();
    },
    enabled: open && !!entity && !!teamName,
  });

  // Fetch entity history changes using centralized API
  const { data: historyChanges, isLoading: historyLoading } = useQuery({
    queryKey: ['historyChanges', entity?.id],
    queryFn: async () => {
      if (!entity) return [];
      const response = await apiRequest('GET', buildUrl(endpoints.entity.historyChanges(entity.id)));
      return response.json();
    },
    enabled: open && !!entity,
  });

  // Fetch entity issues using centralized API
  const { data: issues = [], isLoading: issuesLoading } = useQuery({
    queryKey: ['entityIssues', entity?.id],
    queryFn: async () => {
      if (!entity) return [];
      const response = await apiRequest('GET', buildUrl(endpoints.entity.issues(entity.id)));
      return response.json();
    },
    enabled: open && !!entity,
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
                <Typography variant="caption" color="text.secondary">
                  Owner
                </Typography>
                <Box display="flex" alignItems="center" mt={1}>
                  <Avatar sx={{ width: 24, height: 24, mr: 1, fontSize: '0.75rem' }}>
                    {getUserInitials()}
                  </Avatar>
                  <Typography variant="body2">
                    {entity.owner || 'Unassigned'}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
          
          {/* Performance Chart */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Performance Trend
            </Typography>
            <Box sx={{ height: 300 }}>
              <EntityPerformanceChart entities={[entity]} />
            </Box>
          </Paper>

          {/* Current Settings */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <SettingsIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                Current {entity.type === 'dag' ? 'DAG' : 'Table'} SLA Settings
              </Typography>
            </Box>
            {settingsLoading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={24} />
              </Box>
            ) : currentSettings ? (
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, width: '25%' }}>Entity Name</TableCell>
                      <TableCell>{currentSettings.name || entity.name}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Team</TableCell>
                      <TableCell>{currentSettings.team || teamName}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Owner Email</TableCell>
                      <TableCell>{currentSettings.ownerEmail || entity.owner || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>User Email</TableCell>
                      <TableCell>{currentSettings.userEmail || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                      <TableCell>{currentSettings.description || entity.description || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Schedule</TableCell>
                      <TableCell>{currentSettings.schedule || entity.dag_schedule || entity.table_schedule || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Expected Runtime (mins)</TableCell>
                      <TableCell>{currentSettings.expectedRuntime || entity.expected_runtime_minutes || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Donemarker Location</TableCell>
                      <TableCell>{currentSettings.donemarkerLocation || entity.donemarker_location || 'N/A'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Donemarker Lookback (hrs)</TableCell>
                      <TableCell>{currentSettings.donemarkerLookback || entity.donemarker_lookback || 'N/A'}</TableCell>
                    </TableRow>
                    {entity.type === 'dag' && (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>DAG Dependency</TableCell>
                        <TableCell>{currentSettings.dagDependency || entity.dag_dependency || 'N/A'}</TableCell>
                      </TableRow>
                    )}
                    {entity.type === 'table' && (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Table Dependency</TableCell>
                        <TableCell>{currentSettings.tableDependency || entity.table_dependency || 'N/A'}</TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell>
                        <Chip 
                          label={currentSettings.isActive !== undefined ? (currentSettings.isActive ? 'Active' : 'Inactive') : (entity.status || 'Unknown')}
                          color={currentSettings.isActive ? 'success' : 'default'}
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

          {/* History Changes */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <HistoryIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                Recent Changes (Last 5)
              </Typography>
            </Box>
            {historyLoading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={24} />
              </Box>
            ) : historyChanges && historyChanges.length > 0 ? (
              <List dense>
                {historyChanges.slice(0, 5).map((change: any, index: number) => (
                  <ListItem key={index} divider={index < 4}>
                    <ListItemIcon>
                      <PersonIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {change.fieldChanged || 'Settings Updated'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {change.changedBy || 'System'} • {formatDate(new Date(change.changedAt || change.date))}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="body2" color="text.secondary">
                          {change.oldValue && change.newValue ? 
                            `Changed from "${change.oldValue}" to "${change.newValue}"` :
                            change.description || 'Configuration updated'
                          }
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary">No recent changes found</Typography>
            )}
          </Paper>
          
          {/* Issues */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Recent Issues
            </Typography>
            {issues.length > 0 ? (
              <List dense>
                {issues.map((issue: any) => (
                  <ListItem key={issue.id} divider>
                    <ListItemIcon>
                      {issue.severity === 'high' ? (
                        <ErrorIcon color="error" />
                      ) : (
                        <WarningIcon color="warning" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={issue.description}
                      secondary={`${issue.type} • ${formatDate(issue.date)}`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" align="center">
                No recent issues
              </Typography>
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
    </>
  );
};

export default EntityDetailsModal;