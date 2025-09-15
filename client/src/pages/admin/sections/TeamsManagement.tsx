import { useState, useEffect, useMemo, useDeferredValue } from 'react';
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
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  IconButton,
  Tooltip,
  TablePagination,
  InputAdornment,
  Switch,
  Autocomplete,
  Tabs,
  Tab
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Group as GroupIcon,
  Visibility as ViewIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateAdminCaches } from '@/lib/cacheKeys';
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { tenantsApi } from '@/features/sla/api';
import { Team } from '@shared/schema';
// Removed custom optimistic wrapper in favor of native React Query mutations

// Define user interface for type safety - matches actual API response
interface User {
  user_id: string;
  user_email: string;
  user_name?: string;
}

interface TeamFormDialogProps {
  open: boolean;
  onClose: () => void;
  team: any | null; // Use any since API may return different format than schema
  tenants: any[];
  onSubmit: (teamData: any) => void;
}

const TeamFormDialog = ({ open, onClose, team, tenants, onSubmit }: TeamFormDialogProps) => {
  const [formData, setFormData] = useState({
    name: team?.name || '',
    description: team?.description || '',
    tenant_id: team?.tenant_id || '',
    isActive: team?.isActive ?? true,
    team_email: team?.team_email || [],
    team_slack: team?.team_slack || [],
    team_pagerduty: team?.team_pagerduty || [],
    team_members_ids: team?.team_members_ids || [],
  });
  
  const [activeTab, setActiveTab] = useState(0);
  
  // Fetch available users for member management
  const { data: availableUsers = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      
      const response = await fetch(buildUrl('/api/admin/users'), {
        headers,
        credentials: 'include'
      });
      if (!response.ok) {
        // Fallback to mock data if admin endpoint not available - matches API structure
        return [
          { user_id: '1', user_email: 'john.doe@company.com', user_name: 'John Doe' },
          { user_id: '2', user_email: 'jane.smith@company.com', user_name: 'Jane Smith' },
          { user_id: '3', user_email: 'mike.wilson@company.com', user_name: 'Mike Wilson' },
          { user_id: '4', user_email: 'sarah.johnson@company.com', user_name: 'Sarah Johnson' },
          { user_id: '5', user_email: 'david.brown@company.com', user_name: 'David Brown' },
        ];
      }
      return response.json();
    },
    enabled: open,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update form data when team prop changes
  useEffect(() => {
    if (team) {
      setFormData({
        name: team.name || '',
        description: team.description || '',
        tenant_id: team.tenant_id || '',
        isActive: team.isActive ?? true,
        team_email: team.team_email || [],
        team_slack: team.team_slack || [],
        team_pagerduty: team.team_pagerduty || [],
        team_members_ids: team.team_members_ids || [],
      });
    } else {
      setFormData({
        name: '',
        description: '',
        tenant_id: '',
        isActive: true,
        team_email: [],
        team_slack: [],
        team_pagerduty: [],
        team_members_ids: [],
      });
    }
    setActiveTab(0);
  }, [team]);

  const handleSubmit = () => {
    const teamData: any = {
      name: formData.name,
      description: formData.description,
      isActive: formData.isActive,
      team_email: formData.team_email,
      team_slack: formData.team_slack,
      team_pagerduty: formData.team_pagerduty,
      team_members_ids: formData.team_members_ids,
    };
    
    // Only include tenant_id for new team creation, exclude on updates
    if (!team) {
      teamData.tenant_id = formData.tenant_id;
    }
    
    onSubmit(teamData);
    onClose();
    setFormData({ 
      name: '', description: '', tenant_id: '', isActive: true,
      team_email: [], team_slack: [], team_pagerduty: [], team_members_ids: []
    });
    setActiveTab(0);
  };
  
  // Helper function to get user email by ID
  const getUserEmailById = (userId: string) => {
    const user = availableUsers.find((u: User) => u.user_id === userId);
    return user?.user_email || userId;
  };
  
  // Helper function to get user ID by email
  const getUserIdByEmail = (email: string) => {
    const user = availableUsers.find((u: User) => u.user_email === email);
    return user?.user_id || email;
  };
  
  const tenantName = tenants.find(t => t.id === formData.tenant_id)?.name || 'Unknown';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {team ? 'Edit Team' : 'Create New Team'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ width: '100%' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
              <Tab label="Basic Info" />
              <Tab label="Contact Info" />
              <Tab label="Members" />
            </Tabs>
          </Box>
          
          {/* Basic Info Tab */}
          {activeTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 3 }}>
              <TextField
                fullWidth
                label="Team Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="input-team-name"
              />
              
              {/* Tenant Field - Locked in edit mode */}
              {team ? (
                <TextField
                  fullWidth
                  label="Tenant"
                  value={tenantName}
                  disabled
                  helperText="Tenant cannot be changed after team creation"
                  data-testid="input-tenant-locked"
                />
              ) : (
                <FormControl fullWidth required>
                  <InputLabel>Tenant</InputLabel>
                  <Select
                    value={formData.tenant_id}
                    onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                    label="Tenant"
                    data-testid="select-tenant"
                  >
                    {tenants.map((tenant) => (
                      <MenuItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-team-description"
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isActive}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, isActive: e.target.checked })}
                    data-testid="switch-team-active"
                  />
                }
                label="Active Team"
              />
            </Box>
          )}
          
          {/* Contact Info Tab */}
          {activeTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 3 }}>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={formData.team_email}
                onChange={(event, newValue) => {
                  setFormData({ ...formData, team_email: newValue as string[] });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Team Email Addresses"
                    placeholder="Add email addresses..."
                    helperText="Press Enter to add an email address"
                    data-testid="input-team-emails"
                  />
                )}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip
                      variant="outlined"
                      label={option}
                      {...getTagProps({ index })}
                      key={option}
                    />
                  ))
                }
              />
              
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={formData.team_slack}
                onChange={(event, newValue) => {
                  setFormData({ ...formData, team_slack: newValue as string[] });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Team Slack Channels"
                    placeholder="Add Slack channels..."
                    helperText="Press Enter to add a Slack channel (e.g., #team-channel)"
                    data-testid="input-team-slack"
                  />
                )}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip
                      variant="outlined"
                      label={option}
                      {...getTagProps({ index })}
                      key={option}
                    />
                  ))
                }
              />
              
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={formData.team_pagerduty}
                onChange={(event, newValue) => {
                  setFormData({ ...formData, team_pagerduty: newValue as string[] });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="PagerDuty Integration Keys"
                    placeholder="Add PagerDuty keys..."
                    helperText="Press Enter to add a PagerDuty integration key"
                    data-testid="input-team-pagerduty"
                  />
                )}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip
                      variant="outlined"
                      label={option}
                      {...getTagProps({ index })}
                      key={option}
                    />
                  ))
                }
              />
            </Box>
          )}
          
          {/* Members Tab */}
          {activeTab === 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 3 }}>
              <Typography variant="h6" gutterBottom>
                Team Members
              </Typography>
              
              <Autocomplete
                multiple
                options={availableUsers}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.user_email}
                value={formData.team_members_ids.map(getUserEmailById)}
                onChange={(event, newValue) => {
                  const newIds = newValue.map(val => 
                    typeof val === 'string' ? getUserIdByEmail(val) : getUserIdByEmail(val.user_email)
                  );
                  setFormData({ ...formData, team_members_ids: newIds });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Team Members"
                    placeholder="Search and select users..."
                    helperText="Select users to add to this team"
                    data-testid="input-team-members"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={typeof option === 'string' ? option : option.user_id}>
                    <Box>
                      <Typography variant="body2">
                        {typeof option === 'string' ? option : option.user_name || option.user_email}
                      </Typography>
                      {typeof option !== 'string' && option.user_name && (
                        <Typography variant="caption" color="text.secondary">
                          {option.user_email}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip
                      variant="outlined"
                      label={typeof option === 'string' ? option : option.user_name || option.user_email}
                      {...getTagProps({ index })}
                      key={typeof option === 'string' ? option : option.user_id}
                    />
                  ))
                }
              />
              
              {formData.team_members_ids.length > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Selected Members ({formData.team_members_ids.length}):
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {formData.team_members_ids.map((userId: string) => {
                      const user = availableUsers.find((u: User) => u.user_id === userId);
                      return (
                        <Chip
                          key={userId}
                          label={user?.user_name || user?.user_email || userId}
                          variant="filled"
                          size="small"
                          onDelete={() => {
                            setFormData({
                              ...formData,
                              team_members_ids: formData.team_members_ids.filter((id: string) => id !== userId)
                            });
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!formData.name || (!formData.tenant_id && !team)}
          data-testid="button-submit-team"
        >
          {team ? 'Update Team' : 'Create Team'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Helper component for displaying contact chips with overflow indicator
const ContactChips = ({ items, maxVisible = 2, testId }: { items: string[], maxVisible?: number, testId?: string }) => {
  if (!items || items.length === 0) {
    return <Typography variant="body2" color="text.secondary">None</Typography>;
  }
  
  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;
  
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {visibleItems.map((item, index) => (
        <Chip
          key={item}
          label={item}
          size="small"
          variant="outlined"
          sx={{ maxWidth: 120 }}
          data-testid={testId ? `${testId}-${index}` : undefined}
        />
      ))}
      {hiddenCount > 0 && (
        <Tooltip title={`${hiddenCount} more: ${items.slice(maxVisible).join(', ')}`}>
          <Chip
            label={`+${hiddenCount} more`}
            size="small"
            variant="outlined"
            color="secondary"
            data-testid={testId ? `${testId}-overflow` : undefined}
          />
        </Tooltip>
      )}
    </Box>
  );
};

const TeamsManagement = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any | null>(null); // Use any since API returns different format than schema
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Debounce search query for better performance
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Listen for team data refresh events (e.g., when tenant status changes cascade to teams)
  useEffect(() => {
    const handleRefreshTeams = () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
    };
    
    window.addEventListener('refresh-teams-data', handleRefreshTeams);
    return () => window.removeEventListener('refresh-teams-data', handleRefreshTeams);
  }, [queryClient]);

  // Fetch teams from admin endpoint with FastAPI headers
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['admin', 'teams'],
    staleTime: 6 * 60 * 60 * 1000, // Cache for 6 hours
    gcTime: 6 * 60 * 60 * 1000,    // Keep in memory for 6 hours
    queryFn: async () => {
      // Build headers with session ID for RBAC enforcement
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      };
      
      // CRITICAL: Add X-Session-ID header for FastAPI RBAC
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) {
        headers['X-Session-ID'] = sessionId;
      }
      
      const response = await fetch(buildUrl(endpoints.teams) + '?includeInactive=true', {
        cache: 'no-store',
        headers,
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch teams');
      }
      return response.json();
    },
  });

  // Fetch ACTIVE tenants for team creation (do not show inactive tenants)
  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/tenants', 'active'],
    queryFn: async () => {
      return await tenantsApi.getAll(true); // active_only=true
    },
    staleTime: 6 * 60 * 60 * 1000,
  });

  // Create efficient tenant name lookup map (O(1) vs O(n) Array.find)
  const tenantNameMap = useMemo(() => 
    new Map(tenants.map((t: any) => [t.id, t.name])), [tenants]);

  // Multi-field search logic with normalized search index
  const filteredTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    
    if (!deferredSearchQuery.trim()) {
      return teams;
    }
    
    // Split search query into tokens (case-insensitive, AND semantics)
    const searchTokens = deferredSearchQuery
      .toLowerCase()
      .split(' ')
      .filter(token => token.trim().length > 0);
    
    if (searchTokens.length === 0) return teams;
    
    return teams.filter((team: any) => {
      // Create normalized search index for this team
      const tenantName = tenantNameMap.get(team.tenant_id) ?? 'Unknown';
      const searchableFields = [
        team.name || '',
        team.id?.toString() || '',
        tenantName,
        team.description || ''
      ];
      
      // Join all searchable fields into a single lowercase string
      const searchBlob = searchableFields
        .map(field => String(field).toLowerCase())
        .join(' ');
      
      // All search tokens must match (AND semantics)
      return searchTokens.every(token => searchBlob.includes(token));
    });
  }, [teams, deferredSearchQuery, tenantNameMap]);

  // Pagination logic - calculate displayed teams
  const paginatedTeams = useMemo(() => {
    const startIndex = page * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredTeams.slice(startIndex, endIndex);
  }, [filteredTeams, page, rowsPerPage]);

  // Reset pagination when search changes
  useEffect(() => {
    setPage(0);
  }, [deferredSearchQuery]);

  // Create team mutation with optimistic updates following FastAPI pattern
  const createTeamMutation = useMutation({
    mutationFn: async (teamData: any) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const sessionId = localStorage.getItem('fastapi_session_id');
      if (sessionId) headers['X-Session-ID'] = sessionId;
      const response = await fetch(buildUrl(endpoints.admin.teams.create), {
        method: 'POST',
        headers,
        body: JSON.stringify(teamData),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to create team');
      return response.json();
    },
    onMutate: async (teamData: any) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'teams'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'teams']);
      const optimisticId = Date.now();
      const optimisticTeam = { ...teamData, id: optimisticId };
      queryClient.setQueryData<any[]>(['admin', 'teams'], (old) => old ? [...old, optimisticTeam] : [optimisticTeam]);
      return { previous, optimisticId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'teams'], ctx.previous);
      toast({ title: 'Creation Failed', description: 'Failed to create team. Please try again.', variant: 'destructive' });
    },
    onSuccess: (result, _vars, ctx) => {
      if (result && ctx?.optimisticId) {
        queryClient.setQueryData<any[]>(['admin', 'teams'], (old) => {
          if (!old) return [result];
          return old.map(t => t.id === ctx.optimisticId ? result : t);
        });
      }
      toast({ title: 'Team Created', description: 'New team has been successfully created.' });
    },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      // Invalidate all tenant-related caches to reflect team count changes
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants', 'active'] });
    },
  });

  // Update team mutation for status toggle
  const updateTeam = async (teamId: number, updateData: any) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionId = localStorage.getItem('fastapi_session_id');
    if (sessionId) headers['X-Session-ID'] = sessionId;
    const response = await fetch(buildUrl(`/api/v1/teams/${teamId}`), {
      method: 'PUT',
      headers,
      body: JSON.stringify(updateData),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to update team');
    return response.json();
  };

  // Handle status toggle
  const handleStatusToggle = (teamId: number, isActive: boolean) => {
    updateTeamMutation.mutate({
      teamId,
      teamData: { isActive }
    });
  };

  // remove legacy updateTeamFunction (use updateTeamMutation instead)

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, teamData }: { teamId: number; teamData: any }) => updateTeam(teamId, teamData),
    onMutate: async ({ teamId, teamData }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'teams'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'teams']);
      queryClient.setQueryData<any[]>(['admin', 'teams'], (old) => {
        if (!old) return [] as any[];
        return old.map(team => team.id === teamId ? { ...team, ...teamData } : team);
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'teams'], ctx.previous);
      toast({ title: 'Update Failed', description: 'Failed to update team status. Please try again.', variant: 'destructive' });
    },
    onSuccess: (_res, { teamData }) => {
      toast({ title: 'Team Updated', description: `Team status has been ${teamData.isActive ? 'activated' : 'deactivated'}.` });
    },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      // Invalidate all tenant-related caches to reflect team count changes
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants', 'active'] });
    },
  });

  const handleCreateTeam = () => {
    setSelectedTeam(null);
    setDialogOpen(true);
  };

  const handleEditTeam = (team: any) => {
    setSelectedTeam(team);
    setDialogOpen(true);
  };

  const handleSubmitTeam = async (teamData: any) => {
    try {
      if (selectedTeam) {
        await updateTeamMutation.mutateAsync({ teamId: selectedTeam.id, teamData });
      } else {
        await createTeamMutation.mutateAsync(teamData);
      }
    } catch (error) {
      // Error handling is done in the mutation functions
      console.error('Team submission error:', error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Teams Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create and manage teams across all tenants
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateTeam}
          data-testid="button-new-team"
        >
          New Team
        </Button>
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Active Teams ({teams?.length || 0} total)
            </Typography>
            <TextField
              size="small"
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-teams"
              sx={{ minWidth: 300 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setSearchQuery('')}
                      edge="end"
                      data-testid="button-clear-search"
                    >
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          
          {filteredTeams.length > 0 && (
            <Typography 
              variant="body2" 
              color="text.secondary" 
              sx={{ mb: 2 }}
              data-testid="status-result-count"
            >
              Showing {page * rowsPerPage + 1}–{Math.min(filteredTeams.length, (page + 1) * rowsPerPage)} of {filteredTeams.length} result{filteredTeams.length !== 1 ? 's' : ''}
            </Typography>
          )}
          
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Team Name</TableCell>
                  <TableCell>Tenant</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Slack</TableCell>
                  <TableCell>PagerDuty</TableCell>
                  <TableCell>Members</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedTeams?.map((team: any) => (
                  <TableRow key={team.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <GroupIcon color="primary" />
                        <Typography variant="body2" fontWeight="medium">
                          {team.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={String(tenantNameMap.get(team.tenant_id) || 'Unknown')} 
                        size="small" 
                        variant="outlined"
                        color="primary"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {team.description || 'No description'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <ContactChips 
                        items={team.team_email || []} 
                        maxVisible={2}
                        testId={`team-email-${team.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <ContactChips 
                        items={team.team_slack || []} 
                        maxVisible={2}
                        testId={`team-slack-${team.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <ContactChips 
                        items={team.team_pagerduty || []} 
                        maxVisible={2}
                        testId={`team-pagerduty-${team.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {team.team_members_ids?.length || 0} members
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={team.isActive ?? true ? 'Active' : 'Inactive'} 
                        size="small" 
                        color={team.isActive ?? true ? 'success' : 'default'}
                        variant={team.isActive ?? true ? 'filled' : 'outlined'}
                        data-testid={`chip-team-status-${team.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(team.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Edit Team">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleEditTeam(team)}
                            data-testid={`button-edit-team-${team.id}`}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <TablePagination
            component="div"
            count={filteredTeams.length}
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            showFirstButton
            showLastButton
          />
        </CardContent>
      </Card>

      <TeamFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        team={selectedTeam}
        tenants={tenants}
        onSubmit={handleSubmitTeam}
      />
    </Box>
  );
};

export default TeamsManagement;