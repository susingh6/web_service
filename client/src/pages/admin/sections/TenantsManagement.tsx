import { useState, useEffect } from 'react';
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
  Paper,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Business as BusinessIcon,
  Groups as TeamsIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateAdminCaches } from '@/lib/cacheKeys';
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { tenantsApi } from '@/features/sla/api';
// Removed custom optimistic wrapper in favor of native React Query mutations

interface Tenant {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  teamsCount: number;
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
    isActive: tenant?.isActive ?? true,
  });

  // Update form data when tenant prop changes
  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name || '',
        description: tenant.description || '',
        isActive: tenant.isActive ?? true,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        isActive: true,
      });
    }
  }, [tenant]);

  const handleSubmit = () => {
    onSubmit(formData);
    onClose();
    setFormData({ name: '', description: '', isActive: true });
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Create tenant with React Query onMutate/onError/onSettled
  const createTenantMutation = useMutation({
    mutationFn: async (tenantData: any) => {
      return await tenantsApi.create(tenantData);
    },
    onMutate: async (tenantData: any) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'tenants'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'tenants']);
      const optimisticId = Date.now();
      const optimisticTenant = {
        ...tenantData,
        id: optimisticId,
        createdAt: new Date().toISOString(),
        teamsCount: 0,
        isActive: tenantData.isActive ?? true,
      };
      queryClient.setQueryData<any[]>(['admin', 'tenants'], (old) => old ? [...old, optimisticTenant] : [optimisticTenant]);
      return { previous, optimisticId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['admin', 'tenants'], ctx.previous);
      }
      toast({ title: 'Creation Failed', description: 'Failed to create tenant. Please try again.', variant: 'destructive' });
    },
    onSuccess: (result, _vars, ctx) => {
      if (result && ctx?.optimisticId) {
        queryClient.setQueryData<any[]>(['admin', 'tenants'], (old) => {
          if (!old) return [result];
          return old.map(t => t.id === ctx.optimisticId ? result : t);
        });
      }
      toast({ title: 'Tenant Created', description: 'New tenant has been successfully created.' });
    },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ tenantId, tenantData }: { tenantId: number; tenantData: any }) => {
      return await tenantsApi.update(tenantId, tenantData);
    },
    onMutate: async ({ tenantId, tenantData }) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'tenants'] });
      const previous = queryClient.getQueryData<any[]>(['admin', 'tenants']);
      queryClient.setQueryData<any[]>(['admin', 'tenants'], (old) => {
        if (!old) return [] as any[];
        return old.map(tenant => tenant.id === tenantId ? { ...tenant, ...tenantData } : tenant);
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin', 'tenants'], ctx.previous);
      toast({ title: 'Update Failed', description: 'Failed to update tenant. Please try again.', variant: 'destructive' });
    },
    onSuccess: () => {
      toast({ title: 'Tenant Updated', description: 'Tenant has been successfully updated.' });
    },
    onSettled: async () => {
      await invalidateAdminCaches(queryClient);
    },
  });

  const handleCreateTenant = () => {
    setSelectedTenant(null);
    setDialogOpen(true);
  };

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setDialogOpen(true);
  };

  const handleSubmitTenant = (tenantData: any) => {
    if (selectedTenant) {
      updateTenantMutation.mutate({ tenantId: selectedTenant.id, tenantData });
    } else {
      createTenantMutation.mutate(tenantData);
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
          onClick={handleCreateTenant}
        >
          New Tenant
        </Button>
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            All Tenants ({tenants.length})
          </Typography>
          
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tenant Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Teams</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tenants.map((tenant: Tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon color="primary" />
                        <Typography variant="body2" fontWeight="medium">
                          {tenant.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {tenant.description || 'No description'}
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
                      <Typography variant="body2">
                        {new Date(tenant.createdAt).toLocaleDateString()}
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