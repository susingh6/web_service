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
  Paper,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Security as SecurityIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildUrl, endpoints } from '@/config';

interface Role {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  isSystemRole: boolean;
}

const RolesManagement = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  // Fetch roles
  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      // Mock data for now - replace with real API
      return [
        {
          id: 1,
          name: 'Admin',
          description: 'Full system administration access',
          permissions: [
            'manage_users',
            'manage_teams',
            'manage_tenants',
            'resolve_conflicts',
            'view_all_entities',
            'manage_system_settings'
          ],
          userCount: 3,
          isSystemRole: true,
        },
        {
          id: 2,
          name: 'User',
          description: 'Standard user with entity management permissions',
          permissions: [
            'view_entities',
            'create_entities',
            'edit_own_entities',
            'view_team_entities',
            'create_notifications'
          ],
          userCount: 42,
          isSystemRole: true,
        },
        {
          id: 3,
          name: 'Viewer',
          description: 'Read-only access to assigned entities',
          permissions: [
            'view_entities',
            'view_team_entities'
          ],
          userCount: 8,
          isSystemRole: false,
        },
      ] as Role[];
    },
  });

  const filteredRoles = useMemo(() => {
    if (!roles || roles.length === 0) return [] as Role[];
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return roles as Role[];
    const tokens = q.split(' ').filter(Boolean);
    return (roles as Role[]).filter((r) => {
      const blob = [
        r.name,
        r.description,
        r.permissions.join(' '),
        r.isSystemRole ? 'system' : 'custom',
        String(r.userCount)
      ].join(' ').toLowerCase();
      return tokens.every(tok => blob.includes(tok));
    });
  }, [roles, deferredSearchQuery]);

  const getPermissionLabel = (permission: string) => {
    const labels: Record<string, string> = {
      'manage_users': 'Manage Users',
      'manage_teams': 'Manage Teams',
      'manage_tenants': 'Manage Tenants',
      'resolve_conflicts': 'Resolve Conflicts',
      'view_all_entities': 'View All Entities',
      'manage_system_settings': 'System Settings',
      'view_entities': 'View Entities',
      'create_entities': 'Create Entities',
      'edit_own_entities': 'Edit Own Entities',
      'view_team_entities': 'View Team Entities',
      'create_notifications': 'Create Notifications',
    };
    return labels[permission] || permission;
  };

  const getRoleColor = (role: Role) => {
    if (role.name === 'Admin') return 'error';
    if (role.name === 'User') return 'primary';
    return 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Roles & Permissions
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage user roles and their associated permissions
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled // Disable for now until we implement role creation
        >
          New Role
        </Button>
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              System Roles ({filteredRoles.length})
            </Typography>
            <TextField
              size="small"
              placeholder="Search roles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: 300 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')} edge="end">
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Role Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Users</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRoles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SecurityIcon color="primary" />
                        <Typography variant="body2" fontWeight="medium">
                          {role.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {role.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {role.userCount} users
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={role.isSystemRole ? 'System' : 'Custom'} 
                        size="small" 
                        color={role.isSystemRole ? 'primary' : 'default'}
                        variant={role.isSystemRole ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip 
                        title={
                          <List dense>
                            {role.permissions.map((permission) => (
                              <ListItem key={permission}>
                                <ListItemIcon>
                                  <CheckIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary={getPermissionLabel(permission)} />
                              </ListItem>
                            ))}
                          </List>
                        }
                        arrow
                      >
                        <Chip 
                          label={`${role.permissions.length} permissions`} 
                          size="small" 
                          variant="outlined"
                          color={getRoleColor(role) as any}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title={role.isSystemRole ? 'System role cannot be edited' : 'Edit Role'}>
                          <span>
                            <IconButton 
                              size="small" 
                              color="primary"
                              disabled={role.isSystemRole}
                            >
                              <EditIcon />
                            </IconButton>
                          </span>
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

      <Card elevation={2} sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Permission Reference
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Available permissions in the system:
          </Typography>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" gutterBottom color="error">
                Administrative Permissions
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Manage Users" secondary="Create, edit, disable users" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Manage Teams" secondary="Create and modify teams" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Resolve Conflicts" secondary="Handle ownership conflicts" />
                </ListItem>
              </List>
            </Box>
            
            <Box>
              <Typography variant="subtitle2" gutterBottom color="primary">
                Entity Permissions
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="View Entities" secondary="See assigned entities" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Create Entities" secondary="Add new entities" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><CheckIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Edit Own Entities" secondary="Modify created entities" />
                </ListItem>
              </List>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default RolesManagement;