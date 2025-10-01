import React, { useState, useEffect } from 'react';
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
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { teamMemberSchema, teamDetailsUpdateSchema } from '@shared/schema';
import { apiClient } from '@/config/api';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role?: string;
  is_active: boolean;
}

interface TeamDetails {
  id: number;
  name: string;
  description?: string;
  tenant_id: number;
  team_members_ids: string[];
  team_email: string[];
  team_slack: string[];
  team_pagerduty: string[];
  members: TeamMember[];
}

interface TeamMemberManagementProps {
  teamName: string;
  tenantName: string;
}

const TeamMemberManagement: React.FC<TeamMemberManagementProps> = ({
  teamName,
  tenantName,
}) => {
  const [teamDetails, setTeamDetails] = useState<TeamDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const { toast } = useToast();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: {
      id: '',
      name: '',
      email: '',
      role: 'developer',
      is_active: true,
    },
  });

  // Fetch team details on component mount
  useEffect(() => {
    fetchTeamDetails();
  }, [teamName]);

  const fetchTeamDetails = async () => {
    try {
      setLoading(true);
      const response = await apiClient.teams.getDetails(teamName);
      const data = await response.json();
      setTeamDetails(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch team details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = () => {
    setEditingMember(null);
    reset({
      id: '',
      name: '',
      email: '',
      role: 'developer',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleEditMember = (member: TeamMember) => {
    setEditingMember(member);
    reset(member);
    setDialogOpen(true);
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      const memberData = {
        team: teamName,
        tenant: tenantName,
        username: 'azure_test_user', // This would come from OAuth context
        action: 'remove' as const,
        memberId,
      };

      await apiClient.teams.updateMembers(teamName, memberData);
      
      toast({
        title: 'Success',
        description: 'Team member removed successfully',
      });
      
      await fetchTeamDetails();
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to remove team member';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const onSubmit = async (data: z.infer<typeof teamMemberSchema>) => {
    try {
      const memberData = {
        team: teamName,
        tenant: tenantName,
        username: 'azure_test_user', // This would come from OAuth context
        action: editingMember ? ('update' as const) : ('add' as const),
        member: data,
        memberId: editingMember?.id,
      };

      await apiClient.teams.updateMembers(teamName, memberData);
      
      toast({
        title: 'Success',
        description: `Team member ${editingMember ? 'updated' : 'added'} successfully`,
      });
      
      setDialogOpen(false);
      await fetchTeamDetails();
    } catch (error: any) {
      const errorMessage = error?.message || `Failed to ${editingMember ? 'update' : 'add'} team member`;
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'admin': return 'error';
      case 'manager': return 'warning';
      case 'lead': return 'info';
      case 'developer': return 'primary';
      case 'analyst': return 'secondary';
      case 'ops': return 'success';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading team members...</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Box display="flex" alignItems="center" gap={1}>
              <PersonIcon color="primary" />
              <Typography variant="h6" component="h2">
                Team Members ({teamDetails?.members?.length || 0})
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddMember}
              size="small"
            >
              Add Member
            </Button>
          </Box>

          {teamDetails?.members && teamDetails.members.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teamDetails.members.map((member) => (
                    <TableRow 
                      key={member.id}
                      sx={{
                        backgroundColor: member.is_active ? 'inherit' : 'action.hover',
                        '&:hover': {
                          backgroundColor: member.is_active ? 'action.hover' : 'action.selected'
                        }
                      }}
                      data-testid={`row-member-${member.id}`}
                    >
                      <TableCell>
                        <Typography 
                          variant="body2" 
                          fontWeight={500}
                          sx={{
                            opacity: member.is_active ? 1 : 0.6,
                            color: member.is_active ? 'text.primary' : 'text.disabled',
                            textDecoration: member.is_active ? 'none' : 'line-through'
                          }}
                          data-testid={`text-member-name-${member.id}`}
                        >
                          {member.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <EmailIcon 
                            fontSize="small" 
                            color={member.is_active ? "action" : "disabled"}
                          />
                          <Typography 
                            variant="body2" 
                            sx={{
                              opacity: member.is_active ? 1 : 0.6,
                              color: member.is_active ? 'text.secondary' : 'text.disabled'
                            }}
                            data-testid={`text-member-email-${member.id}`}
                          >
                            {member.email}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={member.role || 'developer'}
                          size="small"
                          color={getRoleColor(member.role)}
                          variant="outlined"
                          sx={{
                            opacity: member.is_active ? 1 : 0.6
                          }}
                          data-testid={`chip-member-role-${member.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={member.is_active ? 'Active' : 'Expired'}
                          size="small"
                          color={member.is_active ? 'success' : 'error'}
                          variant={member.is_active ? 'filled' : 'outlined'}
                          sx={{
                            fontWeight: member.is_active ? 'normal' : 'bold',
                            '& .MuiChip-label': {
                              color: member.is_active ? 'white' : '#d32f2f'
                            }
                          }}
                          data-testid={`chip-member-status-${member.id}`}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" gap={0.5}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditMember(member)}
                            color="primary"
                            sx={{ opacity: member.is_active ? 1 : 0.7 }}
                            data-testid={`button-edit-member-${member.id}`}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteMember(member.id)}
                            color="error"
                            sx={{ opacity: member.is_active ? 1 : 0.7 }}
                            data-testid={`button-delete-member-${member.id}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              py={4}
              color="text.secondary"
            >
              <PersonIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
              <Typography variant="body1" color="text.secondary">
                No team members found
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Add team members to start collaborating
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Member Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>
            {editingMember ? 'Edit Team Member' : 'Add Team Member'}
          </DialogTitle>
          <DialogContent>
            <Box display="flex" flexDirection="column" gap={3} pt={1}>
              <Controller
                name="id"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Member ID"
                    error={!!errors.id}
                    helperText={errors.id?.message}
                    fullWidth
                    size="small"
                    disabled={!!editingMember}
                  />
                )}
              />
              
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Full Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    fullWidth
                    size="small"
                  />
                )}
              />
              
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Email"
                    type="email"
                    error={!!errors.email}
                    helperText={errors.email?.message}
                    fullWidth
                    size="small"
                  />
                )}
              />
              
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth size="small">
                    <InputLabel>Role</InputLabel>
                    <Select {...field} label="Role">
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="manager">Manager</MenuItem>
                      <MenuItem value="lead">Technical Lead</MenuItem>
                      <MenuItem value="developer">Developer</MenuItem>
                      <MenuItem value="analyst">Data Analyst</MenuItem>
                      <MenuItem value="ops">Operations</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">
              {editingMember ? 'Update' : 'Add'} Member
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default TeamMemberManagement;