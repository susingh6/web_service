import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Autocomplete,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  Stack,
  Switch,
  TextField,
  Typography,
  Alert,
  IconButton,
  Box,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { validateTenant, validateTeam, validateDag } from '@/lib/validationUtils';
import { fetchWithCache, getFromCache } from '@/lib/cacheUtils';
import { useAppDispatch } from '@/lib/store';
import { updateEntity } from '@/features/sla/slices/entitiesSlice';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Entity } from '@shared/schema';
import { endpoints, buildUrl } from '@/config';
import { useQuery } from '@tanstack/react-query';
import { fieldDefinitions } from '@/config/schemas';

type EntityType = 'table' | 'dag';

interface EditEntityModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
}

// Common schema fields shared between both forms
const baseSchema = yup.object().shape({
  tenant_name: yup.string().required('Tenant name is required'),
  team_name: yup.string().required('Team name is required'),
  notification_preferences: yup.array().of(yup.string()).default([]),
  user_name: yup.string().optional(),
  user_email: yup.string()
    .required('User email is required')
    .matches(
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Invalid email format'
    ),
  is_active: yup.boolean().default(true),
});

// Schema for Tables
const tableSchema = baseSchema.shape({
  schema_name: yup.string().required('Schema name is required'),
  table_name: yup.string().required('Table name is required'),
  table_description: yup.string().optional(),
  table_schedule: yup.string()
    .required('Table schedule is required')
    .matches(/^[\d*\/ ,\-]+$/, 'Invalid cron format'),
  expected_runtime_minutes: yup.number()
    .required('Expected runtime is required')
    .positive('Must be positive')
    .min(1, 'Must be at least 1 minute')
    .max(1440, 'Must not exceed 1440 minutes (24 hours)'),
  table_dependency: yup.string().optional(),
  donemarker_location: yup.string().optional(),
  donemarker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
});

// Schema for DAGs
const dagSchema = baseSchema.shape({
  dag_name: yup.string().required('DAG name is required'),
  dag_description: yup.string().optional(),
  dag_schedule: yup.string()
    .required('DAG schedule is required')
    .matches(/^[\d*\/ ,\-]+$/, 'Invalid cron format'),
  expected_runtime_minutes: yup.number()
    .required('Expected runtime is required')
    .positive('Must be positive')
    .min(1, 'Must be at least 1 minute')
    .max(1440, 'Must not exceed 1440 minutes (24 hours)'),
  dag_dependency: yup.string().optional(),
  donemarker_location: yup.string().optional(),
  donemarker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
});

const EditEntityModal = ({ open, onClose, entity, teams }: EditEntityModalProps) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Determine entity type from the entity
  const entityType: EntityType = entity?.type === 'dag' ? 'dag' : 'table';
  
  // State for dynamic options - initialize from cache for instant load
  const [tenantOptions, setTenantOptions] = useState<string[]>(() => getFromCache('tenants'));
  const [teamOptions, setTeamOptions] = useState<string[]>(() => getFromCache('teams'));
  const [dagOptions, setDagOptions] = useState<string[]>(() => getFromCache('dags'));
  
  // Loading states
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingDags, setLoadingDags] = useState(false);
  
  // State for validation errors
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Dynamic schema selection
  const schema = React.useMemo(() => 
    entityType === 'table' ? tableSchema : dagSchema, 
    [entityType]
  );
  
  // Fetch entity details for pre-population
  const { data: entityDetails, isLoading: isLoadingEntityDetails } = useQuery({
    queryKey: ['entity-details', entity?.id],
    queryFn: async () => {
      if (!entity?.id) return null;
      
      try {
        // First try to get detailed entity data from the API
        const detailsEndpoint = endpoints.entity.details(entity.id);
        console.log(`Fetching entity details from: ${detailsEndpoint}`);
        
        const response = await apiRequest('GET', detailsEndpoint);
        const detailsData = await response.json();
        
        console.log('Entity details from API:', detailsData);
        return detailsData;
      } catch (error) {
        console.log('Entity details API not available, using existing entity data');
        // Fallback to basic entity data with enhanced mock data structure
        return {
          ...entity,
          // Mock comprehensive field structure based on entity type
          tenant_name: entity.tenant_name || (entityType === 'table' ? 'Data Engineering' : 'Analytics'),
          team_name: entity.team_name || 'PGM',
          notification_preferences: entity.notification_preferences || ['email', 'slack'],
          user_name: entity.user_name || 'john.smith',
          user_email: entity.user_email || 'john.smith@example.com',
          is_active: entity.is_active !== undefined ? entity.is_active : true,
          expected_runtime_minutes: entity.expected_runtime_minutes || (entityType === 'table' ? 30 : 45),
          donemarker_location: entity.donemarker_location || (entityType === 'table' 
            ? 's3://analytics-tables/done_markers/' 
            : 's3://analytics-dags/agg_daily/'),
          donemarker_lookback: entity.donemarker_lookback || 2,
          // Type-specific fields - handle missing fields gracefully
          ...(entityType === 'table' ? {
            schema_name: (entity as any).schema_name || 'analytics',
            table_name: (entity as any).table_name || entity.name,
            table_description: (entity as any).table_description || entity.description || 'Table for analytics processing',
            table_schedule: (entity as any).table_schedule || '0 2 * * *',
            table_dependency: (entity as any).table_dependency || 'raw_data_ingest,user_profile_enrichment',
          } : {
            dag_name: (entity as any).dag_name || entity.name,
            dag_description: (entity as any).dag_description || entity.description || 'DAG for daily analytics processing',
            dag_schedule: (entity as any).dag_schedule || '0 2 * * *',
            dag_dependency: (entity as any).dag_dependency || 'raw_data_ingest,user_profile_enrichment',
          })
        };
      }
    },
    enabled: !!entity?.id && open,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
  
  const tableForm = useForm({
    resolver: yupResolver(tableSchema),
    defaultValues: {
      tenant_name: '',
      team_name: '',
      notification_preferences: [],
      user_name: '',
      user_email: '',
      is_active: true,
      schema_name: '',
      table_name: '',
      table_description: '',
      table_schedule: '',
      table_dependency: '',
      expected_runtime_minutes: 60,
      donemarker_location: '',
      donemarker_lookback: 0,
    },
  });

  const dagForm = useForm({
    resolver: yupResolver(dagSchema),
    defaultValues: {
      tenant_name: '',
      team_name: '',
      notification_preferences: [],
      user_name: '',
      user_email: '',
      is_active: true,
      dag_name: '',
      dag_description: '',
      dag_schedule: '',
      dag_dependency: '',
      expected_runtime_minutes: 60,
      donemarker_location: '',
      donemarker_lookback: 0,
    },
  });

  const form = entityType === 'table' ? tableForm : dagForm;
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = form;
  
  // Reset form when entity details are loaded
  useEffect(() => {
    if (open && entityDetails && !isLoadingEntityDetails) {
      console.log('Resetting form with entity details:', entityDetails);
      
      // Map entity details to form fields
      const formData = entityType === 'table' ? {
        tenant_name: entityDetails.tenant_name || '',
        team_name: entityDetails.team_name || '',
        notification_preferences: entityDetails.notification_preferences || [],
        user_name: entityDetails.user_name || '',
        user_email: entityDetails.user_email || '',
        is_active: entityDetails.is_active !== undefined ? entityDetails.is_active : true,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes || 60,
        donemarker_location: entityDetails.donemarker_location || '',
        donemarker_lookback: entityDetails.donemarker_lookback || 0,
        schema_name: (entityDetails as any).schema_name || '',
        table_name: (entityDetails as any).table_name || entityDetails.name || '',
        table_description: (entityDetails as any).table_description || entityDetails.description || '',
        table_schedule: (entityDetails as any).table_schedule || '',
        table_dependency: (entityDetails as any).table_dependency || '',
      } : {
        tenant_name: entityDetails.tenant_name || '',
        team_name: entityDetails.team_name || '',
        notification_preferences: entityDetails.notification_preferences || [],
        user_name: entityDetails.user_name || '',
        user_email: entityDetails.user_email || '',
        is_active: entityDetails.is_active !== undefined ? entityDetails.is_active : true,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes || 60,
        donemarker_location: entityDetails.donemarker_location || '',
        donemarker_lookback: entityDetails.donemarker_lookback || 0,
        dag_name: (entityDetails as any).dag_name || entityDetails.name || '',
        dag_description: (entityDetails as any).dag_description || entityDetails.description || '',
        dag_schedule: (entityDetails as any).dag_schedule || '',
        dag_dependency: (entityDetails as any).dag_dependency || '',
      };

      reset(formData);
      
      // Load cache data when modal opens
      setTenantOptions(getFromCache('tenants'));
      setTeamOptions(getFromCache('teams'));
      if (entityType === 'dag') {
        setDagOptions(getFromCache('dags'));
      }
    } else if (!open) {
      // Reset form when modal is closed
      reset();
    }
  }, [entityDetails, reset, open, entityType, isLoadingEntityDetails]);
  
  const onSubmit = async (data: any) => {
    if (!entity) return;
    
    try {
      setIsSubmitting(true);
      setValidationError(null);
      
      // Basic validation
      if (entityType === 'table') {
        if (!validateTenant(data.tenant_name)) {
          setValidationError('Invalid tenant name format');
          return;
        }
        if (!validateTeam(data.team_name)) {
          setValidationError('Invalid team name format');
          return;
        }
      } else {
        if (!validateDag(data.dag_name)) {
          setValidationError('Invalid DAG name format');
          return;
        }
      }
      
      // Convert form data to entity format
      const entityData = {
        name: entityType === 'table' ? data.table_name : data.dag_name,
        description: entityType === 'table' ? data.table_description : data.dag_description,
        type: entityType,
        teamId: entity.teamId, // Keep existing team
        ...data,
      };
      
      await dispatch(
        updateEntity({
          id: entity.id,
          updates: entityData,
        })
      ).unwrap();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      
      toast({
        title: 'Success',
        description: `${entity.name} has been updated successfully.`,
        variant: 'default',
      });
      
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to update: ${error}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    setValidationError(null);
    onClose();
  };
  
  if (!entity) {
    return null;
  }
  
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
          Edit {entityType.toUpperCase()} Entity
        </Typography>
        <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Entity Type: <strong>{entity.type.toUpperCase()}</strong>
            </Typography>
          </Box>
          
          {validationError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {validationError}
            </Alert>
          )}
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Fields marked with an asterisk (*) are mandatory
          </Typography>

          {entityType === 'table' ? (
            /* TABLE FIELDS */
            <>
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
                    freeSolo
                    options={teamOptions}
                    loading={loadingTeams}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={fieldDefinitions.team_name.label + " *"}
                        required
                        fullWidth
                        margin="normal"
                        error={!!errors.team_name}
                        helperText={errors.team_name?.message}
                        onBlur={onBlur}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingTeams ? <CircularProgress color="inherit" size={20} /> : null}
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
                name="schema_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.schema_name.label + " *"}
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.schema_name}
                    helperText={errors.schema_name?.message}
                  />
                )}
              />
              
              <Controller
                name="table_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.table_name.label + " *"}
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.table_name}
                    helperText={errors.table_name?.message}
                  />
                )}
              />
              
              <Controller
                name="table_description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.table_description.label}
                    fullWidth
                    margin="normal"
                    multiline
                    rows={3}
                    error={!!errors.table_description}
                    helperText={errors.table_description?.message}
                  />
                )}
              />
              
              <Controller
                name="table_schedule"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Schedule (Cron) *"
                    fullWidth
                    margin="normal"
                    required
                    placeholder="e.g., 0 2 * * * (daily at 2 AM)"
                    error={!!errors.table_schedule}
                    helperText={errors.table_schedule?.message || "Use cron format: minute hour day month day-of-week"}
                  />
                )}
              />
              
              <Controller
                name="table_dependency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.table_dependency.label}
                    fullWidth
                    margin="normal"
                    placeholder="e.g., upstream_table1, upstream_table2"
                    error={!!errors.table_dependency}
                    helperText={errors.table_dependency?.message}
                  />
                )}
              />
            </>
          ) : (
            /* DAG FIELDS */
            <>
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
                    freeSolo
                    options={teamOptions}
                    loading={loadingTeams}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={fieldDefinitions.team_name.label + " *"}
                        required
                        fullWidth
                        margin="normal"
                        error={!!errors.team_name}
                        helperText={errors.team_name?.message}
                        onBlur={onBlur}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingTeams ? <CircularProgress color="inherit" size={20} /> : null}
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
                name="dag_name"
                control={control}
                render={({ field: { onChange, value, onBlur, ref } }) => (
                  <Autocomplete
                    value={value}
                    onChange={(_, newValue) => {
                      onChange(newValue);
                    }}
                    freeSolo
                    options={dagOptions}
                    loading={loadingDags}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={fieldDefinitions.dag_name.label + " *"}
                        required
                        fullWidth
                        margin="normal"
                        error={!!errors.dag_name}
                        helperText={errors.dag_name?.message}
                        onBlur={onBlur}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingDags ? <CircularProgress color="inherit" size={20} /> : null}
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
                name="dag_description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.dag_description.label}
                    fullWidth
                    margin="normal"
                    multiline
                    rows={3}
                    error={!!errors.dag_description}
                    helperText={errors.dag_description?.message}
                  />
                )}
              />
              
              <Controller
                name="dag_schedule"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Schedule (Cron) *"
                    fullWidth
                    margin="normal"
                    required
                    placeholder="e.g., 0 2 * * * (daily at 2 AM)"
                    error={!!errors.dag_schedule}
                    helperText={errors.dag_schedule?.message || "Use cron format: minute hour day month day-of-week"}
                  />
                )}
              />
              
              <Controller
                name="dag_dependency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.dag_dependency.label}
                    fullWidth
                    margin="normal"
                    placeholder="e.g., upstream_dag1, upstream_dag2"
                    error={!!errors.dag_dependency}
                    helperText={errors.dag_dependency?.message}
                  />
                )}
              />
            </>
          )}
          
          {/* COMMON FIELDS FOR BOTH TYPES */}
          <Controller
            name="user_name"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={fieldDefinitions.user_name.label + " *"}
                fullWidth
                margin="normal"
                required
                type="email"
                error={!!errors.user_name}
                helperText={errors.user_name?.message}
              />
            )}
          />
          
          <Controller
            name="user_email"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={fieldDefinitions.user_email.label + " *"}
                fullWidth
                margin="normal"
                required
                type="email"
                error={!!errors.user_email}
                helperText={errors.user_email?.message}
              />
            )}
          />
          
          <Controller
            name="expected_runtime_minutes"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Expected Runtime (Minutes) *"
                type="number"
                fullWidth
                margin="normal"
                required
                inputProps={{
                  min: 1,
                  max: 1440,
                }}
                error={!!errors.expected_runtime_minutes}
                helperText={errors.expected_runtime_minutes?.message}
              />
            )}
          />
          
          <Controller
            name="donemarker_location"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={fieldDefinitions.donemarker_location?.label + " *"}
                fullWidth
                margin="normal"
                required
                placeholder={fieldDefinitions.donemarker_location?.placeholder}
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
                label="Done Marker Lookback (Days)"
                type="number"
                fullWidth
                margin="normal"
                inputProps={{
                  min: 0,
                }}
                error={!!errors.donemarker_lookback}
                helperText={errors.donemarker_lookback?.message}
              />
            )}
          />
          
          <Controller
            name="is_active"
            control={control}
            render={({ field: { onChange, value } }) => (
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={value}
                      onChange={(e) => onChange(e.target.checked)}
                      name="is_active"
                    />
                  }
                  label="Is Active"
                />
              </Box>
            )}
          />
        </DialogContent>
        
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            startIcon={isSubmitting && <CircularProgress size={20} color="inherit" />}
          >
            {isSubmitting ? 'Saving...' : 'Edit Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default EditEntityModal;
