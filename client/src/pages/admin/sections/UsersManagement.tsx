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
    
    const userData = { ...formData };
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

  // Fetch users
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      // Mock data for now - replace with real API
      return [
        {
          id: 1,
          username: 'john.smith',
          email: 'john@company.com',
          displayName: 'John Smith',
          team: 'PGM',
          role: 'admin',
        },
        {
          id: 2,
          username: 'sarah.lee',
          email: 'sarah@company.com',
          displayName: 'Sarah Lee',
          team: 'CDM',
          role: 'user',
        },
        {
          id: 3,
          username: 'mike.johnson',
          email: 'mike@company.com',
          displayName: 'Mike Johnson',
          team: 'Core',
          role: 'user',
        },
      ] as User[];
    },
  });

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
            System Users ({users.length})
          </Typography>
          
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon color="primary" />
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {user.displayName || user.username}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            @{user.username}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {user.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {user.team ? (
                        <Chip label={user.team} size="small" variant="outlined" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No team
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={user.role} 
                        size="small" 
                        color={getRoleColor(user.role) as any}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label="Active" size="small" color="success" />
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