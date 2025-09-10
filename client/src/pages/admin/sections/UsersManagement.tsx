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
  Switch,
  FormControlLabel,
  TablePagination,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Person as PersonIcon,
  CheckCircle as EnableIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { apiRequest } from '@/lib/queryClient';
import { User } from '@shared/schema';
import { useOptimisticMutation, CACHE_PATTERNS, INVALIDATION_SCENARIOS } from '@/utils/cache-management';

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

  // Update form data when user prop changes
  useEffect(() => {
    if (user) {
      setFormData({
        user_name: user.user_name || '',
        user_email: user.user_email || '',
        user_slack: user.user_slack ? user.user_slack.join(', ') : '',
        user_pagerduty: user.user_pagerduty ? user.user_pagerduty.join(', ') : '',
        is_active: user.is_active ?? true,
      });
    } else {
      setFormData({
        user_name: '',
        user_email: '',
        user_slack: '',
        user_pagerduty: '',
        is_active: true,
      });
    }
  }, [user]);

  const handleSubmit = () => {
    const userData = {
      user_name: formData.user_name,
      user_email: formData.user_email,
      user_slack: formData.user_slack ? formData.user_slack.split(',').map((s: string) => s.trim()).filter((s: string) => s) : null,
      user_pagerduty: formData.user_pagerduty ? formData.user_pagerduty.split(',').map((s: string) => s.trim()).filter((s: string) => s) : null,
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
  const [selectedUser, setSelectedUser] = useState<any | null>(null); // Use any since API returns different format than schema
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();
  
  // Debounce search query for better performance
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Fetch users from admin endpoint with FastAPI headers
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
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
      
      const response = await fetch(buildUrl(endpoints.admin.users.getAll), {
        cache: 'no-store',
        headers,
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      return response.json();
    },
  });

  // Multi-field search logic with normalized search index
  const filteredUsers = useMemo(() => {
    if (!users || users.length === 0) return [];
    
    if (!deferredSearchQuery.trim()) {
      return users;
    }
    
    // Split search query into tokens (case-insensitive, AND semantics)
    const searchTokens = deferredSearchQuery
      .toLowerCase()
      .split(' ')
      .filter(token => token.trim().length > 0);
    
    if (searchTokens.length === 0) return users;
    
    return users.filter((user: any) => {
      // Create normalized search index for this user
      const searchableFields = [
        user.user_name || '',
        user.user_email || '',
        ...(user.user_slack || []),
        ...(user.user_pagerduty || [])
      ];
      
      // Join all searchable fields into a single lowercase string
      const searchBlob = searchableFields
        .map(field => String(field).toLowerCase())
        .join(' ');
      
      // All search tokens must match (AND semantics)
      return searchTokens.every(token => searchBlob.includes(token));
    });
  }, [users, deferredSearchQuery]);

  // Pagination logic - calculate displayed users
  const paginatedUsers = useMemo(() => {
    const startIndex = page * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, page, rowsPerPage]);

  // Reset pagination when search changes
  useEffect(() => {
    setPage(0);
  }, [deferredSearchQuery]);

  // Fetch teams for user assignment
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.teams));
      return response.json();
    },
  });

  // Create user mutation with optimistic updates following FastAPI pattern
  const createUser = async (userData: any) => {
    // Generate optimistic ID for tracking
    const optimisticId = Date.now();
    const optimisticUser = { ...userData, user_id: optimisticId };
    
    try {
      const result = await executeWithOptimism({
        optimisticUpdate: {
          queryKey: ['admin', 'users'],
          updater: (old: any[] | undefined) => old ? [...old, optimisticUser] : [optimisticUser],
        },
        mutationFn: async () => {
          // Build headers with session ID for RBAC enforcement
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          
          // CRITICAL: Add X-Session-ID header for FastAPI RBAC
          const sessionId = localStorage.getItem('fastapi_session_id');
          if (sessionId) {
            headers['X-Session-ID'] = sessionId;
          }
          
          const response = await fetch(buildUrl(endpoints.admin.users.create), {
            method: 'POST',
            headers,
            body: JSON.stringify(userData),
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to create user');
          return response.json();
        },
        // Use generic invalidation since users don't have specific scenarios yet
        invalidationScenario: undefined,
        rollbackKeys: [['admin', 'users']],
      });

      // Replace optimistic entry with real server response
      if (result) {
        cacheManager.setOptimisticData(['admin', 'users'], (old: any[] | undefined) => {
          if (!old) return [result];
          return old.map(user => user.user_id === optimisticId ? result : user);
        });
      }

      toast({
        title: "User Created",
        description: "New user has been successfully created.",
      });
      
      return result;
    } catch (error: any) {
      let errorMessage = "Failed to create user. Please try again.";
      let errorTitle = "Creation Failed";

      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.status === 409) {
        errorMessage = "Username already exists. Please choose a different username.";
        errorTitle = "Username Taken";
      } else if (error?.status === 400) {
        errorMessage = "Invalid user data provided. Please check your input.";
        errorTitle = "Invalid Data";
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  };

  const createUserMutation = useMutation({
    mutationFn: createUser,
  });

  // Update user mutation with optimistic updates following FastAPI pattern
  const updateUser = async (userId: number, userData: any) => {
    try {
      const result = await executeWithOptimism({
        optimisticUpdate: {
          queryKey: ['admin', 'users'],
          updater: (old: any[] | undefined) => {
            if (!old) return [];
            return old.map(user => 
              user.user_id === userId ? { ...user, ...userData } : user
            );
          },
        },
        mutationFn: async () => {
          // Build headers with session ID for RBAC enforcement
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          
          // CRITICAL: Add X-Session-ID header for FastAPI RBAC
          const sessionId = localStorage.getItem('fastapi_session_id');
          if (sessionId) {
            headers['X-Session-ID'] = sessionId;
          }
          
          const response = await fetch(buildUrl(endpoints.admin.users.update, userId), {
            method: 'PUT',
            headers,
            body: JSON.stringify(userData),
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to update user');
          return response.json();
        },
        // Use generic invalidation since users don't have specific scenarios yet
        invalidationScenario: undefined,
        rollbackKeys: [['admin', 'users']],
      });

      toast({
        title: "User Updated",
        description: "User has been successfully updated.",
      });
      
      return result;
    } catch (error: any) {
      let errorMessage = "Failed to update user. Please try again.";
      let errorTitle = "Update Failed";

      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.status === 409) {
        errorMessage = "Username already exists. Please choose a different username.";
        errorTitle = "Username Taken";
      } else if (error?.status === 400) {
        errorMessage = "Invalid user data provided. Please check your input.";
        errorTitle = "Invalid Data";
      } else if (error?.status === 404) {
        errorMessage = "User not found. The user may have been deleted.";
        errorTitle = "User Not Found";
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, userData }: { userId: number; userData: any }) => updateUser(userId, userData),
  });

  const handleCreateUser = () => {
    setSelectedUser(null);
    setDialogOpen(true);
  };

  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleSubmitUser = async (userData: any) => {
    try {
      if (selectedUser) {
        await updateUserMutation.mutateAsync({ userId: selectedUser.user_id, userData });
      } else {
        await createUserMutation.mutateAsync(userData);
      }
    } catch (error) {
      // Error handling is done in the mutation functions
      console.error('User submission error:', error);
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              System Users ({users?.length || 0} total)
            </Typography>
            <TextField
              size="small"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-users"
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
                    >
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          
          {filteredUsers.length > 0 && (
            <Typography 
              variant="body2" 
              color="text.secondary" 
              sx={{ mb: 2 }}
              data-testid="status-result-count"
            >
              Showing {Math.min(filteredUsers.length, (page + 1) * rowsPerPage)} of {filteredUsers.length} result{filteredUsers.length !== 1 ? 's' : ''}
            </Typography>
          )}
          
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
                {paginatedUsers?.map((user: any) => (
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
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <TablePagination
            component="div"
            count={filteredUsers.length}
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