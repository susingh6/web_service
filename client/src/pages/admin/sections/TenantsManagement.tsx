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
  Paper,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel
} from '@mui/material';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Business as BusinessIcon,
  Groups as TeamsIcon
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminMutation } from '@/utils/cache-management';
import { cacheKeys, invalidateAdminCaches } from '@/lib/cacheKeys';
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { tenantsApi } from '@/features/sla/api';
import { Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material';
import { formatDate } from '@/lib/utils';
// Removed custom optimistic wrapper in favor of native React Query mutations

interface Tenant {
  id: number;
  name: string;
  description?: string;
  email?: string;
  isActive: boolean;
  teamsCount: number;
  actionByUserEmail?: string;
  createdAt: string;
}

interface TenantFormDialogProps {
  open: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onSubmit: (tenantData: any) => void;
}

const TenantFormDialog = ({ open, onClose, tenant, onSubmit }: TenantFormDialogProps) => {
  const [formData, setFormData] = useState({
    name: tenant?.name || '',
    description: tenant?.description || '',
    email: tenant?.email || '',
    isActive: tenant?.isActive ?? true,
  });

  // Update form data when tenant prop changes
  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name || '',
        description: tenant.description || '',
        email: tenant.email || '',
        isActive: tenant.isActive ?? true,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        email: '',
        isActive: true,
      });
    }
  }, [tenant]);

  const handleSubmit = () => {
    if (tenant) {
      // Edit mode: always send mandatory fields
      const cleanedData: any = {
        // Mandatory fields - always send them
        name: formData.name,
        isActive: formData.isActive,
      };
      
      // Only include non-mandatory fields if they changed
      const originalDesc = tenant.description || '';
      const currentDesc = formData.description?.trim() || '';
      if (currentDesc !== originalDesc) {
        cleanedData.description = currentDesc || null;
      }
      
      const originalEmail = tenant.email || '';
      const currentEmail = formData.email?.trim() || '';
      if (currentEmail !== originalEmail) {
        cleanedData.email = currentEmail || null;
      }
      
      onSubmit(cleanedData);
    } else {
      // Create mode: send all fields
      const cleanedData = {
        name: formData.name,
        description: formData.description?.trim() || null,
        email: formData.email?.trim() || null,
        isActive: formData.isActive,
      };
      onSubmit(cleanedData);
    }
    
    onClose();
    setFormData({ name: '', description: '', email: '', isActive: true });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {tenant ? 'Edit Tenant' : 'Create New Tenant'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            label="Tenant Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="e.g., Data Engineering, Marketing Analytics"
          />
          
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this tenant organization"
          />
          
          <TextField
            fullWidth
            label="Tenant Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="e.g., data-team@company.com"
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
            }
            label="Active Tenant"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!formData.name}
        >
          {tenant ? 'Update Tenant' : 'Create Tenant'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const TenantsManagement = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { createTenant, updateTenant } = useAdminMutation();
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Fetch ALL tenants for admin (not just active ones)
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
    staleTime: 6 * 60 * 60 * 1000, // Cache for 6 hours
    gcTime: 6 * 60 * 60 * 1000,    // Keep in memory for 6 hours
    queryFn: async () => {
      // Use environment-aware tenant API (admin needs all tenants, not just active)
      return await tenantsApi.getAll(false); // active_only=false for admin
    },
  });

  // Search filter (case-insensitive, tokenized AND match)
  const filteredTenants = useMemo(() => {
    if (!tenants || tenants.length === 0) return [] as Tenant[];
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return tenants as Tenant[];
    const tokens = q.split(' ').filter(Boolean);
    return (tenants as Tenant[]).filter((t) => {
      const blob = [
        t.name,
        t.description || '',
        String(t.teamsCount),
        t.isActive ? 'active' : 'inactive',
      ].join(' ').toLowerCase();
      return tokens.every(tok => blob.includes(tok));
    });
  }, [tenants, deferredSearchQuery]);

  // Modern cache-managed tenant creation
  const handleCreateTenant = async (tenantData: any) => {
    try {
      // Fetch OAuth user email
      const response = await fetch(buildUrl(endpoints.profile.getCurrent), {
        credentials: 'include'
      });
      const userProfile = response.ok ? await response.json() : null;
      
      // Transform to new field names (tenantData already has nulls from handleSubmit)
      const payload = {
        tenant_name: tenantData.name,
        tenant_description: tenantData.description,
        tenant_email: tenantData.email,
        is_active: tenantData.isActive ?? true,
        action_by_user_email: userProfile?.user_email || null,
      };
      
      await createTenant(payload);
      toast({ title: 'Success', description: 'New tenant has been successfully created.' });
      setDialogOpen(false);
    } catch (error: any) {
      const raw = error?.message || 'Failed to create tenant. Please try again.';
      let msg = raw;
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { const j = JSON.parse(raw); if (j?.message) msg = j.message; } catch {}
      }
      toast({ title: 'Creation Failed', description: msg, variant: 'destructive' });
    }
  };

  // Modern cache-managed tenant update
  const handleUpdateTenant = async (tenantId: number, tenantData: any) => {
    try {
      // Fetch OAuth user email
      const response = await fetch(buildUrl(endpoints.profile.getCurrent), {
        credentials: 'include'
      });
      const userProfile = response.ok ? await response.json() : null;
      
      // Transform to new field names
      // Send empty string ("") if user cleared the field (to explicitly clear it)
      // Mandatory fields are always included
      const payload: any = {
        // Mandatory fields - always send them
        tenant_name: tenantData.name,
        is_active: tenantData.isActive ?? true,
        action_by_user_email: userProfile?.user_email || null,
      };
      
      if (tenantData.description !== undefined) {
        // Empty string or whitespace-only means user wants to clear it
        payload.tenant_description = tenantData.description === null || tenantData.description?.trim() === '' 
          ? '' 
          : tenantData.description;
      }
      
      if (tenantData.email !== undefined) {
        // Empty string or whitespace-only means user wants to clear it
        payload.tenant_email = tenantData.email === null || tenantData.email?.trim() === '' 
          ? '' 
          : tenantData.email;
      }
      
      await updateTenant(tenantId, payload);
      toast({ title: 'Tenant Updated', description: 'Tenant has been successfully updated.' });
      setDialogOpen(false);

      // If tenant name changed, emit global event so Summary/Team dashboards can refetch immediately
      if (tenantData?.name) {
        window.dispatchEvent(new CustomEvent('admin-tenants-updated', {
          detail: { tenantId, newName: tenantData.name }
        }));
      }
    } catch (error: any) {
      const raw = error?.message || 'Failed to update tenant. Please try again.';
      let msg = raw;
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { const j = JSON.parse(raw); if (j?.message) msg = j.message; } catch {}
      }
      toast({ title: 'Update Failed', description: msg, variant: 'destructive' });
    }
  };

  const handleCreateTenantDialog = () => {
    setSelectedTenant(null);
    setDialogOpen(true);
  };

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setDialogOpen(true);
  };

  const handleSubmitTenant = async (tenantData: any) => {
    if (selectedTenant) {
      await handleUpdateTenant(selectedTenant.id, tenantData);
    } else {
      await handleCreateTenant(tenantData);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Tenants Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage tenant organizations and their access
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateTenantDialog}
        >
          New Tenant
        </Button>
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              All Tenants ({filteredTenants.length})
            </Typography>
            <TextField
              size="small"
              placeholder="Search tenants..."
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
                  <TableCell>Tenant Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Teams</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Action By</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTenants.map((tenant: Tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon color="primary" />
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {tenant.name}
                          </Typography>
                          {tenant.description && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {tenant.description}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {tenant.email || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TeamsIcon color="action" fontSize="small" />
                        <Typography variant="body2">
                          {tenant.teamsCount} teams
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={tenant.isActive ? 'Active' : 'Inactive'} 
                        size="small" 
                        color={tenant.isActive ? 'success' : 'default'}
                        variant={tenant.isActive ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {tenant.actionByUserEmail || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(tenant.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Edit Tenant">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleEditTenant(tenant)}
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

      <TenantFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        tenant={selectedTenant}
        onSubmit={handleSubmitTenant}
      />
    </Box>
  );
};

export default TenantsManagement;