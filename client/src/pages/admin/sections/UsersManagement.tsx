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
  user: any | null;
  onSubmit: (userData: any) => void;
}

const UserFormDialog = ({ open, onClose, user, onSubmit }: UserFormDialogProps) => {
  const [formData, setFormData] = useState({
    user_name: user?.user_name || '',
    user_email: user?.user_email || '',
    user_slack: user?.user_slack ? user.user_slack.join(', ') : '',
    user_pagerduty: user?.user_pagerduty ? user.user_pagerduty.join(', ') : '',
    is_active: user?.is_active ?? true,
  });

  const handleSubmit = () => {
    const userData = {
      user_name: formData.user_name,
      user_email: formData.user_email,
      user_slack: formData.user_slack ? formData.user_slack.split(',').map(s => s.trim()).filter(s => s) : null,
      user_pagerduty: formData.user_pagerduty ? formData.user_pagerduty.split(',').map(s => s.trim()).filter(s => s) : null,
      is_active: formData.is_active,
    };
    
    onSubmit(userData);
    onClose();
    setFormData({
      user_name: '',
      user_email: '',
      user_slack: '',
      user_pagerduty: '',
      is_active: true,
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
            label="User Name"
            value={formData.user_name}
            onChange={(e) => setFormData({ ...formData, user_name: e.target.value })}
            required
            helperText="Unique username for the user"
          />
          
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={formData.user_email}
            onChange={(e) => setFormData({ ...formData, user_email: e.target.value })}
            required
            helperText="User's email address"
          />
          
          <TextField
            fullWidth
            label="Slack Handles"
            value={formData.user_slack}
            onChange={(e) => setFormData({ ...formData, user_slack: e.target.value })}
            helperText="Comma-separated Slack handles (e.g., john.slack, john.backup)"
            placeholder="john.slack, john.backup"
          />
          
          <TextField
            fullWidth
            label="PagerDuty Contacts"
            value={formData.user_pagerduty}
            onChange={(e) => setFormData({ ...formData, user_pagerduty: e.target.value })}
            helperText="Comma-separated PagerDuty contacts (e.g., john@pagerduty, john.backup@pagerduty)"
            placeholder="john@pagerduty, john.backup@pagerduty"
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                color="primary"
              />
            }
            label="Active User"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!formData.user_name || !formData.user_email}
        >
          {user ? 'Update User' : 'Create User'}
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
      
      return mockUsers;
    },
  });

  // Users data loaded successfully

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

  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleSubmitUser = (userData: any) => {
    if (selectedUser) {
      updateUserMutation.mutate({ userId: selectedUser.user_id, userData });
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
        onSubmit={handleSubmitUser}
      />
    </Box>
  );
};

export default UsersManagement;