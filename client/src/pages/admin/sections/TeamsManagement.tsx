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
  Switch
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
  });

  // Update form data when team prop changes
  useEffect(() => {
    if (team) {
      setFormData({
        name: team.name || '',
        description: team.description || '',
        tenant_id: team.tenant_id || '',
        isActive: team.isActive ?? true,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        tenant_id: '',
        isActive: true,
      });
    }
  }, [team]);

  const handleSubmit = () => {
    const teamData = {
      name: formData.name,
      description: formData.description,
      tenant_id: formData.tenant_id,
      isActive: formData.isActive,
    };
    
    onSubmit(teamData);
    onClose();
    setFormData({ name: '', description: '', tenant_id: '', isActive: true });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {team ? 'Edit Team' : 'Create New Team'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            label="Team Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          
          <FormControl fullWidth required>
            <InputLabel>Tenant</InputLabel>
            <Select
              value={formData.tenant_id}
              onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
              label="Tenant"
            >
              {tenants.map((tenant) => (
                <MenuItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={formData.isActive}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, isActive: e.target.checked })}
              />
            }
            label="Active Team"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!formData.name || !formData.tenant_id}
        >
          {team ? 'Update Team' : 'Create Team'}
        </Button>
      </DialogActions>
    </Dialog>
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