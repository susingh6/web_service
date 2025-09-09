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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Group as GroupIcon,
  Visibility as ViewIcon
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (teamData: any) => {
      return await apiRequest('POST', buildUrl(endpoints.admin.teams.create), teamData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
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

  const getTenantName = (tenantId: number) => {
    const tenant = tenants.find(t => t.id === tenantId);
    return tenant?.name || 'Unknown';
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
        >
          New Team
        </Button>
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Active Teams ({teams.length})
          </Typography>
          
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
                {teams.map((team) => (
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
                        label={getTenantName(team.tenant_id)} 
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
                        <Tooltip title="View Details">
                          <IconButton size="small">
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Team">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleEditTeam(team)}
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