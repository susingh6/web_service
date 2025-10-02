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
import { Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch } from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Security as SecurityIcon,
  Check as CheckIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  VpnKey as PermissionIcon
} from '@mui/icons-material';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAdminMutation } from '@/utils/cache-management';
import { buildUrl, endpoints, isDevelopment } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { invalidateAdminCaches } from '@/lib/cacheKeys';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';

interface Role {
  id: number;
  role_name: string;
  description: string;
  team_name?: string | null;
  tenant_name?: string | null;
  role_permissions: string[];
  userCount?: number;
  is_system_role: boolean;
  is_active: boolean;
}

interface Permission {
  permission_name: string;
  description: string;
  category: 'Table' | 'DAG' | 'Notification' | 'Agentic' | 'Notification Subscription';
  is_active: boolean;
}

const RolesManagement = () => {
  const [rolesSearchQuery, setRolesSearchQuery] = useState('');
  const [permissionsSearchQuery, setPermissionsSearchQuery] = useState('');
  const deferredRolesSearchQuery = useDeferredValue(rolesSearchQuery);
  const deferredPermissionsSearchQuery = useDeferredValue(permissionsSearchQuery);
  const { createRole, updateRole, deleteRole } = useAdminMutation();

  // Preload tenants (active) and teams for dropdowns
  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/tenants', 'active'],
    queryFn: async () => {
      const res = await fetch(buildUrl(endpoints.admin.tenants.getAll));
      const all = await res.json();
      return (all || []).filter((t: any) => t.isActive !== false);
    },
    staleTime: 6 * 60 * 60 * 1000,
  });
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: async () => {
      const res = await fetch(buildUrl(endpoints.teams));
      const all = await res.json();
      return (all || []).filter((tm: any) => tm.isActive !== false);
    },
    staleTime: 6 * 60 * 60 * 1000,
  });

  // Fetch roles
  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const res = await fetch('/api/v1/roles');
      if (!res.ok) throw new Error('Failed to fetch roles');
      return res.json();
    },
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch permissions from cache
  const { data: permissions = [], isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ['admin', 'permissions'],
    queryFn: async () => {
      const res = await fetch(buildUrl(endpoints.admin.permissions.getAll));
      if (!res.ok) throw new Error('Failed to fetch permissions');
      return res.json();
    },
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const filteredRoles = useMemo(() => {
    if (!roles || roles.length === 0) return [] as Role[];
    const q = deferredRolesSearchQuery.trim().toLowerCase();
    if (!q) return roles as Role[];
    const tokens = q.split(' ').filter(Boolean);
    return (roles as Role[]).filter((r) => {
      const blob = [
        r.role_name,
        r.description,
        (r.role_permissions || []).join(' '),
        r.is_system_role ? 'system' : 'team-specific',
        r.is_active ? 'active' : 'inactive',
        (r.tenant_name || ''),
        (r.team_name || '')
      ].join(' ').toLowerCase();
      return tokens.every(tok => blob.includes(tok));
    });
  }, [roles, deferredRolesSearchQuery]);

  const filteredPermissions = useMemo(() => {
    if (!permissions || permissions.length === 0) return [] as Permission[];
    const q = deferredPermissionsSearchQuery.trim().toLowerCase();
    if (!q) return permissions as Permission[];
    const tokens = q.split(' ').filter(Boolean);
    return (permissions as Permission[]).filter((p) => {
      const blob = [
        p.permission_name,
        p.description,
        p.category,
        p.is_active ? 'active' : 'inactive'
      ].join(' ').toLowerCase();
      return tokens.every(tok => blob.includes(tok));
    });
  }, [permissions, deferredPermissionsSearchQuery]);

  // Permission options for role editing (from cached permissions)
  const permissionOptions = useMemo(() => {
    return permissions.filter(p => p.is_active).map(p => p.permission_name).sort();
  }, [permissions]);

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
    if (role.role_name?.toLowerCase() === 'admin') return 'error';
    if (role.role_name?.toLowerCase() === 'user') return 'primary';
    return 'default';
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Table': return 'primary';
      case 'DAG': return 'secondary';
      case 'Notification': return 'info';
      case 'Agentic': return 'warning';
      case 'Notification Subscription': return 'success';
      default: return 'default';
    }
  };

  // State for role dialogs
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleDeleteOpen, setRoleDeleteOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState<Partial<Role>>({ role_name: '', description: '', role_permissions: [], is_active: true, is_system_role: false });
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  // State for permission dialogs
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [permissionDeleteOpen, setPermissionDeleteOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [permissionForm, setPermissionForm] = useState<Partial<Permission>>({ permission_name: '', description: '', category: 'Table', is_active: true });
  const [permissionToDelete, setPermissionToDelete] = useState<Permission | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ============ ROLE MUTATIONS ============
  const createRoleMutation = useMutation({
    mutationFn: async (data: Partial<Role>) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const res = await fetch(buildUrl(endpoints.admin.roles.create), { method: 'POST', headers, body: JSON.stringify(data), credentials: 'include' });
      if (!res.ok) {
        if (isDevelopment) return { id: Date.now(), ...data } as Role;
        throw new Error('Failed to create role');
      }
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const previous = queryClient.getQueryData<Role[]>(['admin', 'roles']);
      const optimistic: Role = {
        id: Date.now(),
        role_name: data.role_name || 'new-role',
        description: data.description || '',
        role_permissions: data.role_permissions || [],
        is_system_role: !!data.is_system_role,
        is_active: data.is_active ?? true,
        tenant_name: data.tenant_name,
        team_name: data.team_name,
      } as Role;
      queryClient.setQueryData<Role[]>(['admin', 'roles'], (old) => old ? [...old, optimistic] : [optimistic]);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(['admin', 'roles'], ctx.previous); },
    onSuccess: () => { toast({ title: 'Success', description: 'New role has been created.' }); },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleName, data }: { roleName: string; data: Partial<Role> }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const res = await fetch(buildUrl(endpoints.admin.roles.update, roleName), { method: 'PATCH', headers, body: JSON.stringify(data), credentials: 'include' });
      if (!res.ok) {
        if (isDevelopment) return { role_name: roleName, ...data } as any;
        throw new Error('Failed to update role');
      }
      return res.json();
    },
    onMutate: async ({ roleName, data }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const previous = queryClient.getQueryData<Role[]>(['admin', 'roles']);
      queryClient.setQueryData<Role[]>(['admin', 'roles'], (old) => old ? old.map(r => r.role_name === roleName ? { ...r, ...data } as Role : r) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(['admin', 'roles'], ctx.previous); },
    onSuccess: () => { toast({ title: 'Role Updated', description: 'Role has been updated.' }); },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    }
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleName: string) => {
      const res = await fetch(`/api/v1/roles/${roleName}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        if (isDevelopment) return true;
        throw new Error('Failed to delete role');
      }
      return true;
    },
    onMutate: async (roleName: string) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'roles'] });
      const previous = queryClient.getQueryData<Role[]>(['admin', 'roles']);
      queryClient.setQueryData<Role[]>(['admin', 'roles'], (old) => old ? old.filter(r => r.role_name !== roleName) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(['admin', 'roles'], ctx.previous); },
    onSuccess: () => { toast({ title: 'Role Deleted', description: 'Role removed.' }); },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    }
  });

  // ============ PERMISSION MUTATIONS ============
  const createPermissionMutation = useMutation({
    mutationFn: async (data: Partial<Permission>) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const res = await fetch(buildUrl(endpoints.admin.permissions.create), { method: 'POST', headers, body: JSON.stringify(data), credentials: 'include' });
      if (!res.ok) {
        if (isDevelopment) return data as Permission;
        throw new Error('Failed to create permission');
      }
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'permissions'] });
      const previous = queryClient.getQueryData<Permission[]>(['admin', 'permissions']);
      const optimistic: Permission = {
        permission_name: data.permission_name || 'new-permission',
        description: data.description || '',
        category: data.category || 'Table',
        is_active: data.is_active ?? true,
      };
      queryClient.setQueryData<Permission[]>(['admin', 'permissions'], (old) => old ? [...old, optimistic] : [optimistic]);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(['admin', 'permissions'], ctx.previous); },
    onSuccess: () => { toast({ title: 'Success', description: 'Permission has been created.' }); },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] });
    }
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({ name, data }: { name: string; data: Partial<Permission> }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const res = await fetch(buildUrl(endpoints.admin.permissions.update, name), { method: 'PATCH', headers, body: JSON.stringify(data), credentials: 'include' });
      if (!res.ok) {
        if (isDevelopment) return { permission_name: name, ...data } as any;
        throw new Error('Failed to update permission');
      }
      return res.json();
    },
    onMutate: async ({ name, data }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'permissions'] });
      const previous = queryClient.getQueryData<Permission[]>(['admin', 'permissions']);
      queryClient.setQueryData<Permission[]>(['admin', 'permissions'], (old) => old ? old.map(p => p.permission_name === name ? { ...p, ...data } as Permission : p) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(['admin', 'permissions'], ctx.previous); },
    onSuccess: () => { toast({ title: 'Permission Updated', description: 'Permission has been updated.' }); },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] });
    }
  });

  const deletePermissionMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(buildUrl(endpoints.admin.permissions.delete, name), { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        if (isDevelopment) return true;
        throw new Error('Failed to delete permission');
      }
      return true;
    },
    onMutate: async (name: string) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'permissions'] });
      const previous = queryClient.getQueryData<Permission[]>(['admin', 'permissions']);
      queryClient.setQueryData<Permission[]>(['admin', 'permissions'], (old) => old ? old.filter(p => p.permission_name !== name) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(['admin', 'permissions'], ctx.previous); },
    onSuccess: () => { toast({ title: 'Permission Deleted', description: 'Permission removed.' }); },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] });
    }
  });

  // ============ ROLE HANDLERS ============
  const handleCreateRole = () => {
    setSelectedRole(null);
    setRoleForm({ role_name: '', description: '', role_permissions: [], is_active: true, is_system_role: false });
    setRoleDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    try {
      console.log('Editing role:', role);
      setSelectedRole(role);
      setRoleForm({
        role_name: role.role_name || '',
        description: role.description || '',
        role_permissions: role.role_permissions || [],
        is_active: role.is_active ?? true,
        is_system_role: role.is_system_role ?? false,
        team_name: role.is_system_role ? '' : (role.team_name || ''),
        tenant_name: role.is_system_role ? '' : (role.tenant_name || '')
      });
      setRoleDialogOpen(true);
    } catch (error) {
      console.error('Error in handleEditRole:', error, 'Role:', role);
      toast({
        title: 'Error',
        description: 'Failed to open role editor. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleSubmitRole = async () => {
    try {
      console.log('Submitting role:', { selectedRole, roleForm });
      if (selectedRole) {
        console.log('Updating role:', selectedRole.role_name, roleForm);
        await updateRoleMutation.mutateAsync({ roleName: selectedRole.role_name, data: roleForm });
      } else {
        console.log('Creating role:', roleForm);
        await createRoleMutation.mutateAsync(roleForm);
      }
      setRoleDialogOpen(false);
      setSelectedRole(null);
    } catch (error: any) {
      console.error('Error in handleSubmitRole:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save role. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleAskDeleteRole = (role: Role) => { setRoleToDelete(role); setRoleDeleteOpen(true); };

  const handleConfirmDeleteRole = async () => {
    if (!roleToDelete) return;
    try {
      console.log('Deleting role:', roleToDelete.role_name);
      await deleteRoleMutation.mutateAsync(roleToDelete.role_name);
    } catch (error: any) {
      console.error('Error deleting role:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete role. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setRoleDeleteOpen(false);
      setRoleToDelete(null);
    }
  };

  // ============ PERMISSION HANDLERS ============
  const handleCreatePermission = () => {
    setSelectedPermission(null);
    setPermissionForm({ permission_name: '', description: '', category: 'Table', is_active: true });
    setPermissionDialogOpen(true);
  };

  const handleEditPermission = (permission: Permission) => {
    try {
      setSelectedPermission(permission);
      setPermissionForm({
        permission_name: permission.permission_name || '',
        description: permission.description || '',
        category: permission.category || 'Table',
        is_active: permission.is_active ?? true,
      });
      setPermissionDialogOpen(true);
    } catch (error) {
      console.error('Error in handleEditPermission:', error);
      toast({
        title: 'Error',
        description: 'Failed to open permission editor. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleSubmitPermission = async () => {
    try {
      if (selectedPermission) {
        await updatePermissionMutation.mutateAsync({ name: selectedPermission.permission_name, data: permissionForm });
      } else {
        await createPermissionMutation.mutateAsync(permissionForm);
      }
      setPermissionDialogOpen(false);
      setSelectedPermission(null);
    } catch (error: any) {
      console.error('Error in handleSubmitPermission:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save permission. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleAskDeletePermission = (permission: Permission) => {
    setPermissionToDelete(permission);
    setPermissionDeleteOpen(true);
  };

  const handleConfirmDeletePermission = async () => {
    if (!permissionToDelete) return;
    try {
      await deletePermissionMutation.mutateAsync(permissionToDelete.permission_name);
    } catch (error: any) {
      console.error('Error deleting permission:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete permission. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setPermissionDeleteOpen(false);
      setPermissionToDelete(null);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Roles & Permissions
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage roles and permissions in the system
          </Typography>
        </Box>
      </Box>

      {/* Vertical Split: Roles (Top) | Permissions (Bottom) */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* TOP: Roles */}
        <Box>
          <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Roles ({filteredRoles.length})
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleCreateRole}
                  size="small"
                >
                  Add Role
                </Button>
              </Box>
              
              <TextField
                size="small"
                placeholder="Search roles..."
                value={rolesSearchQuery}
                onChange={(e) => setRolesSearchQuery(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: rolesSearchQuery && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setRolesSearchQuery('')} edge="end">
                        <ClearIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <Box sx={{ flexGrow: 1, overflow: 'auto', maxHeight: '600px' }}>
                <TableContainer component={Paper} elevation={0}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Role Name</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Tenant</TableCell>
                        <TableCell>Team</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Permissions</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredRoles.map((role) => {
                        const roleType = role.is_system_role 
                          ? 'System' 
                          : role.team_name 
                            ? 'Team-specific' 
                            : 'Custom';
                        
                        return (
                          <TableRow key={role.id} hover>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SecurityIcon color="primary" fontSize="small" />
                                <Typography variant="body2" fontWeight="medium">
                                  {role.role_name}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {role.description}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {role.tenant_name ? (
                                <Chip label={role.tenant_name} size="small" variant="outlined" />
                              ) : (
                                <Typography variant="body2" color="text.secondary">--</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {role.team_name ? (
                                <Chip label={role.team_name} size="small" variant="outlined" />
                              ) : (
                                <Typography variant="body2" color="text.secondary">--</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={roleType} 
                                size="small" 
                                color={role.is_system_role ? 'primary' : 'default'}
                                variant={role.is_system_role ? 'filled' : 'outlined'}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={`${(role.role_permissions || []).length} permissions`} 
                                size="small" 
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={role.is_active ? 'Active' : 'Inactive'} 
                                size="small" 
                                color={role.is_active ? 'success' : 'default'}
                                variant={role.is_active ? 'filled' : 'outlined'}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                <Tooltip title="Edit Role">
                                  <IconButton size="small" color="primary" onClick={() => handleEditRole(role)}>
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete Role">
                                  <IconButton size="small" color="error" onClick={() => handleAskDeleteRole(role)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* BOTTOM: Permissions */}
        <Box>
          <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Permissions ({filteredPermissions.length})
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleCreatePermission}
                  size="small"
                >
                  Add Permission
                </Button>
              </Box>
              
              <TextField
                size="small"
                placeholder="Search permissions..."
                value={permissionsSearchQuery}
                onChange={(e) => setPermissionsSearchQuery(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: permissionsSearchQuery && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setPermissionsSearchQuery('')} edge="end">
                        <ClearIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <Box sx={{ flexGrow: 1, overflow: 'auto', maxHeight: '600px' }}>
                <TableContainer component={Paper} elevation={0}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Permission</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredPermissions.map((permission) => (
                        <TableRow key={permission.permission_name} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <PermissionIcon color="secondary" fontSize="small" />
                              <Box>
                                <Typography variant="body2" fontWeight="medium">
                                  {permission.permission_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {permission.description}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={permission.category} 
                              size="small" 
                              color={getCategoryColor(permission.category) as any}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={permission.is_active ? 'Active' : 'Inactive'} 
                              size="small" 
                              color={permission.is_active ? 'success' : 'default'}
                              variant={permission.is_active ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Tooltip title="Edit Permission">
                                <IconButton size="small" color="primary" onClick={() => handleEditPermission(permission)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Permission">
                                <IconButton size="small" color="error" onClick={() => handleAskDeletePermission(permission)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Role Dialog */}
      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField 
              label="Role Name" 
              value={roleForm.role_name || ''} 
              onChange={(e) => setRoleForm({ ...roleForm, role_name: e.target.value })} 
              required 
              fullWidth 
            />
            <TextField 
              label="Description" 
              value={roleForm.description || ''} 
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} 
              fullWidth 
              multiline 
              rows={3} 
            />
            <FormControlLabel 
              control={
                <Switch 
                  checked={!!roleForm.is_system_role} 
                  onChange={(e) => {
                    const isSystem = e.target.checked;
                    setRoleForm({ ...roleForm, is_system_role: isSystem, tenant_name: isSystem ? '' : (roleForm.tenant_name || ''), team_name: isSystem ? '' : (roleForm.team_name || '') });
                  }} 
                />
              } 
              label="System Role" 
            />
            {!roleForm.is_system_role && (
              <>
                <FormControl fullWidth required>
                  <InputLabel>Tenant</InputLabel>
                  <Select
                    label="Tenant"
                    value={roleForm.tenant_name || ''}
                    onChange={(e) => setRoleForm({ ...roleForm, tenant_name: e.target.value as string })}
                  >
                    {tenants.map((t: any) => (
                      <MenuItem key={t.id} value={t.name}>{t.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth required>
                  <InputLabel>Team</InputLabel>
                  <Select
                    label="Team"
                    value={roleForm.team_name || ''}
                    onChange={(e) => setRoleForm({ ...roleForm, team_name: e.target.value as string })}
                  >
                    {teams.map((tm: any) => (
                      <MenuItem key={tm.id} value={tm.name}>{tm.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            )}
            <Autocomplete
              multiple
              options={permissionOptions}
              value={(roleForm.role_permissions || []) as string[]}
              onChange={(_e, newValue) => {
                const cleaned = (newValue || []).map(v => (typeof v === 'string' ? v : String(v))).map(s => s.trim()).filter(Boolean);
                setRoleForm({ ...roleForm, role_permissions: cleaned });
              }}
              renderTags={(value: readonly string[], getTagProps) =>
                value.map((option: string, index: number) => (
                  <Chip variant="outlined" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />
                ))
              }
              renderInput={(params) => (
                <TextField {...params} label="Permissions" placeholder="Select permissions" />
              )}
            />
            <FormControlLabel 
              control={
                <Switch 
                  checked={!!roleForm.is_active} 
                  onChange={(e) => setRoleForm({ ...roleForm, is_active: e.target.checked })} 
                />
              } 
              label="Active" 
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmitRole}
            variant="contained"
            disabled={
              !roleForm.role_name ||
              (!roleForm.is_system_role && (!roleForm.tenant_name || !roleForm.team_name))
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Role Delete Confirmation */}
      <Dialog open={roleDeleteOpen} onClose={() => setRoleDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Role</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Are you sure you want to delete "{roleToDelete?.role_name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDeleteOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDeleteRole} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Permission Dialog */}
      <Dialog open={permissionDialogOpen} onClose={() => setPermissionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedPermission ? 'Edit Permission' : 'Create New Permission'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField 
              label="Permission Name" 
              value={permissionForm.permission_name || ''} 
              onChange={(e) => setPermissionForm({ ...permissionForm, permission_name: e.target.value })} 
              required 
              fullWidth 
              disabled={!!selectedPermission}
              helperText={selectedPermission ? "Permission name cannot be changed" : ""}
            />
            <TextField 
              label="Description" 
              value={permissionForm.description || ''} 
              onChange={(e) => setPermissionForm({ ...permissionForm, description: e.target.value })} 
              fullWidth 
              multiline 
              rows={3} 
            />
            <FormControl fullWidth required>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={permissionForm.category || 'Table'}
                onChange={(e) => setPermissionForm({ ...permissionForm, category: e.target.value as any })}
              >
                <MenuItem value="Table">Table</MenuItem>
                <MenuItem value="DAG">DAG</MenuItem>
                <MenuItem value="Notification">Notification</MenuItem>
                <MenuItem value="Agentic">Agentic</MenuItem>
                <MenuItem value="Notification Subscription">Notification Subscription</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel 
              control={
                <Switch 
                  checked={!!permissionForm.is_active} 
                  onChange={(e) => setPermissionForm({ ...permissionForm, is_active: e.target.checked })} 
                />
              } 
              label="Active" 
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermissionDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmitPermission}
            variant="contained"
            disabled={!permissionForm.permission_name || !permissionForm.category}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permission Delete Confirmation */}
      <Dialog open={permissionDeleteOpen} onClose={() => setPermissionDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Permission</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Are you sure you want to delete "{permissionToDelete?.permission_name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermissionDeleteOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDeletePermission} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RolesManagement;
