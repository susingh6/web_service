import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tabs,
  Tab,
  Box,
  Typography,
  FormControlLabel,
  Switch,
  Autocomplete,
  CircularProgress
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Entity, InsertEntity } from '@shared/schema';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { NotificationConfigManager } from '@/components/notifications/NotificationConfigManager';
import { useToast } from '@/hooks/use-toast';

type EntityType = 'table' | 'dag';

interface EditEntityModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
}

const getSchemaForType = (entityType: EntityType) => {
  const baseSchema = yup.object({
    tenant_name: yup.string().required('Tenant name is required'),
    team_name: yup.string().required('Team name is required'),
    notification_preferences: yup.array().of(yup.string()).default([]),
    user_email: yup.string().email('Please enter a valid email').required('Owner email is required'),
    is_active: yup.boolean().default(true),
    expected_runtime_minutes: yup.number().positive('Must be positive').required('Expected runtime is required'),
    donemarker_location: yup.string().required('Done marker location is required'),
    donemarker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
  });

  if (entityType === 'table') {
    return baseSchema.shape({
      schema_name: yup.string().required('Schema name is required'),
      table_name: yup.string().required('Table name is required'),
      table_description: yup.string().optional(),
      table_schedule: yup.string().required('Table schedule is required'),
      table_dependency: yup.string().optional(),
    });
  } else {
    return baseSchema.shape({
      dag_name: yup.string().required('DAG name is required'),
      dag_description: yup.string().optional(),
      dag_schedule: yup.string().required('DAG schedule is required'),
      dag_dependency: yup.string().optional(),
    });
  }
};

const EditEntityModal = ({ open, onClose, entity, teams }: EditEntityModalProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<EntityType>('table');
  const [tenantOptions, setTenantOptions] = useState<string[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Determine entity type from the entity
  useEffect(() => {
    if (entity) {
      setEntityType(entity.type === 'dag' ? 'dag' : 'table');
    }
  }, [entity]);

  // Team options for autocomplete
  const teamOptions = teams.map(team => team.name);

  // Get validation schema based on entity type
  const validationSchema = getSchemaForType(entityType);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch
  } = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      tenant_name: '',
      team_name: '',
      user_email: '',
      notification_preferences: [],
      is_active: true,
      expected_runtime_minutes: 60,
      donemarker_location: '',
      donemarker_lookback: 0,
      ...(entityType === 'table' ? {
        schema_name: '',
        table_name: '',
        table_description: '',
        table_schedule: '',
        table_dependency: '',
      } : {
        dag_name: '',
        dag_description: '',
        dag_schedule: '',
        dag_dependency: '',
      })
    }
  });

  // Fetch entity details for pre-population
  const { data: entityDetails, isLoading: loadingEntityDetails } = useQuery({
    queryKey: ['/api/entities', entity?.id, 'details'],
    queryFn: async () => {
      if (!entity) return null;
      console.log(`Fetching entity details from: /api/entities/${entity.id}/details`);
      const res = await apiRequest('GET', `/api/entities/${entity.id}/details`);
      const details = await res.json();
      console.log('Entity details from API:', details);
      return details;
    },
    enabled: !!entity && open
  });

  // Pre-populate form when entity details are loaded
  useEffect(() => {
    if (entityDetails && open) {
      console.log('Resetting form with entity details:', entityDetails);
      const formData = {
        tenant_name: entityDetails.tenant_name || '',
        team_name: entityDetails.team_name || '',
        user_email: entityDetails.user_email || '',
        notification_preferences: entityDetails.notification_preferences || [],
        is_active: entityDetails.is_active ?? true,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes || 60,
        donemarker_location: entityDetails.donemarker_location || '',
        donemarker_lookback: entityDetails.donemarker_lookback || 0,
        ...(entityType === 'table' ? {
          schema_name: entityDetails.schema_name || '',
          table_name: entityDetails.table_name || '',
          table_description: entityDetails.table_description || '',
          table_schedule: entityDetails.table_schedule || '',
          table_dependency: entityDetails.table_dependency || '',
        } : {
          dag_name: entityDetails.dag_name || '',
          dag_description: entityDetails.dag_description || '',
          dag_schedule: entityDetails.dag_schedule || '',
          dag_dependency: entityDetails.dag_dependency || '',
        })
      };
      reset(formData);
    }
  }, [entityDetails, reset, open, entityType]);

  // Update entity mutation
  const updateEntityMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!entity) throw new Error('No entity to update');
      
      const response = await apiRequest('PUT', `/api/entities/${entity.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entity?.id] });
      toast({
        title: "Success",
        description: "Entity updated successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update entity",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    updateEntityMutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!entity) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { maxHeight: '90vh' }
      }}
    >
      <DialogTitle>
        <Typography variant="h5" component="div">
          Edit {entityType === 'table' ? 'Table' : 'DAG'} Entity
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Fields marked with an asterisk (*) are mandatory
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <form onSubmit={handleSubmit(onSubmit)}>
          {entityType === 'table' ? (
            /* TABLE FIELDS */
            <>
              <Controller
                name="schema_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Schema Name *"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.schema_name}
                    helperText={errors.schema_name?.message}
                    placeholder="e.g., analytics, reporting, raw_data"
                  />
                )}
              />
              
              <Controller
                name="table_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Name *"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.table_name}
                    helperText={errors.table_name?.message}
                    placeholder="e.g., customer_master, orders, products"
                  />
                )}
              />
              
              <Controller
                name="table_description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Description"
                    fullWidth
                    margin="normal"
                    multiline
                    rows={3}
                    error={!!errors.table_description}
                    helperText={errors.table_description?.message}
                    placeholder="Brief description of this table"
                  />
                )}
              />
              
              <Controller
                name="table_schedule"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Schedule *"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.table_schedule}
                    helperText={errors.table_schedule?.message}
                    placeholder="* * * * * (cron format)"
                  />
                )}
              />
              
              <Controller
                name="expected_runtime_minutes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Expected Runtime (minutes) *"
                    type="number"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.expected_runtime_minutes}
                    helperText={errors.expected_runtime_minutes?.message}
                    inputProps={{ min: 1 }}
                  />
                )}
              />
              
              <Controller
                name="table_dependency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Dependencies"
                    fullWidth
                    margin="normal"
                    error={!!errors.table_dependency}
                    helperText={errors.table_dependency?.message}
                    placeholder="Comma-separated list of table names"
                  />
                )}
              />
              
              <Controller
                name="donemarker_location"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Done Marker Location *"
                    fullWidth
                    margin="normal"
                    required
                    placeholder="s3://bucket/path/to/done-markers/"
                    error={!!errors.donemarker_location}
                    helperText={errors.donemarker_location?.message}
                  />
                )}
              />
              
              <Controller
                name="donemarker_lookback"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Donemarker Lookback (Days)"
                    type="number"
                    fullWidth
                    margin="normal"
                    error={!!errors.donemarker_lookback}
                    helperText={errors.donemarker_lookback?.message || "Default is 0"}
                    inputProps={{ min: 0 }}
                  />
                )}
              />
            </>
          ) : (
            /* DAG FIELDS */
            <>
              <Controller
                name="dag_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Name *"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.dag_name}
                    helperText={errors.dag_name?.message}
                    placeholder="e.g., daily_etl_pipeline, weekly_reports"
                  />
                )}
              />
              
              <Controller
                name="dag_description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Description"
                    fullWidth
                    margin="normal"
                    multiline
                    rows={3}
                    error={!!errors.dag_description}
                    helperText={errors.dag_description?.message}
                    placeholder="Brief description of this DAG"
                  />
                )}
              />
              
              <Controller
                name="dag_schedule"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Schedule *"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.dag_schedule}
                    helperText={errors.dag_schedule?.message}
                    placeholder="0 2 * * * (cron format)"
                  />
                )}
              />
              
              <Controller
                name="dag_dependency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Dependencies"
                    fullWidth
                    margin="normal"
                    error={!!errors.dag_dependency}
                    helperText={errors.dag_dependency?.message}
                    placeholder="upstream_dag1, upstream_dag2"
                  />
                )}
              />
            </>
          )}
          
          {/* COMMON FIELDS */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              General Information
            </Typography>
            
            <Controller
              name="tenant_name"
              control={control}
              render={({ field: { onChange, value, onBlur, ref } }) => (
                <Autocomplete
                  value={value}
                  onChange={(_, newValue) => {
                    onChange(newValue);
                  }}
                  freeSolo
                  options={tenantOptions}
                  loading={loadingTenants}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Tenant Name *"
                      required
                      fullWidth
                      margin="normal"
                      error={!!errors.tenant_name}
                      helperText={errors.tenant_name?.message}
                      onBlur={onBlur}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingTenants ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
              )}
            />
            
            <Controller
              name="team_name"
              control={control}
              render={({ field: { onChange, value, onBlur, ref } }) => (
                <Autocomplete
                  value={value}
                  onChange={(_, newValue) => {
                    onChange(newValue);
                  }}
                  options={teamOptions}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Team Name *"
                      required
                      fullWidth
                      margin="normal"
                      error={!!errors.team_name}
                      helperText={errors.team_name?.message}
                      onBlur={onBlur}
                    />
                  )}
                />
              )}
            />
            
            <Controller
              name="user_email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Owner Email *"
                  fullWidth
                  margin="normal"
                  required
                  type="email"
                  error={!!errors.user_email}
                  helperText={errors.user_email?.message}
                  placeholder="owner@company.com"
                />
              )}
            />
            
            <Controller
              name="is_active"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(field.value)}
                      onChange={field.onChange}
                      color="primary"
                    />
                  }
                  label="Active"
                  sx={{ mt: 2, mb: 2 }}
                />
              )}
            />
          </Box>
        </form>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          disabled={updateEntityMutation.isPending}
        >
          {updateEntityMutation.isPending ? 'Saving...' : 'Edit Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditEntityModal;