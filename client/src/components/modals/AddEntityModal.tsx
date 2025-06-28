import React, { useState, useEffect } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { 
  buildTableSchema, 
  buildDagSchema, 
  fieldDefinitions, 
  defaultValues,
  getFieldsForEntityType,
  mapFormDataToApi 
} from '@/config/schemas';
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
import { 
  buildTableSchema as tableSchemaBuilder, 
  buildDagSchema as dagSchemaBuilder, 
  defaultValues as configDefaultValues
} from '@/config/schemas';
import { buildUrl, endpoints } from '@/config';
import { apiRequest } from '@/lib/queryClient';

type EntityType = 'table' | 'dag';

interface AddEntityModalProps {
  open: boolean;
  onClose: () => void;
  teams: { id: number; name: string }[];
}

// Use centralized schemas from config
const getSchemaForType = (entityType: EntityType) => {
  return entityType === 'table' ? tableSchemaBuilder() : dagSchemaBuilder();
};

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
  

  
  // Dynamic schema selection with memoization for performance
  const schema = React.useMemo(() => 
    getSchemaForType(entityType), 
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
      const options = await fetchWithCache(buildUrl(endpoints.debug.teams), 'tenants');
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
      const response = await apiRequest('GET', buildUrl(endpoints.teams));
      const teams = await response.json();
      const teamNames = teams.map((team: any) => team.name);
      setTeamOptions(teamNames);
    } catch (error) {
      console.error('Error fetching team options:', error);
    } finally {
      setLoadingTeams(false);
    }
  };
  
  const fetchDagOptions = async () => {
    setLoadingDags(true);
    try {
      // Use centralized endpoint for DAG options
      const options = await fetchWithCache(buildUrl(endpoints.debug.teams), 'dags');
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
    defaultValues: {
      ...configDefaultValues.common,
      ...(entityType === 'table' ? configDefaultValues.table : configDefaultValues.dag)
    },
  });

  // This effect updates the form when entity type changes
  useEffect(() => {
    // Reset form with appropriate default values when entity type changes
    reset({
      ...configDefaultValues.common,
      ...(entityType === 'table' ? configDefaultValues.table : configDefaultValues.dag)
    });
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
      
      // Use centralized API configuration for entity creation
      const endpoint = buildUrl(endpoints.entities);
        
      console.log(`Submitting ${entityType} to endpoint: ${endpoint}`);
      
      // Make the API call to create the entity using centralized apiRequest
      const response = await apiRequest('POST', endpoint, entityData);
      
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
              
              <Controller
                name="user_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.user_name.label}
                    required={fieldDefinitions.user_name.required}
                    type={fieldDefinitions.user_name.type}
                    placeholder={fieldDefinitions.user_name.placeholder}
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
                    label={fieldDefinitions.user_email.label}
                    required={fieldDefinitions.user_email.required}
                    type={fieldDefinitions.user_email.type}
                    placeholder={fieldDefinitions.user_email.placeholder}
                    fullWidth
                    margin="normal"
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
                    label={fieldDefinitions.user_email.label}
                    required={fieldDefinitions.user_email.required}
                    type={fieldDefinitions.user_email.type}
                    placeholder={fieldDefinitions.user_email.placeholder}
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