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
  Clear as ClearIcon
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

const RolesManagement = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
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

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const mock: Role[] = [
        // System roles don't have team_name and tenant_name
        { id: 1, role_name: 'sla-admin', description: 'Admin role', role_permissions: ['admin'], is_system_role: true, is_active: true, userCount: 3 },
        { id: 2, role_name: 'sla-dag-entity-editor', description: 'DAG Entity Editor role', role_permissions: ['dag-status-editor', 'dag-sla-editor', 'dag-progress-editor', 'viewer'], is_system_role: true, is_active: true, userCount: 12 },
        { id: 3, role_name: 'sla-table-entity-editor', description: 'Table Entity Editor role', role_permissions: ['table-status-editor', 'table-sla-editor', 'table-progress-editor', 'viewer'], is_system_role: true, is_active: true, userCount: 10 },
        { id: 4, role_name: 'sla-viewer', description: 'Viewer role', role_permissions: ['viewer'], is_system_role: true, is_active: true, userCount: 8 },
        // Non-system role example for Data Engineering / PGM
        { id: 5, role_name: 'sla-pgm-dag-entity-editor', description: 'PGM DAG Entity Editor', tenant_name: 'Data Engineering', team_name: 'PGM', role_permissions: ['dag-status-editor', 'dag-sla-editor', 'dag-progress-editor', 'viewer'], is_system_role: false, is_active: true, userCount: 2 },
      ];
      return mock;
    },
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const filteredRoles = useMemo(() => {
    if (!roles || roles.length === 0) return [] as Role[];
    const q = deferredSearchQuery.trim().toLowerCase();
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
  }, [roles, deferredSearchQuery]);

  // Unique permission list sourced from cached roles (6h cache)
  const permissionOptions = useMemo(() => {
    const set = new Set<string>();
    (roles as Role[]).forEach(r => (r.role_permissions || []).forEach(p => set.add(p)));
    return Array.from(set).sort();
  }, [roles]);

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

  // State for dialogs and selection
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState<Partial<Role>>({ role_name: '', description: '', role_permissions: [], is_active: true, is_system_role: false });
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create role (optimistic)
  const createRoleMutation = useMutation({
    mutationFn: async (data: Partial<Role>) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const res = await fetch(buildUrl(endpoints.admin.roles.create), { method: 'POST', headers, body: JSON.stringify(data), credentials: 'include' });
      if (!res.ok) {
        if (isDevelopment) {
          return { id: Date.now(), ...data } as Role;
        }
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
    onSuccess: () => { toast({ title: 'Role Created', description: 'New role has been created.' }); },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
      // Always invalidate to ensure changes persist (even in development)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    }
  });

  // Update role (optimistic), includes Active toggle (soft delete)
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
      if (!isDevelopment) {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      }
    }
  });

  // Hard delete (DELETE)
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleName: string) => {
      const res = await fetch(buildUrl(endpoints.admin.roles.delete, roleName), { method: 'DELETE', credentials: 'include' });
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
      if (!isDevelopment) {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      }
    }
  });

  const handleCreate = () => {
    setSelectedRole(null);
    setRoleForm({ role_name: '', description: '', role_permissions: [], is_active: true, is_system_role: false });
    setDialogOpen(true);
  };
  const handleEdit = (role: Role) => {
    try {
      console.log('Editing role:', role);
      setSelectedRole(role);
      setRoleForm({
        role_name: role.role_name || '',
        description: role.description || '',
        role_permissions: role.role_permissions || [],
        is_active: role.is_active ?? true,
        is_system_role: role.is_system_role ?? false,
        // System roles don't have team_name and tenant_name
        team_name: role.is_system_role ? '' : (role.team_name || ''),
        tenant_name: role.is_system_role ? '' : (role.tenant_name || '')
      });
      setDialogOpen(true);
    } catch (error) {
      console.error('Error in handleEdit:', error, 'Role:', role);
      toast({
        title: 'Error',
        description: 'Failed to open role editor. Please try again.',
        variant: 'destructive'
      });
    }
  };
  const handleSubmit = async () => {
    try {
      console.log('Submitting role:', { selectedRole, roleForm });
      if (selectedRole) {
        console.log('Updating role:', selectedRole.role_name, roleForm);
        await updateRoleMutation.mutateAsync({ roleName: selectedRole.role_name, data: roleForm });
      } else {
        console.log('Creating role:', roleForm);
        await createRoleMutation.mutateAsync(roleForm);
      }
      setDialogOpen(false);
      setSelectedRole(null);
    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save role. Please try again.',
        variant: 'destructive'
      });
    }
  };
  const handleAskDelete = (role: Role) => { setRoleToDelete(role); setDeleteOpen(true); };
  const handleConfirmDelete = async () => {
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
      setDeleteOpen(false);
      setRoleToDelete(null);
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
            Manage roles and their associated permissions
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
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
                  <TableCell>Tenant</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell>Status</TableCell>
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
                      <Chip label={role.tenant_name || '—'} size="small" variant="outlined" color={role.tenant_name ? 'primary' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip label={role.team_name || '—'} size="small" variant="outlined" color={role.team_name ? 'secondary' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={role.is_system_role ? 'System' : 'Team-specific'} 
                        size="small" 
                        color={role.is_system_role ? 'primary' : 'default'}
                        variant={role.is_system_role ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip 
                        title={
                          <List dense>
                            {(role.role_permissions || []).map((permission) => (
                              <ListItem key={permission as string}>
                                <ListItemIcon>
                                  <CheckIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText primary={permission as string} />
                              </ListItem>
                            ))}
                          </List>
                        }
                        arrow
                      >
                        <Chip 
                          label={`${(role.role_permissions || []).length} permissions`} 
                          size="small" 
                          variant="outlined"
                          color={getRoleColor(role) as any}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={role.status === 'active' ? 'Active' : role.status === 'inactive' ? 'Inactive' : 'Active'} 
                        size="small" 
                        color={role.status === 'active' ? 'success' : role.status === 'inactive' ? 'default' : 'success'}
                        variant={role.status === 'active' ? 'filled' : role.status === 'inactive' ? 'outlined' : 'filled'}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title={'Edit Role'}>
                          <span>
                            <IconButton size="small" color="primary" onClick={() => handleEdit(role)}>
                              <EditIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete Role">
                          <IconButton size="small" color="error" onClick={() => handleAskDelete(role)}>
                            <DeleteIcon />
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

      {/* Create/Edit Role Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label="Role Name" value={roleForm.role_name || ''} onChange={(e) => setRoleForm({ ...roleForm, role_name: e.target.value })} required fullWidth />
            <TextField label="Description" value={roleForm.description || ''} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} fullWidth multiline rows={3} />
            <FormControlLabel control={<Switch checked={!!roleForm.is_system_role} onChange={(e) => {
              const isSystem = e.target.checked;
              setRoleForm({ ...roleForm, is_system_role: isSystem, tenant_name: isSystem ? '' : (roleForm.tenant_name || ''), team_name: isSystem ? '' : (roleForm.team_name || '') });
            }} />} label="System Role" />
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
              freeSolo
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
                <TextField {...params} label="Permissions" placeholder="Type to add or select" />
              )}
            />
            <FormControlLabel control={<Switch checked={!!roleForm.is_active} onChange={(e) => setRoleForm({ ...roleForm, is_active: e.target.checked })} />} label="Active" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
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

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Role</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Are you sure you want to delete "{roleToDelete?.role_name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>

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