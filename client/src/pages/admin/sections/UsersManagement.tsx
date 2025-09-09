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
  Tooltip,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Person as PersonIcon,
  Block as BlockIcon,
  CheckCircle as EnableIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { apiRequest } from '@/lib/queryClient';
import { User } from '@shared/schema';

interface UserFormDialogProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  teams: any[];
  onSubmit: (userData: any) => void;
}

const UserFormDialog = ({ open, onClose, user, teams, onSubmit }: UserFormDialogProps) => {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    displayName: user?.displayName || '',
    team: user?.team || '',
    role: user?.role || 'user',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = () => {
    if (!user && formData.password !== formData.confirmPassword) {
      // Handle password mismatch
      return;
    }
    
    const userData: any = { ...formData };
    if (user) {
      // Remove password fields if editing existing user and password is empty
      if (!formData.password) {
        delete userData.password;
        delete userData.confirmPassword;
      }
    }
    
    onSubmit(userData);
    onClose();
    setFormData({
      username: '',
      email: '',
      displayName: '',
      team: '',
      role: 'user',
      password: '',
      confirmPassword: '',
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {user ? 'Edit User' : 'Create New User'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            label="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
          
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          
          <TextField
            fullWidth
            label="Display Name"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
          />
          
          <FormControl fullWidth>
            <InputLabel>Team</InputLabel>
            <Select
              value={formData.team}
              onChange={(e) => setFormData({ ...formData, team: e.target.value })}
              label="Team"
            >
              <MenuItem value="">No Team</MenuItem>
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.name}>
                  {team.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl fullWidth required>
            <InputLabel>Role</InputLabel>
            <Select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              label="Role"
            >
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
          
          {!user && (
            <>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
              
              <TextField
                fullWidth
                label="Confirm Password"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                error={formData.password !== formData.confirmPassword}
                helperText={formData.password !== formData.confirmPassword ? 'Passwords do not match' : ''}
              />
            </>
          )}
          
          {user && (
            <>
              <TextField
                fullWidth
                label="New Password (leave empty to keep current)"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              
              {formData.password && (
                <TextField
                  fullWidth
                  label="Confirm New Password"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  error={formData.password !== formData.confirmPassword}
                  helperText={formData.password !== formData.confirmPassword ? 'Passwords do not match' : ''}
                />
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!user && formData.password !== formData.confirmPassword}
        >
          {user ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const UsersManagement = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch users from cached endpoint (like other sections)
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['/api/admin/users'],
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache (renamed from cacheTime in v5)
    queryFn: async () => {
      console.log('Users query running - returning mock data');
      // For now, use mock data until FastAPI endpoint is ready
      // This should be replaced with: await fetch(buildUrl(endpoints.admin.users.getAll))
      const mockUsers = [
        {
          user_id: 1,
          user_name: 'john.smith',
          user_email: 'john.smith@company.com',
          user_slack: ['john.smith.slack'],
          user_pagerduty: ['john.smith@pagerduty'],
          is_active: true
        },
        {
          user_id: 2,
          user_name: 'sarah.lee',
          user_email: 'sarah.lee@company.com',
          user_slack: ['sarah.lee.slack'],
          user_pagerduty: null,
          is_active: true
        },
        {
          user_id: 3,
          user_name: 'mike.johnson',
          user_email: 'mike.johnson@company.com',
          user_slack: null,
          user_pagerduty: ['mike.johnson@pagerduty'],
          is_active: true
        },
        {
          user_id: 4,
          user_name: 'alice.wong',
          user_email: 'alice.wong@company.com',
          user_slack: ['alice.wong.slack', 'alice.backup.slack'],
          user_pagerduty: ['alice.wong@pagerduty'],
          is_active: false
        },
        {
          user_id: 5,
          user_name: 'david.chen',
          user_email: 'david.chen@company.com',
          user_slack: ['david.chen.slack'],
          user_pagerduty: ['david.chen@pagerduty', 'david.backup@pagerduty'],
          is_active: true
        }
      ];
      
      console.log('Mock users data:', mockUsers);
      console.log('Users length:', mockUsers.length);
      return mockUsers;
    },
  });

  console.log('Rendered users:', users);
  console.log('Users length in component:', users?.length || 0);

  // Fetch teams for user assignment
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.teams));
      return response.json();
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      return await apiRequest('POST', buildUrl(endpoints.admin.users.create), userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "User Created",
        description: "New user has been successfully created.",
      });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create user. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, userData }: { userId: number; userData: any }) => {
      return await apiRequest('PUT', buildUrl(endpoints.admin.users.update, userId), userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "User Updated",
        description: "User has been successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update user. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateUser = () => {
    setSelectedUser(null);
    setDialogOpen(true);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleSubmitUser = (userData: any) => {
    if (selectedUser) {
      updateUserMutation.mutate({ userId: selectedUser.id, userData });
    } else {
      createUserMutation.mutate(userData);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'error';
      case 'user': return 'primary';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Users Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage user accounts, roles, and permissions
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateUser}
        >
          New User
        </Button>
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Users ({users?.length || 0})
          </Typography>
          
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User ID</TableCell>
                  <TableCell>User Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Slack</TableCell>
                  <TableCell>PagerDuty</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users?.map((user: any) => (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {user.user_id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon color="primary" />
                        <Typography variant="body2" fontWeight="medium">
                          {user.user_name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {user.user_email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {user.user_slack ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {user.user_slack.map((slack: string, index: number) => (
                            <Chip key={index} label={slack} size="small" variant="outlined" color="info" />
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No Slack
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.user_pagerduty ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {user.user_pagerduty.map((pd: string, index: number) => (
                            <Chip key={index} label={pd} size="small" variant="outlined" color="warning" />
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No PagerDuty
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={user.is_active ? "Active" : "Inactive"} 
                        size="small" 
                        color={user.is_active ? "success" : "error"}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Edit User">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleEditUser(user)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Disable User">
                          <IconButton size="small" color="error">
                            <BlockIcon />
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

      <UserFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        user={selectedUser}
        teams={teams}
        onSubmit={handleSubmitUser}
      />
    </Box>
  );
};

export default UsersManagement;