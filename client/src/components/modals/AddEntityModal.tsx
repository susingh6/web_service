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
  Tooltip,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { validateTenant, validateTeam, validateDag, updateCacheWithNewValue } from '@/lib/validationUtils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { fetchWithCacheGeneric, getFromCacheGeneric } from '@/lib/cacheUtils';
import { 
  buildTableSchema as tableSchemaBuilder, 
  buildDagSchema as dagSchemaBuilder, 
  defaultValues as configDefaultValues
} from '@/config/schemas';
import { buildUrl, endpoints } from '@/config';
import { apiRequest } from '@/lib/queryClient';
import { useEntityMutation } from '@/utils/cache-management';
import { entityRequest } from '@/features/sla/api';

type EntityType = 'table' | 'dag';

interface AddEntityModalProps {
  open: boolean;
  onClose: () => void;
  teams: { id: number; name: string }[];
  initialTenantName?: string;
  initialTeamName?: string;
  onSubmitted?: (type: EntityType) => void;
}

// Use centralized schemas from config
const getSchemaForType = (entityType: EntityType) => {
  return entityType === 'table' ? tableSchemaBuilder() : dagSchemaBuilder();
};

const AddEntityModal = ({ open, onClose, teams, initialTenantName, initialTeamName, onSubmitted }: AddEntityModalProps) => {
  const [entityType, setEntityType] = useState<EntityType>('table');
  const [isEntityOwner, setIsEntityOwner] = useState(false);
  const isLockedContext = Boolean(initialTeamName && initialTenantName);
  
  // State for dynamic options - initialize from cache for instant load
  const [tenantOptions, setTenantOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('tenants', ['Ad Engineering', 'Data Engineering']));
  const [teamOptions, setTeamOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('teams', ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']));
  const [dagOptions, setDagOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('dags', ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing']));
  
  // Loading states
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingDags, setLoadingDags] = useState(false);
  // Owner reference options (searchable list from Redis index)
  const [ownerRefOptions, setOwnerRefOptions] = useState<string[]>([]);
  const [loadingOwnerRef, setLoadingOwnerRef] = useState<boolean>(false);
  
  // State for validation errors (single declaration)
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // State to preserve form values when toggling Entity Owner
  const [preservedFormValues, setPreservedFormValues] = useState<any>(null);
  
  // Helper function to get fields that should be preserved (common fields only)
  const getPreservableFields = (formValues: any) => {
    const commonFields = [
      'entity_name', 'tenant_name', 'team_name', 'user_email', 'is_active',
      // Table-specific fields that should be preserved within table context
      ...(entityType === 'table' ? ['schema_name', 'table_name', 'table_description', 'owner_entity_reference'] : []),
      // DAG-specific fields that should be preserved within DAG context  
      ...(entityType === 'dag' ? ['dag_name', 'dag_description', 'owner_entity_reference'] : [])
    ];
    
    const preservable: any = {};
    commonFields.forEach(field => {
      if (formValues[field] !== undefined) {
        preservable[field] = formValues[field];
      }
    });
    return preservable;
  };
  
  // Use the new entity mutation hook with entity-type-specific cache invalidation
  const { createEntity } = useEntityMutation();
  const { toast } = useToast();
  
  // Get authenticated user's email
  const { user } = useAuth();
  

  
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
      if (isLockedContext) {
        // Restrict selectors to current page context (team tab)
        setTenantOptions(initialTenantName ? [initialTenantName] : []);
        setTeamOptions(initialTeamName ? [initialTeamName] : []);
      } else {
        setTenantOptions(getFromCacheGeneric<string[]>('tenants', ['Ad Engineering', 'Data Engineering']));
        setTeamOptions(getFromCacheGeneric<string[]>('teams', ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']));
      }
      
      // Only load DAG options if viewing the DAG tab
      if (entityType === 'dag') {
        setDagOptions(getFromCacheGeneric<string[]>('dags', ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing']));
      }
      
      // Modal opened - using cached values without additional API calls
    }
  }, [open, entityType, isLockedContext, initialTenantName, initialTeamName]);
  
  // Functions to fetch options with loading indicators
  const fetchTenantOptions = async () => {
    setLoadingTenants(true);
    try {
      const options = await fetchWithCacheGeneric<string[]>(buildUrl(endpoints.debug.teams), 'tenants');
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
      const options = await fetchWithCacheGeneric<string[]>(buildUrl(endpoints.debug.teams), 'dags');
      setDagOptions(options);
    } catch (error) {
      console.error('Error fetching DAG options:', error);
    } finally {
      setLoadingDags(false);
    }
  };
  
  // Load owner reference options from Redis index (no-cache)
  const fetchOwnerRefOptions = async (typeParam: 'table' | 'dag', q?: string) => {
    try {
      setLoadingOwnerRef(true);
      const url = `/api/entities/owner-reference-options?type=${encodeURIComponent(typeParam)}${q ? `&q=${encodeURIComponent(q)}` : ''}&limit=50&ts=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' as RequestCache });
      const names = await res.json();
      setOwnerRefOptions(Array.isArray(names) ? names : []);
    } catch {
      setOwnerRefOptions([]);
    } finally {
      setLoadingOwnerRef(false);
    }
  };


  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    // Bypass complex schema validation that's causing TypeScript issues
    mode: 'onChange',
    defaultValues: {
      ...configDefaultValues.common,
      ...(entityType === 'table' ? configDefaultValues.table : configDefaultValues.dag)
    },
  });

  // This effect updates the form when entity type changes (preserves only common fields)
  useEffect(() => {
    // Only reset when entity type actually changes, not on initial render
    const currentValues = getValues();
    
    // Only proceed if we have existing form values (user has started filling the form)
    if (Object.keys(currentValues).length > 0) {
      reset({
        ...configDefaultValues.common,
        ...(entityType === 'table' ? configDefaultValues.table : configDefaultValues.dag),
        // Preserve only COMMON fields when switching entity types
        tenant_name: currentValues.tenant_name || configDefaultValues.common.tenant_name,
        team_name: currentValues.team_name || configDefaultValues.common.team_name,
        user_email: currentValues.user_email || configDefaultValues.common.user_email,
        is_active: currentValues.is_active !== undefined ? currentValues.is_active : configDefaultValues.common.is_active,
        // Reset entity-specific fields to defaults for the new type
      });
    }
  }, [entityType, reset, getValues]);

  // Preserve form values when Entity Owner toggle changes
  useEffect(() => {
    if (preservedFormValues) {
      // Restore preserved values after conditional rendering changes
      Object.keys(preservedFormValues).forEach(key => {
        setValue(key as any, preservedFormValues[key]);
      });
      setPreservedFormValues(null);
    }
  }, [isEntityOwner, setValue, preservedFormValues]);

  // Prefill tenant/team based on current page context when modal opens
  useEffect(() => {
    if (open) {
      const tenantPrefill = initialTenantName || configDefaultValues.common.tenant_name;
      const teamPrefill = initialTeamName || configDefaultValues.common.team_name;
      reset((prev: any) => ({
        ...prev,
        tenant_name: tenantPrefill,
        team_name: teamPrefill,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTenantName, initialTeamName]);

  const handleChangeEntityType = (_event: React.SyntheticEvent, newValue: EntityType) => {
    if (newValue !== null) {
      setEntityType(newValue);
      // Form will be reset by the useEffect above
    }
  };
  
  const onSubmit = async (data: any) => {
    // Form data submitted
    
    setValidationError(null);
    
    try {
      // Lightweight pre-validation in UI for better UX
      // These validations will be repeated on the server for security
      
      // Basic validation - check required fields based on entity owner status
      let requiredFields = ['tenant_name', 'team_name'];
      if (entityType === 'table') {
        requiredFields.unshift('entity_name');
        if (isEntityOwner) {
          // For owner tables, ensure schema and table name are also provided
          requiredFields.push('schema_name', 'table_name');
        }
      } else {
        // DAGs: owners must supply dag_name; non-owners use entity_name reference
        if (isEntityOwner) {
          requiredFields.unshift('dag_name');
        } else {
          requiredFields.unshift('entity_name');
        }
      }
      
      // Only require owner_email if user is marked as entity owner
      if (isEntityOwner) {
        requiredFields.push('owner_email');
      }
      
      for (const field of requiredFields) {
        if (!data[field] || data[field].trim() === '') {
          setValidationError(`${field.replace('_', ' ')} is required`);
          return;
        }
      }
      
      // All pre-validations passed, proceed with submission using entity mutation
      
      // Find the team ID from the team name AND tenant (multi-tenant isolation)
      const team = teams.find(t => t.name === data.team_name && (t as any).tenant_name === data.tenant_name);
      if (!team) {
        setValidationError('Team not found');
        return;
      }
      
      // Get user email from authentication context
      const userEmail = (user as any)?.email || (user as any)?.mail || (user as any)?.preferredUsername || '';
      if (!userEmail) {
        setValidationError('User email not found. Please log in again.');
        return;
      }
      
      // Create minimal, canonical entity payload (no UI-only fields)
      const ownerEmailValue = (data.ownerEmail || data.owner_email || data.owner || '').trim();
      const entityData: any = {
        tenant_name: data.tenant_name,
        team_name: data.team_name,
        entity_type: entityType,
        entity_name: data.entity_name,
        is_active: (data as any).is_active !== undefined ? (data as any).is_active : true,
        is_entity_owner: isEntityOwner,
        expected_runtime_minutes: data.expected_runtime_minutes,
        owner_email: isEntityOwner ? (ownerEmailValue || userEmail || null) : null,
        user_email: userEmail,
        server_name: data.server_name || null,
        // Always send owner_entity_ref_name; null when the entity is an owner
        owner_entity_ref_name: isEntityOwner ? null : (data.owner_entity_reference || null),
        // Donemarker fields (required by backend semantics)
        donemarker_location: data.donemarker_location ?? null,
        donemarker_lookback: data.donemarker_lookback ?? null,
      };
      if (entityType === 'dag') {
        entityData.dag_name = data.dag_name;
        entityData.dag_schedule = data.dag_schedule || data.entity_schedule || null;
        entityData.dag_description = (data as any).dag_description ?? '';
        entityData.dag_dependency = (data as any).dag_dependency ?? '';
      } else {
        entityData.schema_name = data.schema_name;
        entityData.table_name = data.table_name;
        entityData.table_schedule = data.table_schedule || data.entity_schedule || null;
      }
      if (!isEntityOwner && data.owner_entity_reference) {
        entityData.owner_entity_ref_name = data.owner_entity_reference;
      }
      
      // Use React Query mutation for proper cache invalidation
      try {
        const result = await createEntity(entityData);
      } catch (err: any) {
        let msg = err?.message || 'Failed to create entity';
        // If backend returned a JSON error blob, extract the clean message
        if (typeof msg === 'string' && msg.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(msg);
            if (parsed && typeof parsed.message === 'string') msg = parsed.message;
          } catch {}
        }
        // Close modal first, then show toast for a few seconds (default behavior)
        onClose();
        toast({ title: 'Create Entity Failed', description: msg, variant: 'destructive' });
        return;
      }
      
      // Update local caches for dropdowns
      if (entityType === 'dag') {
        setDagOptions(updateCacheWithNewValue('dags', data.dag_name, dagOptions));
      }
      setTenantOptions(updateCacheWithNewValue('tenants', data.tenant_name, tenantOptions));
      setTeamOptions(updateCacheWithNewValue('teams', data.team_name, teamOptions));
      
      // Notify parent to switch sub-tab to the created entity type
      if (onSubmitted) onSubmitted(entityType);

      // Close the modal after successful submission
      onClose();
      reset();
    } catch (error) {
      
      setValidationError('An error occurred during submission. Please try again.');
    }
  };

  const handleClose = () => {
    reset();
    setIsEntityOwner(false);
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
              sx={{
                '& .MuiToggleButton-root': {
                  color: '#1976d2',
                  borderColor: '#1976d2',
                  '&.Mui-selected': {
                    backgroundColor: '#1976d2',
                    color: '#fff',
                    '&:hover': {
                      backgroundColor: '#1565c0',
                    },
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  },
                },
              }}
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
                name="entity_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.entity_name.label}
                    required={fieldDefinitions.entity_name.required}
                    type={fieldDefinitions.entity_name.type}
                    placeholder={fieldDefinitions.entity_name.placeholder}
                    fullWidth
                    margin="normal"
                    error={!!errors.entity_name}
                    helperText={errors.entity_name?.message}
                  />
                )}
              />
              
              <Controller
                name="tenant_name"
                control={control}
                render={({ field: { onChange, value, onBlur, ref } }) => (
                  <Autocomplete
                    disabled={isLockedContext}
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
                    freeSolo={!isLockedContext}
                    options={tenantOptions}
                    loading={loadingTenants}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={fieldDefinitions.tenant_name.label}
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
                    disabled={isLockedContext}
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
                    freeSolo={!isLockedContext}
                    options={teamOptions}
                    loading={loadingTeams}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={fieldDefinitions.team_name.label}
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
              
              {false && isEntityOwner && (
                <Controller
                  name="schema_name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.schema_name.label}
                      fullWidth
                      margin="normal"
                      required
                      error={!!(errors as any).schema_name}
                      helperText={(errors as any).schema_name?.message}
                      placeholder="e.g., public, sales, marketing"
                    />
                  )}
                />
              )}
              
              {false && isEntityOwner && (
                <Controller
                  name="table_name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.table_name.label}
                      fullWidth
                      margin="normal"
                      required
                      error={!!(errors as any).table_name}
                      helperText={(errors as any).table_name?.message}
                      placeholder="e.g., customer_master, orders, products"
                    />
                  )}
                />
              )}
              
              {false && isEntityOwner && (
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
                      error={!!(errors as any).table_description}
                      helperText={(errors as any).table_description?.message}
                      placeholder="Brief description of this table"
                    />
                  )}
                />
              )}

              {!isEntityOwner && (
                <Controller
                  name="owner_entity_reference"
                  control={control}
                  render={({ field: { onChange, value, onBlur } }) => (
                    <Autocomplete
                      value={value}
                      onChange={(_, newValue) => onChange(newValue)}
                      onOpen={() => fetchOwnerRefOptions('table')}
                      onInputChange={async (_e, newInputValue) => {
                        try {
                          const q = newInputValue?.trim();
                          const typeParam = (entityType === 'table' ? 'table' : 'dag') as 'table' | 'dag';
                          const url = `/api/entities/owner-reference-options?type=${encodeURIComponent(typeParam)}${q ? `&q=${encodeURIComponent(q)}` : ''}&limit=50`;
                          setLoadingOwnerRef(true);
                          const res = await fetch(url + `&ts=${Date.now()}`, { cache: 'no-store' as RequestCache });
                          const names = await res.json();
                          setOwnerRefOptions(Array.isArray(names) ? names : []);
                        } catch {
                          setOwnerRefOptions([]);
                        } finally {
                          setLoadingOwnerRef(false);
                        }
                      }}
                      freeSolo
                      options={ownerRefOptions}
                      loading={loadingOwnerRef}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={`${fieldDefinitions.owner_entity_reference.label} *`}
                          required
                          fullWidth
                          margin="normal"
                          error={!!(errors as any).owner_entity_reference}
                          helperText={(errors as any).owner_entity_reference?.message}
                          onBlur={onBlur}
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {loadingOwnerRef ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />
                  )}
                />
              )}
              
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

              <FormControlLabel
                control={
                  <Switch
                    checked={isEntityOwner}
                    onChange={(e) => {
                      // Preserve only relevant form values before toggle
                      const currentValues = getValues();
                      const preservableValues = getPreservableFields(currentValues);
                      setPreservedFormValues(preservableValues);
                      setIsEntityOwner(e.target.checked);
                    }}
                    color="primary"
                  />
                }
                label="Entity Owner"
                sx={{ mt: 2 }}
              />

              {isEntityOwner && (
                <>
                  {/* Table owner fields moved below toggle */}
                  <Controller
                    name="schema_name"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={fieldDefinitions.schema_name.label}
                        fullWidth
                        margin="normal"
                        required
                        error={!!(errors as any).schema_name}
                        helperText={(errors as any).schema_name?.message}
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
                        label={fieldDefinitions.table_name.label}
                        fullWidth
                        margin="normal"
                        required
                        error={!!(errors as any).table_name}
                        helperText={(errors as any).table_name?.message}
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
                        label={fieldDefinitions.table_description.label}
                        fullWidth
                        margin="normal"
                        multiline
                        rows={3}
                        error={!!(errors as any).table_description}
                        helperText={(errors as any).table_description?.message}
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
                        error={!!(errors as any).table_schedule}
                        helperText={(errors as any).table_schedule?.message}
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
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === '' ? '' : Number(v));
                        }}
                        inputProps={{ min: 1, inputMode: 'numeric' }}
                        error={!!errors.expected_runtime_minutes}
                        helperText={errors.expected_runtime_minutes?.message}
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
                        error={!!(errors as any).table_dependency}
                        helperText={(errors as any).table_dependency?.message || "Comma-separated list of table names"}
                        placeholder="schema.table1,schema.table2,schema.table3"
                      />
                    )}
                  />
              
                  <Controller
                    name="donemarker_lookback"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Donemarker Lookback (Days) *"
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
                    name="donemarker_location"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={`${fieldDefinitions.donemarker_location.label} *`}
                        required
                        type={fieldDefinitions.donemarker_location.type}
                        placeholder={fieldDefinitions.donemarker_location.placeholder}
                        fullWidth
                        margin="normal"
                        error={!!errors.donemarker_location}
                        helperText={errors.donemarker_location?.message}
                      />
                    )}
                  />

                  <Controller
                    name="owner_email"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={`${fieldDefinitions.owner_email.label} *`}
                        required
                        type={fieldDefinitions.owner_email.type}
                        placeholder={fieldDefinitions.owner_email.placeholder}
                        fullWidth
                        margin="normal"
                        error={!!errors.owner_email}
                        helperText={errors.owner_email?.message}
                      />
                    )}
                  />
                </>
              )}
            </>
          ) : (
            /* DAG FIELDS */
            <>
              <Controller
                name="entity_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={fieldDefinitions.entity_name.label}
                    required={fieldDefinitions.entity_name.required}
                    type={fieldDefinitions.entity_name.type}
                    placeholder={fieldDefinitions.entity_name.placeholder}
                    fullWidth
                    margin="normal"
                    error={!!errors.entity_name}
                    helperText={errors.entity_name?.message}
                  />
                )}
              />
              
              <Controller
                name="tenant_name"
                control={control}
                render={({ field: { onChange, value, onBlur, ref } }) => (
                  <Autocomplete
                    disabled={isLockedContext}
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
                    freeSolo={!isLockedContext}
                    options={tenantOptions}
                    loading={loadingTenants}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={fieldDefinitions.tenant_name.label}
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
                    disabled={isLockedContext}
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
                    freeSolo={!isLockedContext}
                    options={teamOptions}
                    loading={loadingTeams}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={fieldDefinitions.team_name.label}
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
              
              {false && entityType === 'dag' && isEntityOwner && (
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
                        }
                      }}
                      freeSolo
                      options={dagOptions}
                      loading={loadingDags}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={fieldDefinitions.dag_name.label}
                          required
                          fullWidth
                          margin="normal"
                          error={!!(errors as any).dag_name}
                          helperText={(errors as any).dag_name?.message}
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
              )}
              
              {false && entityType === 'dag' && isEntityOwner && (
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
                      rows={2}
                      error={!!(errors as any).dag_description}
                      helperText={(errors as any).dag_description?.message}
                    />
                  )}
                />
              )}

              {!isEntityOwner && (
                <Controller
                  name="owner_entity_reference"
                  control={control}
                  render={({ field: { onChange, value, onBlur } }) => (
                    <Autocomplete
                      value={value}
                      onChange={(_, newValue) => onChange(newValue)}
                      onOpen={() => fetchOwnerRefOptions('dag')}
                      onInputChange={async (_e, newInputValue) => {
                        try {
                          const q = newInputValue?.trim();
                          // Resolve owner reference type explicitly to satisfy TS
                          // In this branch we are in DAG form context; set type explicitly to avoid TS narrowing issue
                          const typeParam: 'table' | 'dag' = 'dag';
                          const url = `/api/entities/owner-reference-options?type=${encodeURIComponent(typeParam)}${q ? `&q=${encodeURIComponent(q)}` : ''}&limit=50`;
                          setLoadingOwnerRef(true);
                          const res = await fetch(url + `&ts=${Date.now()}`, { cache: 'no-store' as RequestCache });
                          const names = await res.json();
                          setOwnerRefOptions(Array.isArray(names) ? names : []);
                        } catch {
                          setOwnerRefOptions([]);
                        } finally {
                          setLoadingOwnerRef(false);
                        }
                      }}
                      freeSolo
                      options={ownerRefOptions}
                      loading={loadingOwnerRef}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={`${fieldDefinitions.owner_entity_reference.label} *`}
                          required
                          fullWidth
                          margin="normal"
                          error={!!(errors as any).owner_entity_reference}
                          helperText={(errors as any).owner_entity_reference?.message}
                          onBlur={onBlur}
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {loadingOwnerRef ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />
                  )}
                />
              )}
              
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

              <FormControlLabel
                control={
                  <Switch
                    checked={isEntityOwner}
                    onChange={(e) => {
                      // Preserve only relevant form values before toggle
                      const currentValues = getValues();
                      const preservableValues = getPreservableFields(currentValues);
                      setPreservedFormValues(preservableValues);
                      setIsEntityOwner(e.target.checked);
                    }}
                    color="primary"
                  />
                }
                label="Entity Owner"
                sx={{ mt: 2 }}
              />

              {/* Owner-only block: DAG fields first, then table fields */}
              {isEntityOwner && entityType === 'dag' && (
                <>
                  {/* DAG Name & Description now below the toggle */}
                  <Controller
                    name="dag_name"
                    control={control}
                    render={({ field: { onChange, value, onBlur } }) => (
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
                            label={fieldDefinitions.dag_name.label}
                            required
                            fullWidth
                            margin="normal"
                            error={!!(errors as any).dag_name}
                            helperText={(errors as any).dag_name?.message}
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
                        rows={2}
                        error={!!(errors as any).dag_description}
                        helperText={(errors as any).dag_description?.message}
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
                        error={!!(errors as any).dag_schedule}
                        helperText={(errors as any).dag_schedule?.message}
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
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === '' ? '' : Number(v));
                        }}
                        inputProps={{ min: 1, inputMode: 'numeric' }}
                        error={!!errors.expected_runtime_minutes}
                        helperText={errors.expected_runtime_minutes?.message}
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
                        error={!!(errors as any).dag_dependency}
                        helperText={(errors as any).dag_dependency?.message || "Comma-separated list of DAG names"}
                        placeholder="dag1,dag2,dag3"
                      />
                    )}
                  />
              
                  <Controller
                    name="donemarker_lookback"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Donemarker Lookback (Days) *"
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
                    name="server_name"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={fieldDefinitions.server_name.label}
                        fullWidth
                        margin="normal"
                        error={!!(errors as any).server_name}
                        helperText={(errors as any).server_name?.message}
                        placeholder={fieldDefinitions.server_name.placeholder}
                      />
                    )}
                  />

                  <Controller
                    name="donemarker_location"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={`${fieldDefinitions.donemarker_location.label} *`}
                        required
                        type={fieldDefinitions.donemarker_location.type}
                        placeholder={fieldDefinitions.donemarker_location.placeholder}
                        fullWidth
                        margin="normal"
                        error={!!errors.donemarker_location}
                        helperText={errors.donemarker_location?.message}
                      />
                    )}
                  />

                  <Controller
                    name="owner_email"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={`${fieldDefinitions.owner_email.label} *`}
                        required
                        type={fieldDefinitions.owner_email.type}
                        placeholder={fieldDefinitions.owner_email.placeholder}
                        fullWidth
                        margin="normal"
                        error={!!errors.owner_email}
                        helperText={errors.owner_email?.message}
                      />
                    )}
                  />
                </>
              )}
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