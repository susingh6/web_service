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
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
} from '@mui/material';
import { validateTenant, validateTeam, validateDag } from '@/lib/validationUtils';

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
  user_name: yup.string().required('User name is required'),
  user_email: yup.string().email('Must be a valid email').required('User email is required'),
  is_active: yup.boolean().default(true),
});

// Schema for Tables
const tableSchema = baseSchema.shape({
  schema_name: yup.string().required('Schema name is required'),
  table_name: yup.string().required('Table name is required'),
  table_description: yup.string().optional(),
  table_schedule: yup.string().required('Table schedule is required'),
  expected_runtime_minutes: yup.number().positive('Must be positive').required('Expected runtime is required'),
  table_dependency: yup.string().optional(),
  donemarker_location: yup.string().optional(),
  donemarker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
});

// Schema for DAGs
const dagSchema = baseSchema.shape({
  dag_name: yup.string().required('DAG name is required'),
  dag_description: yup.string().optional(),
  dag_schedule: yup.string().required('DAG schedule is required'),
  expected_runtime_minutes: yup.number().positive('Must be positive').required('Expected runtime is required'),
  dag_dependency: yup.string().optional(),
  donemarker_location: yup.string().optional(),
  donemarker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
});

// Cache time in milliseconds (6 hours)
const CACHE_TTL = 6 * 60 * 60 * 1000;

// Helper function to fetch data from API with caching
const fetchWithCache = async (
  url: string, 
  cacheKey: string
): Promise<string[]> => {
  // Check if we have cached data and if it's still valid
  const cachedData = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);
  
  if (cachedData && cachedTime) {
    const timestamp = parseInt(cachedTime);
    if (Date.now() - timestamp < CACHE_TTL) {
      return JSON.parse(cachedData);
    }
  }
  
  // No valid cache, fetch from API
  try {
    // This is a placeholder for the actual API call
    console.log(`Fetching ${cacheKey} from ${url}`);
    
    // Simulating API response for now
    let mockResponse: string[] = [];
    if (cacheKey === 'tenants') {
      mockResponse = ['Ad Engineering', 'Data Engineering'];
    } else if (cacheKey === 'teams') {
      mockResponse = ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM'];
    } else if (cacheKey === 'dags') {
      mockResponse = ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing'];
    }
    
    // Cache the results
    localStorage.setItem(cacheKey, JSON.stringify(mockResponse));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    
    return mockResponse;
  } catch (error) {
    console.error(`Error fetching ${cacheKey}:`, error);
    return [];
  }
};

const AddEntityModal = ({ open, onClose, teams }: AddEntityModalProps) => {
  const [entityType, setEntityType] = useState<EntityType>('table');
  
  // State for dynamic options
  const [tenantOptions, setTenantOptions] = useState<string[]>(['Ad Engineering', 'Data Engineering']);
  const [teamOptions, setTeamOptions] = useState<string[]>(['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']);
  const [dagOptions, setDagOptions] = useState<string[]>([]);
  
  // Loading states
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingDags, setLoadingDags] = useState(false);
  
  // Use the appropriate schema based on entity type
  const schema = entityType === 'table' ? tableSchema : dagSchema;
  
  // Effect to fetch options when modal opens
  useEffect(() => {
    if (open) {
      // Initial load of cached options
      fetchTenantOptions();
      fetchTeamOptions();
      
      if (entityType === 'dag') {
        fetchDagOptions();
      }
    }
  }, [open, entityType]);
  
  // Functions to fetch options
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
      const options = await fetchWithCache('https://airflow.example.com/api/dags', 'dags');
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
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      tenant_name: 'Data Engineering',
      team_name: 'PGM',
      notification_preferences: ['email'],
      is_active: true,
    },
  });

  const handleChangeEntityType = (_event: React.SyntheticEvent, newValue: EntityType) => {
    if (newValue !== null) {
      setEntityType(newValue);
      reset(); // Reset form when switching entity types
    }
  };

  // State for validation errors
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const onSubmit = async (data: any) => {
    console.log('Form data:', data);
    setValidationError(null);
    
    try {
      // Validate custom inputs against API endpoints
      
      // 1. Validate tenant name
      const tenantValidation = await validateTenant(data.tenant_name);
      if (tenantValidation !== true) {
        setValidationError(tenantValidation);
        return;
      }
      
      // 2. Validate team name
      const teamValidation = await validateTeam(data.team_name);
      if (teamValidation !== true) {
        setValidationError(teamValidation);
        return;
      }
      
      // 3. For DAG type, validate DAG name
      if (entityType === 'dag') {
        const dagValidation = await validateDag(data.dag_name);
        if (dagValidation !== true) {
          setValidationError(dagValidation);
          return;
        }
      }
      
      // All validations passed, proceed with submission
      // Process form submission (API call would happen here)
      
      // Close the modal after successful submission
      onClose();
      reset();
    } catch (error) {
      console.error('Error during validation:', error);
      setValidationError('An error occurred during validation. Please try again.');
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
                        // In real implementation, we would trigger API call for new suggestions here
                        console.log('Custom tenant input:', newInputValue);
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
                        // In real implementation, we would trigger API call for new suggestions here
                        console.log('Custom team input:', newInputValue);
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
                  <FormControl 
                    fullWidth 
                    margin="normal"
                    error={!!errors.notification_preferences}
                  >
                    <FormLabel component="legend">Notification Preferences</FormLabel>
                    <FormGroup>
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={field.value?.includes('email') || false}
                            onChange={(e) => {
                              const currentValues = Array.isArray(field.value) ? [...field.value] : [];
                              if (e.target.checked) {
                                field.onChange([...currentValues, 'email']);
                              } else {
                                field.onChange(currentValues.filter(v => v !== 'email'));
                              }
                            }}
                          />
                        }
                        label="Email"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={field.value?.includes('slack') || false}
                            onChange={(e) => {
                              const currentValues = Array.isArray(field.value) ? [...field.value] : [];
                              if (e.target.checked) {
                                field.onChange([...currentValues, 'slack']);
                              } else {
                                field.onChange(currentValues.filter(v => v !== 'slack'));
                              }
                            }}
                          />
                        }
                        label="Slack"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={field.value?.includes('pagerduty') || false}
                            onChange={(e) => {
                              const currentValues = Array.isArray(field.value) ? [...field.value] : [];
                              if (e.target.checked) {
                                field.onChange([...currentValues, 'pagerduty']);
                              } else {
                                field.onChange(currentValues.filter(v => v !== 'pagerduty'));
                              }
                            }}
                          />
                        }
                        label="PagerDuty"
                      />
                    </FormGroup>
                    {errors.notification_preferences && (
                      <FormHelperText error>
                        {errors.notification_preferences.message}
                      </FormHelperText>
                    )}
                  </FormControl>
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
                    required
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
                render={({ field: { onChange, value, onBlur } }) => (
                  <Autocomplete
                    value={value}
                    onChange={(_, newValue) => {
                      onChange(newValue);
                    }}
                    onInputChange={(_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // In real implementation, we would trigger API call for new suggestions here
                        console.log('Custom tenant input:', newInputValue);
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
                render={({ field: { onChange, value, onBlur } }) => (
                  <Autocomplete
                    value={value}
                    onChange={(_, newValue) => {
                      onChange(newValue);
                    }}
                    onInputChange={(_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // In real implementation, we would trigger API call for new suggestions here
                        console.log('Custom team input:', newInputValue);
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
                        // In real implementation, we would trigger API call for new suggestions here
                        console.log('Custom DAG input:', newInputValue);
                        fetchDagOptions(); // Refresh DAG options when user is typing
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
                  <FormControl 
                    fullWidth 
                    margin="normal"
                    error={!!errors.notification_preferences}
                  >
                    <FormLabel component="legend">Notification Preferences</FormLabel>
                    <FormGroup>
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={field.value?.includes('email') || false}
                            onChange={(e) => {
                              const currentValues = Array.isArray(field.value) ? [...field.value] : [];
                              if (e.target.checked) {
                                field.onChange([...currentValues, 'email']);
                              } else {
                                field.onChange(currentValues.filter(v => v !== 'email'));
                              }
                            }}
                          />
                        }
                        label="Email"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={field.value?.includes('slack') || false}
                            onChange={(e) => {
                              const currentValues = Array.isArray(field.value) ? [...field.value] : [];
                              if (e.target.checked) {
                                field.onChange([...currentValues, 'slack']);
                              } else {
                                field.onChange(currentValues.filter(v => v !== 'slack'));
                              }
                            }}
                          />
                        }
                        label="Slack"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={field.value?.includes('pagerduty') || false}
                            onChange={(e) => {
                              const currentValues = Array.isArray(field.value) ? [...field.value] : [];
                              if (e.target.checked) {
                                field.onChange([...currentValues, 'pagerduty']);
                              } else {
                                field.onChange(currentValues.filter(v => v !== 'pagerduty'));
                              }
                            }}
                          />
                        }
                        label="PagerDuty"
                      />
                    </FormGroup>
                    {errors.notification_preferences && (
                      <FormHelperText error>
                        {errors.notification_preferences.message}
                      </FormHelperText>
                    )}
                  </FormControl>
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
                    required
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