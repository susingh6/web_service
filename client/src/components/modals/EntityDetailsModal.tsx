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
  Autocomplete,
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
  Notifications as NotificationsIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { Entity, Issue } from '@shared/schema';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import SlaStatusChart from '@/components/charts/SlaStatusChart';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { buildUrl, endpoints, config } from '@/config';
import { useQuery } from '@tanstack/react-query';
import { cacheKeys, invalidateEntityCaches } from '@/lib/cacheKeys';
import { useEntityMutation } from '@/utils/cache-management';
import { entitiesApi } from '@/features/sla/api';
import { NotificationTimelinesList } from '@/components/subscriptions/NotificationTimelinesList';

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
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedOwnerEmails, setSelectedOwnerEmails] = useState<string[]>([]);
  const [localOwnerEmails, setLocalOwnerEmails] = useState<string[] | null>(null);
  
  // Reset local owner emails when entity changes to prevent cross-entity contamination
  useEffect(() => {
    setLocalOwnerEmails(null);
  }, [entity?.id, entity?.name]);
  
  
  const { toast } = useToast();
  const { user } = useAuth();
  const { updateOwner: updateOwnerMutation, deleteEntity } = useEntityMutation();
  
  // Find team name - do this before early return to avoid hooks order issues
  const teamName = entity ? teams.find(team => team.id === entity.teamId)?.name || 'Unknown Team' : '';
  
  // Update owner functionality using modern cache-management approach
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
      const ownersArray = selectedOwnerEmails.length > 0
        ? selectedOwnerEmails
        : ownerEmailInput.split(',').map(e => e.trim()).filter(e => e.length > 0);

      const ownerData = {
        user_email: userEmail,
        team_name: teamName,
        tenant_name: entity.tenant_name || 'Data Engineering',
        owners: ownersArray,
        teamId: entity.teamId, // Add teamId for cache invalidation
      };
      
      // Use modern cache-management approach with automatic cache invalidation
      await updateOwnerMutation(entity.name, entity.type as 'table' | 'dag', ownerData);
      
      toast({
        title: 'Success',
        description: 'Owner updated successfully.',
        variant: 'default',
      });
      
      // Update local state for immediate UI feedback
      setLocalOwnerEmails(ownersArray);
      
      // Reset edit state
      setIsEditingOwner(false);
      setOwnerEmailInput('');
      setSelectedOwnerEmails([]);
    } catch (error) {
      console.error('Error updating owner:', error);
      toast({
        title: 'Error',
        description: `Failed to update owner: ${error}`,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingOwner(false);
    }
  };
  
  // Handle starting edit mode
  const startEditingOwner = async () => {
    // Try multiple possible field names for owner email
    const currentOwnerEmail = ownerSlaSettings?.ownerEmail || 
                             ownerSlaSettings?.owner_email || 
                             ownerSlaSettings?.email ||
                             'rachel.green@company.com'; // Fallback for demo
    console.log('Owner SLA Settings:', ownerSlaSettings);
    console.log('Setting owner email input to:', currentOwnerEmail);
    setOwnerEmailInput(currentOwnerEmail);
    const initial = (currentOwnerEmail || '')
      .split(',')
      .map((e: string) => e.trim())
      .filter((e: string) => e.length > 0);
    setSelectedOwnerEmails(initial);
    try {
      const headers: Record<string, string> = {};
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      const res = await fetch('/api/admin/users', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAvailableUsers(Array.isArray(data) ? data : []);
      } else {
        const fallback = await fetch('/api/v1/get_user', { headers, credentials: 'include' });
        const data = await fallback.json();
        setAvailableUsers(Array.isArray(data) ? data : []);
      }
    } catch (_err) {
      setAvailableUsers([]);
    }
    setIsEditingOwner(true);
  };
  
  // Handle canceling edit mode
  const cancelEditingOwner = () => {
    setIsEditingOwner(false);
    setOwnerEmailInput('');
  };

  
  // Fetch owner and SLA settings using type-specific endpoint
  const { data: ownerSlaSettings, isLoading: ownerSlaLoading, error: ownerSlaError } = useQuery({
    queryKey: cacheKeys.entityDetails(entity?.id ?? 'new', `ownerSlaSettings-${entity?.type}-${teamName}-${entity?.name}`),
    queryFn: async () => {
      if (!entity || !teamName) return null;
      
      // Use type-specific endpoint
      const endpoint = entity.type === 'table' 
        ? config.endpoints.tablesOwnerSlaSettings(teamName, entity.name)
        : config.endpoints.dagsOwnerSlaSettings(teamName, entity.name);
      
      try {
        const response = await apiRequest('GET', endpoint);
        return response.json();
      } catch (error: any) {
        console.error('[EntityDetailsModal] Failed to fetch owner SLA settings:', {
          type: entity.type,
          teamName,
          entityName: entity.name,
          endpoint,
          error: error.message
        });
        
        // Fallback to Express endpoint if FastAPI fails (dev only)
        if (config.endpoints.tablesOwnerSlaSettingsFallback && entity.type === 'table') {
          try {
            const fallbackEndpoint = config.endpoints.tablesOwnerSlaSettingsFallback(teamName, entity.name);
            const response = await apiRequest('GET', fallbackEndpoint);
            return response.json();
          } catch (fallbackError: any) {
            console.error('[EntityDetailsModal] Express fallback also failed:', fallbackError.message);
          }
        } else if (config.endpoints.dagsOwnerSlaSettingsFallback && entity.type === 'dag') {
          try {
            const fallbackEndpoint = config.endpoints.dagsOwnerSlaSettingsFallback(teamName, entity.name);
            const response = await apiRequest('GET', fallbackEndpoint);
            return response.json();
          } catch (fallbackError: any) {
            console.error('[EntityDetailsModal] Express fallback also failed:', fallbackError.message);
          }
        }
        
        throw error; // Re-throw to show error state
      }
    },
    enabled: open && !!entity && !!teamName,
    staleTime: 0, // Always fetch fresh data to get latest ownerIsActive status
    refetchOnMount: 'always',
  });

  // Fetch SLA status history for last 30 days
  const { data: slaStatusData, isLoading: slaStatusLoading } = useQuery({
    queryKey: cacheKeys.entityDetails(entity?.id ?? 'new', `slaStatusHistory-${entity?.type}-${teamName}-${entity?.name}`),
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
    queryKey: cacheKeys.entityDetails(entity?.id ?? 'new', `recentSettingsChanges-${entity?.type}-${teamName}-${entity?.name}`),
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
  
  // Fetch compliance trend data from 6-hour cache
  const { data: complianceTrendData, isLoading: complianceTrendLoading } = useQuery({
    queryKey: ['entity-compliance-trend', entity.type, entity.name, entity.team_name],
    queryFn: async () => {
      const teamQuery = entity.team_name ? `?teamName=${encodeURIComponent(entity.team_name)}` : '';
      const response = await fetch(`/api/entities/compliance-trend/${entity.type}/${encodeURIComponent(entity.name)}${teamQuery}`);
      if (!response.ok) throw new Error('Failed to fetch compliance trend');
      return response.json();
    },
    enabled: open && !!entity,
  });
  
  const handleDelete = () => {
    setOpenDeleteDialog(true);
  };
  
  const handleConfirmDelete = async () => {
    try {
      const entityType = entity.type as 'table' | 'dag';
      
      
      // Use modern cache-management approach with automatic cache invalidation
      await deleteEntity(entity.name, entityType, {
        tenantName: entity.tenant_name || undefined,
        teamId: entity.teamId ?? 1,
        teamName: entity.team_name || undefined
      });
      
      toast({
        title: 'Success',
        description: `${entityType === 'dag' ? 'DAG' : 'Table'} "${entity.name}" has been deleted.`,
        variant: 'default',
      });
      
      setOpenDeleteDialog(false);
      onClose();
      
    } catch (error) {
      
      
      toast({
        title: 'Error',
        description: `Failed to delete ${entity.type}: ${error}`,
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
  
  // Helpers to normalize owner emails (supports comma-separated)
  const normalizeOwnerEmails = (settings: any): string[] => {
    if (localOwnerEmails) return localOwnerEmails;
    const raw = settings?.ownerEmail || settings?.owner_email || entity.ownerEmail || entity.owner_email || '';
    if (!raw) return [];
    return String(raw)
      .split(',')
      .map((e: string) => e.trim())
      .filter((e: string) => e.length > 0);
  };
  
  // Check if an email belongs to an expired user
  // Uses ownerIsActive from ownerSlaSettings which is looked up server-side
  const isEmailExpired = (email: string): boolean => {
    if (!ownerSlaSettings) return false;
    
    // Check if this email matches the owner email and if owner is inactive
    const ownerEmail = ownerSlaSettings.ownerEmail || '';
    const isOwnerEmail = ownerEmail === email;
    const ownerIsActive = ownerSlaSettings.ownerIsActive !== undefined ? ownerSlaSettings.ownerIsActive : true;
    
    return isOwnerEmail && !ownerIsActive;
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
          <Typography component="span" variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
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
                    <Autocomplete
                      multiple
                      options={availableUsers
                        .filter((u: any) => u.is_active !== false) // Filter out inactive users
                        .map((u: any) => u.user_email || u.email)
                        .filter((e: string) => !!e)}
                      filterSelectedOptions
                      value={selectedOwnerEmails}
                      onChange={(_e, newValue) => setSelectedOwnerEmails(newValue as string[])}
                      renderInput={(params) => (
                    <TextField
                          {...params}
                      fullWidth
                      size="small"
                          placeholder="Select owner emails or type to add"
                      disabled={isUpdatingOwner}
                          helperText="Choose from users in the system"
                      sx={{ mb: 1 }}
                        />
                      )}
                    />
                    <Box display="flex" gap={1}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={updateOwner}
                        disabled={isUpdatingOwner || (selectedOwnerEmails.length === 0 && !ownerEmailInput.trim())}
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
                  <Box display="flex" alignItems="center" mt={1} gap={0.5} flexWrap="wrap">
                    {(() => {
                      const emails = normalizeOwnerEmails(ownerSlaSettings);
                      if (emails.length === 0) {
                        return (
                          <Typography variant="body2">{ownerSlaSettings?.owner || entity.owner || 'Unassigned'}</Typography>
                        );
                      }
                      return emails.map((email: string) => {
                        const isExpired = isEmailExpired(email);
                        return (
                          <Chip 
                            key={email} 
                            size="small" 
                            label={
                              <Box display="flex" alignItems="center" gap={0.5}>
                                <span style={{
                                  textDecoration: isExpired ? 'line-through' : 'none',
                                  fontWeight: isExpired ? 400 : 500,
                                }}>
                                  {email}
                                </span>
                                {isExpired && (
                                  <Box
                                    component="span"
                                    sx={{
                                      bgcolor: '#dc3545',
                                      color: 'white',
                                      borderRadius: '3px',
                                      px: 0.5,
                                      py: 0.1,
                                      fontSize: '0.55rem',
                                      fontWeight: 700,
                                      letterSpacing: '0.02em'
                                    }}
                                  >
                                    EXPIRED
                                  </Box>
                                )}
                              </Box>
                            }
                            variant={isExpired ? "outlined" : "outlined"}
                            sx={{
                              ...(isExpired && {
                                bgcolor: '#ffebee',
                                color: '#d32f2f',
                                borderColor: '#ef5350',
                                opacity: 0.85,
                              }),
                            }}
                          />
                        );
                      });
                    })()}
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>
          
          {/* Compliance Trend Chart */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Compliance Trend (Last 30 Days)
            </Typography>
            {complianceTrendLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress size={32} />
              </Box>
            ) : complianceTrendData?.trend ? (
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={complianceTrendData.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="dateFormatted" 
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      domain={[80, 100]} 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Compliance']}
                      labelStyle={{ color: '#666' }}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="compliance" 
                      stroke="#1976d2" 
                      strokeWidth={2}
                      dot={{ fill: '#1976d2', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    {/* Reference line for 95% target */}
                    <Line 
                      type="monotone" 
                      dataKey={() => 95} 
                      stroke="#d32f2f" 
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box display="flex" justifyContent="center" alignItems="center" py={4}>
                <Typography color="text.secondary">No compliance trend data available</Typography>
              </Box>
            )}
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
              <SlaStatusChart data={slaStatusData || []} />
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
                      <TableCell sx={{ fontWeight: 600 }}>Owner Emails</TableCell>
                      <TableCell>
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {(() => {
                            const emails = normalizeOwnerEmails(ownerSlaSettings);
                            return emails.length > 0 ? emails.map((email: string) => {
                              const isExpired = isEmailExpired(email);
                              return (
                                <Chip 
                                  key={email} 
                                  size="small" 
                                  label={
                                    <Box display="flex" alignItems="center" gap={0.5}>
                                      <span style={{
                                        textDecoration: isExpired ? 'line-through' : 'none',
                                        fontWeight: isExpired ? 400 : 500,
                                      }}>
                                        {email}
                                      </span>
                                      {isExpired && (
                                        <Box
                                          component="span"
                                          sx={{
                                            bgcolor: '#dc3545',
                                            color: 'white',
                                            borderRadius: '3px',
                                            px: 0.5,
                                            py: 0.1,
                                            fontSize: '0.55rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.02em'
                                          }}
                                        >
                                          EXPIRED
                                        </Box>
                                      )}
                                    </Box>
                                  }
                                  variant="outlined"
                                  sx={{
                                    ...(isExpired && {
                                      bgcolor: '#ffebee',
                                      color: '#d32f2f',
                                      borderColor: '#ef5350',
                                      opacity: 0.85,
                                    }),
                                  }}
                                />
                              );
                            }) : 'N/A';
                          })()}
                        </Box>
                      </TableCell>
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

          {/* Notification Timelines */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <NotificationsIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                Notification Timelines
              </Typography>
            </Box>
            <NotificationTimelinesList entity={entity} />
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
      
    </>
  );
};

export default EntityDetailsModal;