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
import { useAdminMutation } from '@/utils/cache-management';
import { cacheKeys, invalidateAdminCaches } from '@/lib/cacheKeys';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { buildUrl, endpoints } from '@/config';
import { tenantsApi } from '@/features/sla/api';
import { Team } from '@shared/schema';
// Removed custom optimistic wrapper in favor of native React Query mutations

// Define user interface for type safety - matches actual API response
interface User {
  user_id: string;
  user_email: string;
  user_name?: string;
  is_active?: boolean; // Added for filtering inactive users
}

interface TeamFormDialogProps {
  open: boolean;
  onClose: () => void;
  team: any | null; // Use any since API may return different format than schema
  tenants: any[]; // All tenants for name lookup
  activeTenants: any[]; // Only active tenants for dropdown
  onSubmit: (teamData: any) => void;
}

const TeamFormDialog = ({ open, onClose, team, tenants, activeTenants, onSubmit }: TeamFormDialogProps) => {
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
  
  // Helper function to get user email by user name
  const getUserEmailByName = (userName: string) => {
    const user = availableUsers.find((u: User) => u.user_name === userName);
    return user?.user_email || userName;
  };
  
  // Helper function to get user name by email
  const getUserNameByEmail = (email: string) => {
    const user = availableUsers.find((u: User) => u.user_email === email);
    return user?.user_name || email;
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
                    {activeTenants.map((tenant) => (
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
                options={availableUsers.filter((u: User) => u.is_active !== false && !formData.team_members_ids.includes(u.user_name || u.user_email))}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.user_email}
                isOptionEqualToValue={(option, value) =>
                  typeof value === 'string'
                    ? (option.user_email === value || option.user_name === value)
                    : option.user_id === value.user_id
                }
                filterSelectedOptions
                value={formData.team_members_ids.map(getUserEmailByName)}
                onChange={(event, newValue) => {
                  const newNames = newValue.map(val => 
                    typeof val === 'string' ? getUserNameByEmail(val) : getUserNameByEmail(val.user_email)
                  );
                  setFormData({ ...formData, team_members_ids: newNames });
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
                    {formData.team_members_ids.map((userName: string) => {
                      const user = availableUsers.find((u: User) => u.user_name === userName);
                      return (
                        <Chip
                          key={userName}
                          label={user?.user_name || user?.user_email || userName}
                          variant="filled"
                          size="small"
                          onDelete={() => {
                            setFormData({
                              ...formData,
                              team_members_ids: formData.team_members_ids.filter((name: string) => name !== userName)
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
  const { createTeam: createTeamAdmin, updateTeam: updateTeamAdmin } = useAdminMutation();
  
  // Debounce search query for better performance
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // WebSocket integration for real-time team member updates
  const sessionId = localStorage.getItem('fastapi_session_id');
  const { sendMessage } = useWebSocket({
    sessionId: sessionId || undefined,
    onTeamMembersUpdated: async (data) => {
      console.log('📡 Received team member update via WebSocket:', data);
      // Invalidate teams cache to refresh the table when team members change
      await queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      
      // Also invalidate related caches
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      
      // Show toast notification for the update
      if (data.type === 'member-added') {
        toast({ 
          title: 'Team Member Added', 
          description: `${data.memberName || 'Member'} has been added to team ${data.teamName}` 
        });
      } else if (data.type === 'member-removed') {
        toast({ 
          title: 'Team Member Removed', 
          description: `${data.memberName || 'Member'} has been removed from team ${data.teamName}` 
        });
      }
    },
    onConnect: () => {
      console.log('📡 WebSocket connected in TeamsManagement');
    },
    onDisconnect: () => {
      console.log('📡 WebSocket disconnected in TeamsManagement');
    }
  });

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

  // Fetch ALL tenants (including inactive) for proper name resolution
  const { data: allTenants = [] } = useQuery({
    queryKey: ['/api/tenants', 'all'],
    queryFn: async () => {
      return await tenantsApi.getAll(false); // active_only=false to get all tenants
    },
    staleTime: 6 * 60 * 60 * 1000,
  });

  // Extract only active tenants for team creation dropdown 
  const activeTenants = useMemo(() => 
    allTenants.filter((t: any) => t.isActive !== false), [allTenants]);

  // Create efficient tenant name lookup map using ALL tenants (O(1) vs O(n) Array.find)
  const tenantNameMap = useMemo(() => 
    new Map(allTenants.map((t: any) => [t.id, t.name])), [allTenants]);

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

  // Modern cache-managed team creation
  const handleCreateTeamModern = async (teamData: any) => {
    try {
      await createTeamAdmin(teamData);
      toast({ title: 'Team Created', description: 'New team has been successfully created.' });
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: 'Creation Failed', description: 'Failed to create team. Please try again.', variant: 'destructive' });
    }
  };

  // Enhanced update team function with detailed error handling and fallback endpoints
  const updateTeam = async (teamId: number, updateData: any) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sessionId = localStorage.getItem('fastapi_session_id');
    if (sessionId) headers['X-Session-ID'] = sessionId;
    
    console.log('🚀 Updating team:', { teamId, updateData, headers: { ...headers, 'X-Session-ID': sessionId ? '[REDACTED]' : 'none' } });
    
    // Try FastAPI endpoint first
    let response = await fetch(buildUrl(`/api/v1/teams/${teamId}`), {
      method: 'PUT',
      headers,
      body: JSON.stringify(updateData),
      credentials: 'include',
    });
    
    console.log('📡 FastAPI response status:', response.status, response.statusText);
    
    // If FastAPI fails, try Express endpoint as fallback
    if (!response.ok && response.status !== 404) {
      console.log('⚠️ FastAPI failed, trying Express endpoint fallback...');
      response = await fetch(buildUrl(`/api/teams/${teamId}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateData),
        credentials: 'include',
      });
      console.log('📡 Express fallback response status:', response.status, response.statusText);
    }
    
    // Enhanced error handling with detailed response parsing
    if (!response.ok) {
      let errorDetails: any;
      try {
        const errorText = await response.text();
        console.error('❌ Full error response text:', errorText);
        
        // Try to parse as JSON, fallback to plain text
        try {
          errorDetails = JSON.parse(errorText);
          console.error('❌ Parsed error details:', errorDetails);
        } catch {
          errorDetails = { message: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
      } catch (parseError) {
        console.error('❌ Failed to parse error response:', parseError);
        errorDetails = { message: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      // Create detailed error object
      const detailedError = new Error(
        errorDetails.message || 
        errorDetails.detail || 
        `Failed to update team: HTTP ${response.status}`
      );
      (detailedError as any).status = response.status;
      (detailedError as any).details = errorDetails;
      (detailedError as any).endpoint = response.url;
      
      throw detailedError;
    }
    
    const result = await response.json();
    console.log('✅ Team update successful:', result);
    return result;
  };

  // Modern cache-managed team update
  const handleUpdateTeamModern = async (teamId: number, teamData: any) => {
    // Get original team data for comparison before update
    const originalTeam = teams?.find(team => team.id === teamId);
    
    try {
      await updateTeamAdmin(teamId, teamData);
      
      // Success message with context
      const successMessage = teamData.hasOwnProperty('team_members_ids') 
        ? 'Team and member assignments have been successfully updated.'
        : teamData.hasOwnProperty('isActive')
        ? `Team has been ${teamData.isActive ? 'activated' : 'deactivated'}.`
        : 'Team has been successfully updated.';
      
      toast({ 
        title: 'Team Updated', 
        description: successMessage 
      });

      // WebSocket broadcasting for team member changes
      if (teamData.hasOwnProperty('team_members_ids') && originalTeam) {
        const originalMembers = originalTeam.team_members_ids || [];
        const newMembers = teamData.team_members_ids || [];
        const teamName = originalTeam.name;
        const tenantName = tenantNameMap.get(originalTeam.tenant_id) || 'Unknown';
        
        // Detect member additions
        const addedMembers = newMembers.filter((memberId: string) => !originalMembers.includes(memberId));
        // Detect member removals  
        const removedMembers = originalMembers.filter((memberId: string) => !newMembers.includes(memberId));
        
        console.log('📡 Team member changes detected:', {
          teamName,
          tenantName,
          addedMembers,
          removedMembers,
          originalMembers,
          newMembers
        });
        
        // Dispatch window event to notify team dashboard of member changes
        try {
          window.dispatchEvent(new CustomEvent('admin-teams-updated', {
            detail: { teamId, teamName, tenantName, type: 'member-change' }
          }));
        } catch {}
        
        // Broadcast member additions
        addedMembers.forEach((memberId: string) => {
          const teamMemberEvent = {
            type: 'team-change',
            event: 'team-members-updated',
            data: {
              type: 'member-added',
              teamName,
              tenantName,
              memberId,
              memberName: memberId, // Use memberId as fallback since availableUsers is not in scope
              teamId,
              version: Date.now(),
              ts: Date.now(),
              updatedAt: new Date().toISOString(),
              originUserId: sessionId || 'admin'
            }
          };
          
          console.log('📡 Broadcasting member addition:', teamMemberEvent);
          if (typeof sendMessage === 'function') {
            sendMessage(teamMemberEvent);
          }
        });
        
        // Broadcast member removals
        removedMembers.forEach((memberId: string) => {
          const teamMemberEvent = {
            type: 'team-change',
            event: 'team-members-updated',
            data: {
              type: 'member-removed',
              teamName,
              tenantName,
              memberId,
              memberName: memberId, // Use memberId as fallback since availableUsers is not in scope
              teamId,
              version: Date.now(),
              ts: Date.now(),
              updatedAt: new Date().toISOString(),
              originUserId: sessionId || 'admin'
            }
          };
          
          console.log('📡 Broadcasting member removal:', teamMemberEvent);
          if (typeof sendMessage === 'function') {
            sendMessage(teamMemberEvent);
          }
        });

        // Invalidate relevant cache entries for real-time updates
        try {
          await queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
          await queryClient.refetchQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
        } catch (_err) {
          // Swallow errors; real-time WS or next navigation will recover
        }
      }
      
      setDialogOpen(false);
    } catch (error: any) {
      console.error('🔥 Team update error:', error);
      
      // Create specific error message based on error details
      let errorTitle = 'Update Failed';
      let errorMessage = 'Failed to update team. Please try again.';
      
      if (error.status === 400) {
        errorTitle = 'Invalid Team Data';
        errorMessage = error.details?.message || error.message || 'The team data provided is invalid. Please check all fields and try again.';
      } else if (error.status === 404) {
        errorTitle = 'Team Not Found';
        errorMessage = 'The team you are trying to update no longer exists.';
      } else if (error.status === 403) {
        errorTitle = 'Access Denied';
        errorMessage = 'You do not have permission to update this team.';
      } else if (error.status === 500) {
        errorTitle = 'Server Error';
        errorMessage = 'A server error occurred while updating the team. Please try again later.';
      } else if (error.message && error.message !== 'Failed to update team') {
        errorMessage = error.message;
      }
      
      toast({ 
        title: errorTitle, 
        description: errorMessage, 
        variant: 'destructive' 
      });
    }
  };

  // Handle status toggle
  const handleStatusToggle = async (teamId: number, isActive: boolean) => {
    await handleUpdateTeamModern(teamId, { isActive });
  };

  // remove legacy updateTeamFunction (use updateTeamMutation instead)

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, teamData }: { teamId: number; teamData: any }) => updateTeam(teamId, teamData),
    onMutate: async ({ teamId, teamData }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'teams'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'teams']);
      
      // Find the original team data for comparison later
      const originalTeam = previous?.find(team => team.id === teamId);
      
      queryClient.setQueryData<any[]>(['admin', 'teams'], (old) => {
        if (!old) return [] as any[];
        return old.map(team => team.id === teamId ? { ...team, ...teamData } : team);
      });
      return { previous, originalTeam };
    },
    onError: (error: any, { teamData }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'teams'], ctx.previous);
      
      console.error('🔥 Team update mutation error:', {
        message: error.message,
        status: error.status,
        details: error.details,
        endpoint: error.endpoint,
        teamData,
        fullError: error
      });
      
      // Create specific error message based on error details
      let errorMessage = 'Failed to update team. Please try again.';
      let errorTitle = 'Update Failed';
      
      if (error.status === 400) {
        errorTitle = 'Invalid Team Data';
        errorMessage = error.details?.message || error.message || 'The team data provided is invalid. Please check all fields and try again.';
      } else if (error.status === 404) {
        errorTitle = 'Team Not Found';
        errorMessage = 'The team you are trying to update no longer exists.';
      } else if (error.status === 403) {
        errorTitle = 'Access Denied';
        errorMessage = 'You do not have permission to update this team.';
      } else if (error.status === 500) {
        errorTitle = 'Server Error';
        errorMessage = 'A server error occurred while updating the team. Please try again later.';
      } else if (error.message && error.message !== 'Failed to update team') {
        errorMessage = error.message;
      }
      
      toast({ 
        title: errorTitle, 
        description: errorMessage, 
        variant: 'destructive' 
      });
    },
    onSuccess: async (_res, { teamId, teamData }, ctx) => {
      // WebSocket broadcasting for team member changes
      if (teamData.hasOwnProperty('team_members_ids') && ctx?.originalTeam) {
        const originalMembers = ctx.originalTeam.team_members_ids || [];
        const newMembers = teamData.team_members_ids || [];
        const teamName = ctx.originalTeam.name;
        const tenantName = tenantNameMap.get(ctx.originalTeam.tenant_id) || 'Unknown';
        
        // Detect member additions
        const addedMembers = newMembers.filter((memberId: string) => !originalMembers.includes(memberId));
        // Detect member removals  
        const removedMembers = originalMembers.filter((memberId: string) => !newMembers.includes(memberId));
        
        console.log('📡 Team member changes detected:', {
          teamName,
          tenantName,
          addedMembers,
          removedMembers,
          originalMembers,
          newMembers
        });
        
        // Dispatch window event to notify team dashboard of member changes
        try {
          window.dispatchEvent(new CustomEvent('admin-teams-updated', {
            detail: { teamId, teamName, tenantName, type: 'member-change' }
          }));
        } catch {}
        
        // Broadcast member additions
        addedMembers.forEach((memberId: string) => {
          const teamMemberEvent = {
            type: 'team-change',
            event: 'team-members-updated',
            data: {
              type: 'member-added',
              teamName,
              tenantName,
              memberId,
              memberName: memberId, // Use memberId as fallback since availableUsers is not in scope
              teamId,
              version: Date.now(),
              ts: Date.now(),
              updatedAt: new Date().toISOString(),
              originUserId: sessionId || 'admin'
            }
          };
          
          console.log('📡 Broadcasting member addition:', teamMemberEvent);
          sendMessage(teamMemberEvent);
        });
        
        // Broadcast member removals
        removedMembers.forEach((memberId: string) => {
          const teamMemberEvent = {
            type: 'team-change',
            event: 'team-members-updated',
            data: {
              type: 'member-removed',
              teamName,
              tenantName,
              memberId,
              memberName: memberId, // Use memberId as fallback since availableUsers is not in scope
              teamId,
              version: Date.now(),
              ts: Date.now(),
              updatedAt: new Date().toISOString(),
              originUserId: sessionId || 'admin'
            }
          };
          
          console.log('📡 Broadcasting member removal:', teamMemberEvent);
          sendMessage(teamMemberEvent);
        });

        // CRITICAL: Immediately invalidate and refetch Team Dashboard teamMembers cache
        // so counts and chips update without a manual refresh or waiting for WS
        try {
          // Invalidate Team Dashboard members cache keyed by tenant and team id
          await queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, teamId] });
          await queryClient.refetchQueries({ queryKey: ['teamMembers', tenantName, teamId] });
          
          // CRITICAL: ALSO invalidate the exact cache key pattern used by TeamDashboard component
          // TeamDashboard uses: ['teamMembers', tenantName, team?.id, team?.name]
          await queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
          await queryClient.refetchQueries({ queryKey: ['teamMembers', tenantName, teamId, teamName] });
        } catch (_err) {
          // Swallow errors; real-time WS or next navigation will recover
        }
      }
      
      // Create specific success message based on what was updated
      const updatedFields = [];
      if (teamData.hasOwnProperty('isActive')) {
        updatedFields.push(`status ${teamData.isActive ? 'activated' : 'deactivated'}`);
      }
      if (teamData.hasOwnProperty('name')) {
        updatedFields.push('name updated');
      }
      if (teamData.hasOwnProperty('description')) {
        updatedFields.push('description updated');
      }
      if (teamData.hasOwnProperty('team_email')) {
        updatedFields.push('email contacts updated');
      }
      if (teamData.hasOwnProperty('team_slack')) {
        updatedFields.push('Slack channels updated');
      }
      if (teamData.hasOwnProperty('team_pagerduty')) {
        updatedFields.push('PagerDuty integration updated');
      }
      if (teamData.hasOwnProperty('team_members_ids')) {
        updatedFields.push('team members updated');
      }
      
      const successMessage = updatedFields.length > 0 
        ? `Team ${updatedFields.join(', ')}.`
        : 'Team has been successfully updated.';
      
      toast({ 
        title: 'Team Updated', 
        description: successMessage 
      });

      // If team name changed, proactively invalidate TeamDashboard teamMembers cache
      if (ctx?.originalTeam && teamData?.name && teamData.name !== ctx.originalTeam.name) {
        const tenantName = tenantNameMap.get(ctx.originalTeam.tenant_id) || 'Unknown';
        try {
          const key = cacheKeys.teamMembers(tenantName as string, teamId as number);
          await queryClient.invalidateQueries({ queryKey: key });
          await queryClient.refetchQueries({ queryKey: key });
        } catch {}

        // Also emit a global event so any mounted dashboards can refresh Redux teams/list
        try {
          window.dispatchEvent(new CustomEvent('admin-teams-updated', {
            detail: { teamId, oldName: ctx.originalTeam.name, newName: teamData.name, tenantName }
          }));
        } catch {}

        // Broadcast over WebSocket to match member updates flow
        try {
          const wsEvent = {
            type: 'team-change',
            event: 'team-members-updated',
            data: {
              type: 'team-renamed',
              teamId,
              tenantName,
              oldName: ctx.originalTeam.name,
              newName: teamData.name,
              version: Date.now(),
              ts: Date.now(),
              updatedAt: new Date().toISOString(),
              originUserId: sessionId || 'admin'
            }
          };
          sendMessage(wsEvent);
        } catch {}
      }
    },
    onSettled: async () => {
      // Comprehensive cache invalidation
      await invalidateAdminCaches(queryClient);
      
      // Core team data caches
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      
      // Team dashboard and summary data
      await queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/dashboard/summary'] });
      
      // Team member specific data
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/get_team_members'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/team_members'] });
      
      // Tenant-related caches (team count changes)
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants', 'active'] });
      
      // Team-specific performance and analytics data
      await queryClient.invalidateQueries({ queryKey: ['/api/v1/team_performance'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/analytics/teams'] });
      
      console.log('🔄 Comprehensive cache invalidation completed for team update');
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
        console.log('📝 Submitting team update:', { teamId: selectedTeam.id, teamData });
        await handleUpdateTeamModern(selectedTeam.id, teamData);
      } else {
        console.log('📝 Submitting team creation:', { teamData });
        await handleCreateTeamModern(teamData);
      }
    } catch (error: any) {
      // Enhanced error logging with full error details
      console.error('🔥 Team submission error details:', {
        message: error?.message,
        status: error?.status,
        details: error?.details,
        endpoint: error?.endpoint,
        stack: error?.stack,
        fullError: error,
        teamData,
        operation: selectedTeam ? 'update' : 'create'
      });
      
      // Additional error details for debugging
      if (error?.details) {
        console.error('📋 Error response details:', JSON.stringify(error.details, null, 2));
      }
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
        tenants={allTenants}
        activeTenants={activeTenants}
        onSubmit={handleSubmitTeam}
      />
    </Box>
  );
};

export default TeamsManagement;