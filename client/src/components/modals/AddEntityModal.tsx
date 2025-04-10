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

// Function to get data from cache without network requests
const getFromCache = (cacheKey: string): string[] => {
  const cachedData = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);
  
  if (cachedData && cachedTime) {
    const timestamp = parseInt(cachedTime);
    if (Date.now() - timestamp < CACHE_TTL) {
      return JSON.parse(cachedData);
    }
  }
  
  return [];
};

// Helper function to fetch data from API with improved caching
const fetchWithCache = async (
  url: string, 
  cacheKey: string
): Promise<string[]> => {
  // First check if we have valid cached data
  const cachedResult = getFromCache(cacheKey);
  if (cachedResult.length > 0) {
    return cachedResult; // Return cached data if available
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
    
    // Cache the results with a debounce to avoid excessive writes
    setTimeout(() => {
      localStorage.setItem(cacheKey, JSON.stringify(mockResponse));
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    }, 100);
    
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
  
  // Use preloaded data when modal opens
  useEffect(() => {
    if (open) {
      // Load from cache which should already be populated by preloading
      const cachedTenants = getFromCache('tenants');
      if (cachedTenants.length > 0) {
        setTenantOptions(cachedTenants);
      } else {
        // Fallback - if for some reason preloading failed
        console.log('Tenant cache miss - fetching on demand');
        fetchTenantOptions();
      }
      
      const cachedTeams = getFromCache('teams');
      if (cachedTeams.length > 0) {
        setTeamOptions(cachedTeams);
      } else {
        // Fallback - if for some reason preloading failed
        console.log('Team cache miss - fetching on demand');
        fetchTeamOptions();
      }
      
      // DAGs are not preloaded globally since they're only needed in specific contexts
      if (entityType === 'dag') {
        const cachedDags = getFromCache('dags');
        if (cachedDags.length > 0) {
          setDagOptions(cachedDags);
        }
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
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema) as any, // Type cast to fix TypeScript issues
    defaultValues: entityType === 'table' ? {
      tenant_name: 'Data Engineering',
      team_name: 'PGM',
      notification_preferences: ['email'],
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
      notification_preferences: ['email'],
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
            notification_preferences: ['email'],
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
            notification_preferences: ['email'],
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

  // State for validation errors
  const [validationError, setValidationError] = useState<string | null>(null);
  
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
      
      // Successful submission
      // Add the newly created entity to cache if needed
      if (entityType === 'dag' && !dagOptions.includes(data.dag_name)) {
        const updatedDags = [...dagOptions, data.dag_name];
        setDagOptions(updatedDags);
        
        // Update the cache with the new DAG
        localStorage.setItem('dags', JSON.stringify(updatedDags));
        localStorage.setItem('dags_time', Date.now().toString());
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
                        // In real implementation, we would trigger API call for new suggestions here
                        console.log('Custom tenant input:', newInputValue);
                      }
                    }}
                    onOpen={() => {
                      // Lazy load - only fetch when dropdown is opened
                      fetchTenantOptions();
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
                    onOpen={() => {
                      // Lazy load - only fetch when dropdown is opened
                      fetchTeamOptions();
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
                    onOpen={() => {
                      // Lazy load - only fetch when dropdown is opened
                      fetchTenantOptions();
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
                    onOpen={() => {
                      // Lazy load - only fetch when dropdown is opened
                      fetchTeamOptions();
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
                    onInputChange={async (_, newInputValue, reason) => {
                      if (reason === 'input' && newInputValue.trim() !== '') {
                        // Clear any previous validation errors
                        setValidationError(null);
                        
                        try {
                          // Perform lightweight real-time validation via our FastAPI backend
                          // FastAPI will check with Airflow - web UI never calls Airflow directly
                          const isValid = await validateDag(newInputValue);
                          if (isValid !== true) {
                            // Show warning but don't block input
                            console.warn(`DAG validation warning: ${isValid}`);
                          }
                        } catch (error) {
                          console.error('Error validating DAG name:', error);
                        }
                        
                        // Only fetch if user has typed enough characters (3+)
                        if (newInputValue.length >= 3) {
                          fetchDagOptions();
                        }
                      }
                    }}
                    onOpen={() => {
                      // Lazy load - only fetch when dropdown is opened
                      fetchDagOptions();
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