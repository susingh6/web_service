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
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { apiRequest, getQueryFn } from '@/lib/queryClient';

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
        <Button onClick={handleSubmit} variant="contained">
          {tenant ? 'Update' : 'Create'}
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

  // Fetch tenants with real API
  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['/api/admin/tenants'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  // Create tenant mutation with optimistic updates and race condition prevention
  const createTenantMutation = useMutation({
    mutationFn: async (tenantData: any) => {
      const response = await apiRequest('POST', buildUrl(endpoints.admin.tenants.create), tenantData);
      return await response.json();
    },
    onMutate: async (newTenantData) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ['/api/admin/tenants'] });
      await queryClient.cancelQueries({ queryKey: ['/api/tenants'] });
      
      // Snapshot the previous value for rollback
      const previousAdminTenants = queryClient.getQueryData(['/api/admin/tenants']);
      const previousMainTenants = queryClient.getQueryData(['/api/tenants']);
      
      // Optimistically update to new value
      const tempId = Date.now(); // Temporary ID for optimistic update
      const optimisticTenant = {
        id: tempId,
        name: newTenantData.name,
        description: newTenantData.description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        teamsCount: 0
      };
      
      // Update admin tenant list
      if (previousAdminTenants) {
        queryClient.setQueryData(['/api/admin/tenants'], [
          ...(previousAdminTenants as any[]),
          optimisticTenant
        ]);
      }
      
      // Update main app tenant list
      if (previousMainTenants) {
        queryClient.setQueryData(['/api/tenants'], [
          ...(previousMainTenants as any[]),
          { id: tempId, name: optimisticTenant.name, description: optimisticTenant.description }
        ]);
      }
      
      // Return context object with the snapshots
      return { previousAdminTenants, previousMainTenants, tempId };
    },
    onError: (err, newTenantData, context) => {
      // Rollback to previous state on error
      if (context?.previousAdminTenants) {
        queryClient.setQueryData(['/api/admin/tenants'], context.previousAdminTenants);
      }
      if (context?.previousMainTenants) {
        queryClient.setQueryData(['/api/tenants'], context.previousMainTenants);
      }
      
      toast({
        title: "Creation Failed",
        description: "Failed to create tenant. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (data, variables, context) => {
      // Replace optimistic update with real data
      const currentAdminTenants = queryClient.getQueryData(['/api/admin/tenants']) as any[];
      const currentMainTenants = queryClient.getQueryData(['/api/tenants']) as any[];
      
      if (currentAdminTenants && context?.tempId) {
        const updatedAdminTenants = currentAdminTenants.map(tenant => 
          tenant.id === context.tempId ? data : tenant
        );
        queryClient.setQueryData(['/api/admin/tenants'], updatedAdminTenants);
      }
      
      if (currentMainTenants && context?.tempId) {
        const updatedMainTenants = currentMainTenants.map(tenant => 
          tenant.id === context.tempId ? { id: data.id, name: data.name, description: data.description } : tenant
        );
        queryClient.setQueryData(['/api/tenants'], updatedMainTenants);
      }
      
      // Invalidate to ensure fresh data (but optimistic update already visible)
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      
      toast({
        title: "Tenant Created",
        description: "New tenant has been successfully created.",
      });
    },
  });

  // Update tenant mutation
  const updateTenantMutation = useMutation({
    mutationFn: async ({ tenantId, tenantData }: { tenantId: number; tenantData: any }) => {
      const response = await apiRequest('PUT', buildUrl(endpoints.admin.tenants.update, tenantId), tenantData);
      return await response.json();
    },
    onSuccess: () => {
      // Invalidate all tenant-related caches so updated tenant appears everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] }); // Admin section
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });       // Main app filters
      toast({
        title: "Tenant Updated",
        description: "Tenant has been successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update tenant. Please try again.",
        variant: "destructive",
      });
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
                {tenants.map((tenant) => (
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