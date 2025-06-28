import React, { useState, useEffect } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
} from '@mui/material';
import { validateTenant, validateTeam, validateDag } from '@/lib/validationUtils';
import { fetchWithCache, getFromCache } from '@/lib/cacheUtils';
import { NotificationConfigManager } from '@/components/notifications/NotificationConfigManager';
import { NotificationSettings } from '@/lib/notifications/types';

type EntityType = 'table' | 'dag';

interface AddEntityModalProps {
  open: boolean;
  onClose: () => void;
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

const AddEntityModal = ({ open, onClose, teams }: AddEntityModalProps) => {
  const [entityType, setEntityType] = useState<EntityType>('table');
  
  // State for dynamic options - initialize from cache for instant load
  const [tenantOptions, setTenantOptions] = useState<string[]>(() => getFromCache('tenants'));
  const [teamOptions, setTeamOptions] = useState<string[]>(() => getFromCache('teams'));
  const [dagOptions, setDagOptions] = useState<string[]>(() => getFromCache('dags'));
  
  // Loading states
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingDags, setLoadingDags] = useState(false);
  
  // State for validation errors (single declaration)
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // State for notification settings
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({});
  
  // Dynamic schema selection with memoization for performance
  const schema = React.useMemo(() => 
    entityType === 'table' ? tableSchema : dagSchema, 
    [entityType]
  );
  
  // Effect to update component state when cache might have changed
  // Only runs when the modal opens to ensure we have the latest cache values
  useEffect(() => {
    if (open) {
      // Just load the latest values from cache when modal opens
      // No API calls - we rely on the app-level 6-hour refresh cycle
      setTenantOptions(getFromCache('tenants'));
      setTeamOptions(getFromCache('teams'));
      
      // Only load DAG options if viewing the DAG tab
      if (entityType === 'dag') {
        setDagOptions(getFromCache('dags'));
      }
      
      console.log('Modal opened - using cached values without additional API calls');
    }
  }, [open, entityType]);
  
  // Functions to fetch options with loading indicators
  const fetchTenantOptions = async () => {
    setLoadingTenants(true);
    try {
      const options = await fetchWithCache('https://api.example.com/tenants', 'tenants');
      setTenantOptions(options);
    } catch (error) {
      console.error('Error fetching tenant options:', error);
    } finally {
      setLoadingTenants(false);
    }
  };
  
  const fetchTeamOptions = async () => {
    setLoadingTeams(true);
    try {
      const options = await fetchWithCache('https://api.example.com/teams', 'teams');
      setTeamOptions(options);
    } catch (error) {
      console.error('Error fetching team options:', error);
    } finally {
      setLoadingTeams(false);
    }
  };
  
  const fetchDagOptions = async () => {
    setLoadingDags(true);
    try {
      // Use our FastAPI endpoint that will internally fetch from Airflow
      const options = await fetchWithCache('https://api.example.com/dags', 'dags');
      setDagOptions(options);
    } catch (error) {
      console.error('Error fetching DAG options:', error);
    } finally {
      setLoadingDags(false);
    }
  };
  
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema) as any, // Type cast to fix TypeScript issues
    defaultValues: entityType === 'table' ? {
      tenant_name: 'Data Engineering',
      team_name: 'PGM',
      notification_preferences: [],
      is_active: true,
      schema_name: '',
      table_name: '',
      table_description: '',
      table_schedule: '',
      expected_runtime_minutes: 30,
      table_dependency: '',
      donemarker_location: '',
      donemarker_lookback: 0,
      user_name: '',
      user_email: ''
    } : {
      tenant_name: 'Data Engineering',
      team_name: 'PGM',
      notification_preferences: [],
      is_active: true,
      dag_name: '',
      dag_description: '',
      dag_schedule: '',
      expected_runtime_minutes: 30,
      dag_dependency: '',
      donemarker_location: '',
      donemarker_lookback: 0,
      user_name: '',
      user_email: ''
    },
  });

  // This effect updates the form when entity type changes
  useEffect(() => {
    // Reset form with appropriate default values when entity type changes
    reset(
      entityType === 'table' 
        ? {
            tenant_name: 'Data Engineering',
            team_name: 'PGM',
            notification_preferences: [],
            is_active: true,
            schema_name: '',
            table_name: '',
            table_description: '',
            table_schedule: '',
            expected_runtime_minutes: 30,
            table_dependency: '',
            donemarker_location: '',
            donemarker_lookback: 0,
            user_name: '',
            user_email: ''
          } 
        : {
            tenant_name: 'Data Engineering',
            team_name: 'PGM',
            notification_preferences: [],
            is_active: true,
            dag_name: '',
            dag_description: '',
            dag_schedule: '',
            expected_runtime_minutes: 30,
            dag_dependency: '',
            donemarker_location: '',
            donemarker_lookback: 0,
            user_name: '',
            user_email: ''
          }
    );
  }, [entityType, reset]);

  const handleChangeEntityType = (_event: React.SyntheticEvent, newValue: EntityType) => {
    if (newValue !== null) {
      setEntityType(newValue);
      // Form will be reset by the useEffect above
    }
  };
  
  const onSubmit = async (data: any) => {
    console.log('Form data:', data);
    setValidationError(null);
    
    try {
      // Lightweight pre-validation in UI for better UX
      // These validations will be repeated on the server for security
      
      // 1. Pre-validate tenant name
      const tenantValidation = await validateTenant(data.tenant_name);
      if (tenantValidation !== true) {
        setValidationError(tenantValidation);
        return;
      }
      
      // 2. Pre-validate team name
      const teamValidation = await validateTeam(data.team_name);
      if (teamValidation !== true) {
        setValidationError(teamValidation);
        return;
      }
      
      // 3. For DAG type, pre-validate DAG name
      if (entityType === 'dag') {
        const dagValidation = await validateDag(data.dag_name);
        if (dagValidation !== true) {
          setValidationError(dagValidation);
          return;
        }
      }
      
      // All pre-validations passed, proceed with submission to FastAPI
      
      // Create the entity object to submit
      const entityData = {
        ...data,
        type: entityType,
        // Add any additional fields needed by the API
      };
      
      // Determine the endpoint based on entity type
      const endpoint = entityType === 'dag' 
        ? 'https://api.example.com/entities/dag' 
        : 'https://api.example.com/entities/table';
        
      console.log(`Submitting ${entityType} to endpoint: ${endpoint}`);
      
      // Make the API call to create the entity
      // FastAPI will perform full validation including Airflow API checks
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entityData),
      });
      
      if (!response.ok) {
        // Handle server validation errors
        const errorData = await response.json();
        setValidationError(errorData.detail || 'Failed to create entity. Please check your input and try again.');
        return;
      }
      
      // Successful submission - we got through API validation
      try {
        const responseData = await response.json();
        
        // Only update cache after successful validation from FastAPI
        if (entityType === 'dag' && !dagOptions.includes(data.dag_name)) {
          // Make sure the value was accepted by the backend before caching
          const updatedDags = [...dagOptions, data.dag_name];
          setDagOptions(updatedDags);
          
          // Update the cache with the validated DAG name
          localStorage.setItem('dags', JSON.stringify(updatedDags));
          localStorage.setItem('dags_time', Date.now().toString());
          
          console.log('Cache updated with validated DAG name:', data.dag_name);
        }
        
        // Do similar cache updates for tenant and team if they're new values
        if (!tenantOptions.includes(data.tenant_name)) {
          const updatedTenants = [...tenantOptions, data.tenant_name];
          setTenantOptions(updatedTenants);
          localStorage.setItem('tenants', JSON.stringify(updatedTenants));
          localStorage.setItem('tenants_time', Date.now().toString());
          
          console.log('Cache updated with validated tenant name:', data.tenant_name);
        }
        
        if (!teamOptions.includes(data.team_name)) {
          const updatedTeams = [...teamOptions, data.team_name];
          setTeamOptions(updatedTeams);
          localStorage.setItem('teams', JSON.stringify(updatedTeams));
          localStorage.setItem('teams_time', Date.now().toString());
          
          console.log('Cache updated with validated team name:', data.team_name);
        }
      } catch (parseError) {
        console.warn('Could not parse response JSON, but submission was successful');
      }
      
      // Close the modal after successful submission
      onClose();
      reset();
    } catch (error) {
      console.error('Error during submission:', error);
      setValidationError('An error occurred during submission. Please try again.');
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Entity</DialogTitle>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <ToggleButtonGroup
              exclusive
              value={entityType}
              onChange={handleChangeEntityType}
              aria-label="entity type"
              fullWidth
            >
              <ToggleButton value="table" aria-label="table entity">
                Table
              </ToggleButton>
              <ToggleButton value="dag" aria-label="dag entity">
                DAG
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          
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
                    onInputChange={(_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // Don't make API calls during typing - only when submitting
                        // This improves performance significantly
                      }
                    }}
                    freeSolo
                    options={tenantOptions}
                    loading={loadingTenants}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Tenant Name"
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
                    onInputChange={(_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // Don't make API calls during typing - only when submitting
                        // This improves performance significantly
                      }
                    }}
                    freeSolo
                    options={teamOptions}
                    loading={loadingTeams}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Team Name"
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
                    label="Schema Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.schema_name}
                    helperText={errors.schema_name?.message}
                    placeholder="e.g., public, sales, marketing"
                  />
                )}
              />
              
              <Controller
                name="table_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Name"
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
                    label="Table Schedule"
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
                    label="Expected Runtime (minutes)"
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
                    label="Table Dependency"
                    fullWidth
                    margin="normal"
                    error={!!errors.table_dependency}
                    helperText={errors.table_dependency?.message || "Comma-separated list of table names"}
                    placeholder="schema.table1,schema.table2,schema.table3"
                  />
                )}
              />
              
              <Controller
                name="notification_preferences"
                control={control}
                render={({ field }) => (
                  <div style={{ margin: '16px 0' }}>
                    <NotificationConfigManager
                      value={field.value || []}
                      onChange={(enabledTypes, settings) => {
                        field.onChange(enabledTypes);
                        setNotificationSettings(settings);
                      }}
                      teamName={watch('team_name')}
                    />
                    {errors.notification_preferences && (
                      <FormHelperText error sx={{ mt: 1 }}>
                        {errors.notification_preferences.message}
                      </FormHelperText>
                    )}
                  </div>
                )}
              />
              
              <Controller
                name="donemarker_location"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Donemarker Location"
                    fullWidth
                    margin="normal"
                    error={!!errors.donemarker_location}
                    helperText={errors.donemarker_location?.message}
                    placeholder="s3://bucket/path or hdfs://path"
                  />
                )}
              />
              
              <Controller
                name="donemarker_lookback"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Donemarker Lookback"
                    type="number"
                    fullWidth
                    margin="normal"
                    error={!!errors.donemarker_lookback}
                    helperText={errors.donemarker_lookback?.message || "Default is 0"}
                    inputProps={{ min: 0 }}
                  />
                )}
              />
              
              <Controller
                name="user_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="User Name"
                    fullWidth
                    margin="normal"
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
                    label="User Email"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.user_email}
                    helperText={errors.user_email?.message}
                    placeholder="user@example.com"
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
                    sx={{ mt: 2 }}
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
                    onInputChange={(_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // Don't make API calls during typing - only when submitting
                        // This improves performance significantly
                      }
                    }}
                    freeSolo
                    options={tenantOptions}
                    loading={loadingTenants}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Tenant Name"
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
                    onInputChange={(_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // Don't make API calls during typing - only when submitting
                        // This improves performance significantly
                      }
                    }}
                    freeSolo
                    options={teamOptions}
                    loading={loadingTeams}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Team Name"
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
                render={({ field: { onChange, value, onBlur } }) => (
                  <Autocomplete
                    value={value}
                    onChange={(_, newValue) => {
                      onChange(newValue);
                    }}
                    onInputChange={(_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // Don't make API calls during typing - only when submitting
                        // This improves performance significantly
                      }
                    }}
                    freeSolo
                    options={dagOptions}
                    loading={loadingDags}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="DAG Name"
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
                    label="DAG Description"
                    fullWidth
                    margin="normal"
                    multiline
                    rows={2}
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
                    label="DAG Schedule"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.dag_schedule}
                    helperText={errors.dag_schedule?.message}
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
                    label="Expected Runtime (minutes)"
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
                name="dag_dependency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Dependency"
                    fullWidth
                    margin="normal"
                    error={!!errors.dag_dependency}
                    helperText={errors.dag_dependency?.message || "Comma-separated list of DAG names"}
                    placeholder="dag1,dag2,dag3"
                  />
                )}
              />
              
              <Controller
                name="notification_preferences"
                control={control}
                render={({ field }) => (
                  <div style={{ margin: '16px 0' }}>
                    <NotificationConfigManager
                      value={field.value || []}
                      onChange={(enabledTypes, settings) => {
                        field.onChange(enabledTypes);
                        setNotificationSettings(settings);
                      }}
                      teamName={watch('team_name')}
                    />
                    {errors.notification_preferences && (
                      <FormHelperText error sx={{ mt: 1 }}>
                        {errors.notification_preferences.message}
                      </FormHelperText>
                    )}
                  </div>
                )}
              />
              
              <Controller
                name="donemarker_location"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Donemarker Location"
                    fullWidth
                    margin="normal"
                    error={!!errors.donemarker_location}
                    helperText={errors.donemarker_location?.message}
                    placeholder="s3://bucket/path or hdfs://path"
                  />
                )}
              />
              
              <Controller
                name="donemarker_lookback"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Donemarker Lookback"
                    type="number"
                    fullWidth
                    margin="normal"
                    error={!!errors.donemarker_lookback}
                    helperText={errors.donemarker_lookback?.message || "Default is 0"}
                    inputProps={{ min: 0 }}
                  />
                )}
              />
              
              <Controller
                name="user_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="User Name"
                    fullWidth
                    margin="normal"
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
                    label="User Email"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.user_email}
                    helperText={errors.user_email?.message}
                    placeholder="user@example.com"
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
                    sx={{ mt: 2 }}
                  />
                )}
              />
            </>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
          >
            Add Entity
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AddEntityModal;