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
  InputLabel,
  Select,
  MenuItem,
  Paper,
  IconButton,
  Tooltip,
  TablePagination,
  InputAdornment
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
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { apiRequest } from '@/lib/queryClient';
import { Team } from '@shared/schema';

interface TeamFormDialogProps {
  open: boolean;
  onClose: () => void;
  team: Team | null;
  tenants: any[];
  onSubmit: (teamData: any) => void;
}

const TeamFormDialog = ({ open, onClose, team, tenants, onSubmit }: TeamFormDialogProps) => {
  const [formData, setFormData] = useState({
    name: team?.name || '',
    description: team?.description || '',
    tenant_id: team?.tenant_id || '',
  });

  const handleSubmit = () => {
    onSubmit(formData);
    onClose();
    setFormData({ name: '', description: '', tenant_id: '' });
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
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          {team ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const TeamsManagement = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Debounce search query for better performance
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Fetch teams
  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.teams));
      return response.json();
    },
  });

  // Fetch tenants for team creation
  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/tenants'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.tenants));
      return response.json();
    },
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
    
    return teams.filter((team: Team) => {
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

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (teamData: any) => {
      return await apiRequest('POST', buildUrl(endpoints.admin.teams.create), teamData);
    },
    onSuccess: () => {
      // Invalidate all team-related caches so new team appears everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      toast({
        title: "Team Created",
        description: "New team has been successfully created.",
      });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create team. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update team mutation
  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, teamData }: { teamId: number; teamData: any }) => {
      return await apiRequest('PUT', buildUrl(endpoints.admin.teams.update, teamId), teamData);
    },
    onSuccess: () => {
      // Invalidate all team-related caches so updated team appears everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      toast({
        title: "Team Updated",
        description: "Team has been successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update team. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateTeam = () => {
    setSelectedTeam(null);
    setDialogOpen(true);
  };

  const handleEditTeam = (team: Team) => {
    setSelectedTeam(team);
    setDialogOpen(true);
  };

  const handleSubmitTeam = (teamData: any) => {
    if (selectedTeam) {
      updateTeamMutation.mutate({ teamId: selectedTeam.id, teamData });
    } else {
      createTeamMutation.mutate(teamData);
    }
  };

  // Helper function for form dialog (still needed for compatibility)
  const getTenantName = (tenantId: number) => {
    return tenantNameMap.get(tenantId) ?? 'Unknown';
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
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedTeams?.map((team) => (
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
                        label={tenantNameMap.get(team.tenant_id) ?? 'Unknown'} 
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