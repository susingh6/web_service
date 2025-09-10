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
import { fetchWithCacheGeneric, getFromCacheGeneric } from '@/lib/cacheUtils';
import { useAppDispatch } from '@/lib/store';
import { updateEntity, fetchEntities } from '@/features/sla/slices/entitiesSlice';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
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
  entity_name: yup.string().required('Entity name is required'),
  tenant_name: yup.string().required('Tenant name is required'),
  team_name: yup.string().required('Team name is required'),
  notification_preferences: yup.array().of(yup.string()).default([]),
  is_entity_owner: fieldDefinitions.is_entity_owner.validation,
  owner_entity_reference: yup.string()
    .when('is_entity_owner', {
      is: false,
      then: (schema) => fieldDefinitions.owner_entity_reference.validation,
      otherwise: (schema) => schema.optional()
    }),
  is_active: yup.boolean().default(true),
  expected_runtime_minutes: yup.number()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => fieldDefinitions.expected_runtime_minutes.validation,
      otherwise: (schema) => schema.optional()
    }),
  donemarker_location: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => fieldDefinitions.donemarker_location.validation,
      otherwise: (schema) => schema.optional()
    }),
  donemarker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
});

// Schema for Tables
const tableSchema = baseSchema.shape({
  schema_name: yup.string().required('Schema name is required'),
  table_name: yup.string().required('Table name is required'),
  table_description: yup.string().optional(),
  table_schedule: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => fieldDefinitions.table_schedule.validation,
      otherwise: (schema) => schema.optional()
    }),
  table_dependency: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => schema.optional(),
      otherwise: (schema) => schema.optional()
    }),
});

// Schema for DAGs
const dagSchema = baseSchema.shape({
  dag_name: yup.string().required('DAG name is required'),
  dag_description: yup.string().optional(),
  dag_schedule: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => fieldDefinitions.dag_schedule.validation,
      otherwise: (schema) => schema.optional()
    }),
  dag_dependency: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => schema.optional(),
      otherwise: (schema) => schema.optional()
    }),
  server_name: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => schema.optional(),
      otherwise: (schema) => schema.optional()
    }),
});

const EditEntityModal = ({ open, onClose, entity, teams }: EditEntityModalProps) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Determine entity type from the entity
  const entityType: EntityType = entity?.type === 'dag' ? 'dag' : 'table';
  
  // State for dynamic options - initialize from cache for instant load
  const [tenantOptions, setTenantOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('tenants', ['Ad Engineering', 'Data Engineering']));
  const [teamOptions, setTeamOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('teams', ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']));
  const [dagOptions, setDagOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('dags', ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing']));
  
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
        // Fetching entity details from endpoint
        
        const response = await apiRequest('GET', detailsEndpoint);
        const detailsData = await response.json();
        
        // Entity details from API
        return detailsData;
      } catch (error) {
        // Entity details API not available, using existing entity data
        // Fallback to basic entity data with enhanced mock data structure
        return {
          ...entity,
          // Mock comprehensive field structure based on entity type
          tenant_name: entity.tenant_name || (entityType === 'table' ? 'Data Engineering' : 'Analytics'),
          team_name: entity.team_name || 'PGM',
          notification_preferences: entity.notification_preferences || ['email', 'slack'],
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
            server_name: (entity as any).server_name || '',
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
      entity_name: '',
      tenant_name: '',
      team_name: '',
      notification_preferences: [],
      is_entity_owner: false,
      owner_entity_reference: '',
      is_active: true,
      expected_runtime_minutes: 60,
      donemarker_location: '',
      donemarker_lookback: 0,
      schema_name: '',
      table_name: '',
      table_description: '',
      table_schedule: '',
      table_dependency: '',
    },
  });

  const dagForm = useForm({
    resolver: yupResolver(dagSchema),
    defaultValues: {
      entity_name: '',
      tenant_name: '',
      team_name: '',
      notification_preferences: [],
      is_entity_owner: false,
      owner_entity_reference: '',
      is_active: true,
      expected_runtime_minutes: 60,
      donemarker_location: '',
      donemarker_lookback: 0,
      dag_name: '',
      dag_description: '',
      dag_schedule: '',
      dag_dependency: '',
      server_name: '',
    },
  });

  // Use type-safe form handling to avoid TypeScript union type issues
  const isTable = entityType === 'table';
  
  // Use type assertion to handle form union types
  const control = (isTable ? tableForm.control : dagForm.control) as any;
  const handleSubmit = isTable ? tableForm.handleSubmit : dagForm.handleSubmit;
  const reset = isTable ? tableForm.reset : dagForm.reset;
  const watch = isTable ? tableForm.watch : dagForm.watch;
  const errors = (isTable ? tableForm.formState.errors : dagForm.formState.errors) as any;
  
  // Reset form when entity details are loaded
  useEffect(() => {
    if (open && entityDetails && !isLoadingEntityDetails) {
      // Resetting form with entity details
      
      // Map entity details to form fields
      const formData = entityType === 'table' ? {
        entity_name: entityDetails.name || '',
        tenant_name: entityDetails.tenant_name || '',
        team_name: entityDetails.team_name || '',
        notification_preferences: entityDetails.notification_preferences || [],
        is_entity_owner: entityDetails.is_entity_owner || false,
        owner_entity_reference: (entityDetails as any).owner_entity_reference || '',

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
        entity_name: entityDetails.name || '',
        tenant_name: entityDetails.tenant_name || '',
        team_name: entityDetails.team_name || '',
        notification_preferences: entityDetails.notification_preferences || [],
        is_entity_owner: entityDetails.is_entity_owner || false,
        owner_entity_reference: (entityDetails as any).owner_entity_reference || '',

        is_active: entityDetails.is_active !== undefined ? entityDetails.is_active : true,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes || 60,
        donemarker_location: entityDetails.donemarker_location || '',
        donemarker_lookback: entityDetails.donemarker_lookback || 0,
        dag_name: (entityDetails as any).dag_name || entityDetails.name || '',
        dag_description: (entityDetails as any).dag_description || entityDetails.description || '',
        dag_schedule: (entityDetails as any).dag_schedule || '',
        dag_dependency: (entityDetails as any).dag_dependency || '',
        server_name: (entityDetails as any).server_name || '',
      };

      reset(formData);
      
      // Load cache data when modal opens
      setTenantOptions(getFromCacheGeneric<string[]>('tenants', ['Ad Engineering', 'Data Engineering']));
      setTeamOptions(getFromCacheGeneric<string[]>('teams', ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']));
      if (entityType === 'dag') {
        setDagOptions(getFromCacheGeneric<string[]>('dags', ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing']));
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
      
      // Get user email from authentication context
      const userEmail = user?.email || (user as any)?.mail || (user as any)?.preferredUsername || '';
      if (!userEmail) {
        setValidationError('User email not found. Please log in again.');
        return;
      }
      
      // Convert form data to entity format
      const entityData = {
        name: data.entity_name, // Use entity_name from form
        description: entityType === 'table' ? data.table_description : data.dag_description,
        type: entityType,
        teamId: entity.teamId, // Keep existing team
        user_email: userEmail, // Use authenticated user's email
        ...data,
      };
      
      await dispatch(
        updateEntity({
          id: entity.id,
          updates: entityData,
        })
      ).unwrap();
      
      // Comprehensive cache invalidation - all data sources
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entity.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/entities', { teamId: entity.teamId }] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      
      // Force refresh of Redux state by dispatching fetchEntities 
      dispatch(fetchEntities({ tenant: entity.tenant_name || 'Data Engineering' }));
      
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
                name="entity_name"
                control={control}
                render={({ field: { onChange, value, onBlur, ref } }) => (
                  <TextField
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    ref={ref}
                    label={fieldDefinitions.entity_name.label + " *"}
                    required
                    fullWidth
                    margin="normal"
                    error={!!errors.entity_name}
                    helperText={errors.entity_name?.message}
                    placeholder={fieldDefinitions.entity_name.placeholder}
                  />
                )}
              />
              
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
              

            </>
          ) : (
            /* DAG FIELDS */
            <>
              <Controller
                name="entity_name"
                control={control}
                render={({ field: { onChange, value, onBlur, ref } }) => (
                  <TextField
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    ref={ref}
                    label={fieldDefinitions.entity_name.label + " *"}
                    required
                    fullWidth
                    margin="normal"
                    error={!!errors.entity_name}
                    helperText={errors.entity_name?.message}
                    placeholder={fieldDefinitions.entity_name.placeholder}
                  />
                )}
              />
              
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
              

            </>
          )}
          

          {!watch().is_entity_owner && (
            <Controller
              name="owner_entity_reference"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={`${fieldDefinitions.owner_entity_reference.label} *`}
                  required
                  type={fieldDefinitions.owner_entity_reference.type}
                  placeholder={fieldDefinitions.owner_entity_reference.placeholder}
                  fullWidth
                  margin="normal"
                  error={!!(errors as any).owner_entity_reference}
                  helperText={(errors as any).owner_entity_reference?.message}
                />
              )}
            />
          )}
          
          
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

          <Controller
            name="is_entity_owner"
            control={control}
            render={({ field: { onChange, value } }) => (
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={value || false}
                      onChange={(e) => onChange(e.target.checked)}
                      name="is_entity_owner"
                    />
                  }
                  label={fieldDefinitions.is_entity_owner.label}
                />
              </Box>
            )}
          />

          {watch().is_entity_owner && (
            <>

              <Controller
                name="expected_runtime_minutes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.expected_runtime_minutes.label + " *"}
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
                    label="Done Marker Lookback (Days) *"
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

              {entityType === 'table' && (
                <>
                  <Controller
                    name="table_schedule"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={fieldDefinitions.table_schedule.label + " *"}
                        fullWidth
                        margin="normal"
                        required
                        placeholder={fieldDefinitions.table_schedule.placeholder}
                        error={!!errors.table_schedule}
                        helperText={errors.table_schedule?.message}
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
              )}

              {entityType === 'dag' && (
                <>
                  <Controller
                    name="dag_schedule"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={fieldDefinitions.dag_schedule.label + " *"}
                        fullWidth
                        margin="normal"
                        required
                        placeholder={fieldDefinitions.dag_schedule.placeholder}
                        error={!!errors.dag_schedule}
                        helperText={errors.dag_schedule?.message}
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

                  <Controller
                    name="server_name"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={fieldDefinitions.server_name.label}
                        fullWidth
                        margin="normal"
                        placeholder={fieldDefinitions.server_name.placeholder}
                        error={!!errors.server_name}
                        helperText={errors.server_name?.message}
                      />
                    )}
                  />
                </>
              )}
            </>
          )}
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
