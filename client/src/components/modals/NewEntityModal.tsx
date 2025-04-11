import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography, Button, Stack, Paper } from '@mui/material';
import FormModal from '@/components/ui/form-modal';
import { 
  FormTextField, 
  FormSelect, 
  FormSwitch, 
  FormAutocomplete,
  FormSection 
} from '@/components/ui/form-fields';
import { 
  entitySchema, 
  tableEntitySchema, 
  dagEntitySchema,
  entityTypes,
  notificationTypes,
  type Entity
} from '@/features/sla/schemas';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface NewEntityModalProps {
  open: boolean;
  onClose: () => void;
  teams: { id: number; name: string }[];
}

/**
 * Improved entity modal using standardized form components
 */
const NewEntityModal = ({ open, onClose, teams }: NewEntityModalProps) => {
  const [activeTab, setActiveTab] = useState<'table' | 'dag'>('table');
  const [serverError, setServerError] = useState<string | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form submission handler
  const createEntityMutation = useMutation({
    mutationFn: async (data: Entity) => {
      const response = await apiRequest('POST', '/api/entities', data);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      toast({
        title: 'Success',
        description: 'Entity created successfully',
        variant: 'default',
      });
      onClose();
    },
    onError: (error: any) => {
      setServerError(error.message || 'Failed to create entity');
      toast({
        title: 'Error',
        description: error.message || 'Failed to create entity',
        variant: 'destructive',
      });
    },
  });
  
  // Handler for form submission
  const handleSubmit = async (data: Entity) => {
    await createEntityMutation.mutateAsync(data);
  };
  
  // Convert teams to options format
  const teamOptions = teams.map(team => ({
    value: team.id,
    label: team.name,
  }));
  
  // Convert notification types to options format
  const notificationOptions = notificationTypes.map(type => ({
    value: type,
    label: type.charAt(0).toUpperCase() + type.slice(1), // Capitalize
  }));
  
  // Get active schema based on tab
  const activeSchema = activeTab === 'table' ? tableEntitySchema : dagEntitySchema;
  
  // Default values for the form
  const defaultValues = {
    type: activeTab,
    isActive: true,
    notificationPreferences: ['email'],
    tags: [],
  };
  
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Add New Entity"
      schema={activeSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      serverError={serverError}
      isSubmitting={createEntityMutation.isPending}
      maxWidth="md"
    >
      {/* Entity Type Tabs */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            label="Table"
            value="table"
            sx={{
              fontWeight: 500,
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 },
            }}
          />
          <Tab
            label="DAG"
            value="dag"
            sx={{
              fontWeight: 500,
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 },
            }}
          />
        </Tabs>
      </Paper>
      
      {/* Basic Information Section */}
      <FormSection title="Basic Information">
        <FormTextField
          name="name"
          label="Entity Name"
          required
        />
        
        <FormTextField
          name="description"
          label="Description"
          multiline
          rows={2}
        />
        
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box flex={1}>
            <FormSelect
              name="teamId"
              label="Team"
              options={teamOptions}
              required
            />
          </Box>
          <Box flex={1}>
            <FormTextField
              name="tenant"
              label="Tenant"
              required
            />
          </Box>
        </Stack>
      </FormSection>
      
      {/* Owner Information Section */}
      <FormSection title="Owner Information">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box flex={1}>
            <FormTextField
              name="owner"
              label="Owner Name"
              required
            />
          </Box>
          <Box flex={1}>
            <FormTextField
              name="ownerEmail"
              label="Owner Email"
              type="email"
              required
            />
          </Box>
        </Stack>
      </FormSection>
      
      {/* Entity Type Specific Fields */}
      {activeTab === 'table' ? (
        <FormSection title="Table Configuration">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box flex={1}>
              <FormTextField
                name="schema"
                label="Schema Name"
                required
              />
            </Box>
            <Box flex={1}>
              <FormTextField
                name="table"
                label="Table Name"
                required
              />
            </Box>
          </Stack>
          
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box flex={1}>
              <FormTextField
                name="donemarkerLocation"
                label="Donemarker Location"
                required
              />
            </Box>
            <Box flex={1}>
              <FormTextField
                name="donemarkerLookbackHours"
                label="Donemarker Lookback Hours"
                type="number"
                required
              />
            </Box>
          </Stack>
          
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box flex={1}>
              <FormTextField
                name="minRowCount"
                label="Minimum Row Count"
                type="number"
              />
            </Box>
            <Box flex={1}>
              <FormTextField
                name="refreshSchedule"
                label="Refresh Schedule"
              />
            </Box>
          </Stack>
        </FormSection>
      ) : (
        <FormSection title="DAG Configuration">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box flex={1}>
              <FormTextField
                name="dagId"
                label="DAG ID"
                required
              />
            </Box>
            <Box flex={1}>
              <FormTextField
                name="schedule"
                label="Schedule (CRON)"
                required
              />
            </Box>
          </Stack>
          
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box flex={1}>
              <FormTextField
                name="expectedRuntime"
                label="Expected Runtime (minutes)"
                type="number"
                required
              />
            </Box>
            <Box flex={1}>
              <FormTextField
                name="airflowInstance"
                label="Airflow Instance"
                required
              />
            </Box>
          </Stack>
          
          <FormTextField
            name="maxRetries"
            label="Maximum Retries"
            type="number"
          />
        </FormSection>
      )}
      
      {/* Additional Settings */}
      <FormSection title="Additional Settings">
        <FormAutocomplete
          name="notificationPreferences"
          label="Notification Preferences"
          options={notificationOptions}
          multiple
        />
        
        <FormAutocomplete
          name="tags"
          label="Tags"
          options={[]} // Empty initially, user can add custom tags
          multiple
        />
        
        <FormSwitch
          name="isActive"
          label="Active"
        />
      </FormSection>
    </FormModal>
  );
};

export default NewEntityModal;