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
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { useOptimisticMutation } from '@/utils/cache-management';

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
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();

  // Fetch tenants from admin endpoint with FastAPI headers
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
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
      
      const response = await fetch(buildUrl(endpoints.admin.tenants.getAll), {
        cache: 'no-store',
        headers,
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch tenants');
      }
      return response.json();
    },
  });

  // Create tenant mutation with optimistic updates following FastAPI pattern
  const createTenant = async (tenantData: any) => {
    // Generate optimistic ID for tracking
    const optimisticId = Date.now();
    const optimisticTenant = { 
      ...tenantData, 
      id: optimisticId,
      createdAt: new Date().toISOString(),
      teamsCount: 0,
      isActive: tenantData.isActive ?? true
    };
    
    try {
      const result = await executeWithOptimism({
        optimisticUpdate: {
          queryKey: ['admin', 'tenants'],
          updater: (old: any[] | undefined) => old ? [...old, optimisticTenant] : [optimisticTenant],
        },
        mutationFn: async () => {
          // Build headers with session ID for RBAC enforcement
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          
          // CRITICAL: Add X-Session-ID header for FastAPI RBAC
          const sessionId = localStorage.getItem('fastapi_session_id');
          if (sessionId) {
            headers['X-Session-ID'] = sessionId;
          }
          
          const response = await fetch(buildUrl(endpoints.admin.tenants.create), {
            method: 'POST',
            headers,
            body: JSON.stringify(tenantData),
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to create tenant');
          return response.json();
        },
        // Use generic invalidation since tenants don't have specific scenarios yet
        invalidationScenario: undefined,
        rollbackKeys: [['admin', 'tenants']],
      });

      // Replace optimistic entry with real server response
      if (result) {
        cacheManager.setOptimisticData(['admin', 'tenants'], (old: any[] | undefined) => {
          if (!old) return [result];
          return old.map(tenant => tenant.id === optimisticId ? result : tenant);
        });
      }

      toast({
        title: "Tenant Created",
        description: "New tenant has been successfully created.",
      });
      
      return result;
    } catch (error: any) {
      let errorMessage = "Failed to create tenant. Please try again.";
      let errorTitle = "Creation Failed";

      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.status === 409) {
        errorMessage = "Tenant name already exists. Please choose a different name.";
        errorTitle = "Name Already Exists";
      } else if (error?.status === 400) {
        errorMessage = "Invalid tenant data provided. Please check your input.";
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

  const createTenantMutation = useMutation({
    mutationFn: createTenant,
  });

  // Update tenant mutation with optimistic updates following FastAPI pattern
  const updateTenant = async (tenantId: number, tenantData: any) => {
    try {
      const result = await executeWithOptimism({
        optimisticUpdate: {
          queryKey: ['admin', 'tenants'],
          updater: (old: any[] | undefined) => {
            if (!old) return [];
            return old.map(tenant => 
              tenant.id === tenantId 
                ? { ...tenant, ...tenantData }
                : tenant
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
          
          const response = await fetch(buildUrl(endpoints.admin.tenants.update, tenantId), {
            method: 'PUT',
            headers,
            body: JSON.stringify(tenantData),
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to update tenant');
          return response.json();
        },
        // Use generic invalidation since tenants don't have specific scenarios yet
        invalidationScenario: undefined,
        rollbackKeys: [['admin', 'tenants']],
      });

      toast({
        title: "Tenant Updated",
        description: "Tenant has been successfully updated.",
      });
      
      return result;
    } catch (error: any) {
      let errorMessage = "Failed to update tenant. Please try again.";
      let errorTitle = "Update Failed";

      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.status === 404) {
        errorMessage = "Tenant not found. It may have been deleted by another user.";
        errorTitle = "Tenant Not Found";
      } else if (error?.status === 409) {
        errorMessage = "Tenant name already exists. Please choose a different name.";
        errorTitle = "Name Already Exists";
      } else if (error?.status === 400) {
        errorMessage = "Invalid tenant data provided. Please check your input.";
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

  const updateTenantMutation = useMutation({
    mutationFn: ({ tenantId, tenantData }: { tenantId: number; tenantData: any }) => 
      updateTenant(tenantId, tenantData),
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