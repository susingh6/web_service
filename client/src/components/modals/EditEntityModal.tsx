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
  Tooltip,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { validateTenant, validateTeam, validateDag } from '@/lib/validationUtils';
import { fetchWithCacheGeneric, getFromCacheGeneric } from '@/lib/cacheUtils';
import { useEntityMutation } from '@/utils/cache-management';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Entity } from '@shared/schema';
import { endpoints, buildUrl } from '@/config';
import { useQuery } from '@tanstack/react-query';
import { entitiesApi } from '@/features/sla/api';
import { fieldDefinitions } from '@/config/schemas';

type EntityType = 'table' | 'dag';

interface EditEntityModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
  initialTenantName?: string;
  initialTeamName?: string;
}

// Common schema fields shared between both forms
const baseSchema = yup.object().shape({
  entity_name: yup.string().required('Entity name is required'),
  tenant_name: yup.string().required('Tenant name is required'),
  team_name: yup.string().required('Team name is required'),
  notification_preferences: yup.array().of(yup.string()).default([]),
  is_entity_owner: fieldDefinitions.is_entity_owner.validation,
  owner_entity_ref_name: yup.string()
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
      otherwise: (schema) => schema.optional().notRequired()
    }),
  donemarker_location: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => fieldDefinitions.donemarker_location.validation,
      otherwise: (schema) => schema.optional().notRequired()
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
      otherwise: (schema) => schema.optional().notRequired()
    }),
  table_dependency: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => schema.optional(),
      otherwise: (schema) => schema.optional().notRequired()
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
      otherwise: (schema) => schema.optional().notRequired()
    }),
  dag_dependency: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => schema.optional(),
      otherwise: (schema) => schema.optional().notRequired()
    }),
  server_name: yup.string()
    .when('is_entity_owner', {
      is: true,
      then: (schema) => schema.optional(),
      otherwise: (schema) => schema.optional().notRequired()
    }),
});

const EditEntityModal = ({ open, onClose, entity, teams, initialTenantName, initialTeamName }: EditEntityModalProps) => {
  const { updateEntity } = useEntityMutation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);


  // Determine entity type from the entity - use robust inference
  const entityType: EntityType = entity?.type === 'dag' ? 'dag' : 
    entity?.type === 'table' ? 'table' :
    (entity as any)?.dag_name ? 'dag' : 'table';

  // State for dynamic options - initialize from cache for instant load
  const [tenantOptions, setTenantOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('tenants', ['Ad Engineering', 'Data Engineering']));
  const [teamOptions, setTeamOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('teams', ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']));
  const [dagOptions, setDagOptions] = useState<string[]>(() => getFromCacheGeneric<string[]>('dags', ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing']));
  const isLockedContext = Boolean(initialTeamName && initialTenantName);

  // Loading states
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingDags, setLoadingDags] = useState(false);
  const [ownerRefOptions, setOwnerRefOptions] = useState<string[]>([]);
  const [loadingOwnerRef, setLoadingOwnerRef] = useState<boolean>(false);

  // State for validation errors
  const [validationError, setValidationError] = useState<string | null>(null);

  // Dynamic schema selection
  const schema = React.useMemo(() => 
    entityType === 'table' ? tableSchema : dagSchema, 
    [entityType]
  );

  // Fetch entity details for pre-population using entity_name - remove fragile type gating
  const { data: entityDetails, isLoading: isLoadingEntityDetails } = useQuery({
    queryKey: ['entity-details-by-name', entity?.name, entity?.team_name, entityType],
    queryFn: async () => {
      if (!entity?.name || !entity?.team_name) return null;

      try {
        // Use the new entity_name-based API call with inferred type
        const detailsData = await entitiesApi.readEntityByName({
          type: entityType as 'table' | 'dag',
          entityName: entity.name,
          teamName: entity.team_name,
          entity: entity
        });

        console.debug('[EditEntityModal] Raw API response:', { 
          entityName: entity.name, 
          teamName: entity.team_name,
          entityType: entity.type,
          table_schedule_in_response: detailsData.table_schedule,
          expected_runtime_minutes_in_response: detailsData.expected_runtime_minutes,
          detailsDataKeys: Object.keys(detailsData),
          detailsData 
        });

        // Check for warning field from FastAPI failure
        if (detailsData.warning) {
          toast({
            variant: "destructive",
            title: "⚠️ Server unavailable - showing cached data",
            description: "Some fields may be missing or outdated. Please save carefully or try again in a few moments.",
            duration: 5000,
          });
        }

        // Normalize team_name from various possible API response formats
        const normalizedTeamName = detailsData.team_name || '';

        // Extract owner emails from owner_details (can be single object, array, or null)
        let ownerEmails: string[] = [];
        if (detailsData.owner_details) {
          if (Array.isArray(detailsData.owner_details)) {
            // Multiple owners: extract all emails
            ownerEmails = detailsData.owner_details
              .map((owner: any) => owner.user_email)
              .filter(Boolean);
          } else if (typeof detailsData.owner_details === 'object') {
            // Single owner: extract email
            if (detailsData.owner_details.user_email) {
              ownerEmails = [detailsData.owner_details.user_email];
            }
          }
        }

        // Normalize arrays from FastAPI response
        const normalizeArray = (field: any): string => {
          if (!field) return '';
          if (Array.isArray(field)) return field.join(',');
          return String(field);
        };

        const normalized = {
          ...detailsData,
          team_name: normalizedTeamName,
          // Ensure name field exists for form compatibility
          name: detailsData.entity_name || detailsData.name,
          // Add owner_email field from owner_details
          owner_email: ownerEmails.length > 0 ? ownerEmails.join(',') : (detailsData.owner_email || ''),
          // Normalize array fields to comma-separated strings for form
          donemarker_lookback: normalizeArray(detailsData.donemarker_lookback),
          table_donemarker_location: normalizeArray(detailsData.table_donemarker_location),
          dag_donemarker_location: normalizeArray(detailsData.dag_donemarker_location),
          table_dependency: normalizeArray(detailsData.table_dependency),
          dag_dependency: normalizeArray(detailsData.dag_dependency),
        };

        console.debug('[EditEntityModal] Normalized entity details:', { 
          entityName: entity.name, 
          originalTeamName: detailsData.team_name,
          normalizedTeamName,
          teamId: detailsData.teamId,
          hasWarning: !!detailsData.warning,
          table_schedule: normalized.table_schedule,
          dag_schedule: normalized.dag_schedule,
          fullNormalized: normalized
        });

        return normalized;
      } catch (error) {
        // Entity details API not available, using existing entity data
        // Fallback to basic entity data with enhanced mock data structure
        return {
          ...entity,
          // Mock comprehensive field structure based on entity type
          tenant_name: entity.tenant_name || (entityType === 'table' ? 'Data Engineering' : 'Analytics'),
          team_name: entity.team_name || initialTeamName || '',
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
    enabled: Boolean(entity?.name && entity?.team_name && open),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const tableForm = useForm({
    resolver: yupResolver(tableSchema),
    defaultValues: {
      entity_name: '',
      tenant_name: '',
      team_name: '',
      notification_preferences: [],
      is_entity_owner: false,
      owner_entity_ref_name: '',
      is_active: true,
      expected_runtime_minutes: undefined,
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
      owner_entity_ref_name: '',
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
      
      console.log('[EditEntityModal] entityDetails at form reset:', {
        table_schedule: (entityDetails as any).table_schedule,
        dag_schedule: (entityDetails as any).dag_schedule,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes,
        keys: Object.keys(entityDetails),
        fullEntityDetails: entityDetails
      });

      // Map entity details to form fields
      const formData = entityType === 'table' ? {
        entity_name: entityDetails.entity_name || entityDetails.name || '',
        tenant_name: entityDetails.tenant_name || '',
        team_name: entityDetails.team_name || '',
        notification_preferences: entityDetails.notification_preferences || [],
        is_entity_owner: entityDetails.is_entity_owner || false,
        owner_entity_ref_name: (typeof (entityDetails as any).owner_entity_ref_name === 'string'
          ? (entityDetails as any).owner_entity_ref_name
          : (entityDetails as any).owner_entity_ref_name?.entity_owner_name) || (entityDetails as any).owner_entity_reference || '',

        is_active: entityDetails.is_active !== undefined ? entityDetails.is_active : true,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes ?? undefined,
        donemarker_location: entityDetails.table_donemarker_location || entityDetails.donemarker_location || '',
        donemarker_lookback: entityDetails.donemarker_lookback || 0,
        schema_name: (entityDetails as any).schema_name || '',
        table_name: (entityDetails as any).table_name || entityDetails.entity_name || entityDetails.name || '',
        table_description: (entityDetails as any).table_description || entityDetails.description || '',
        table_schedule: (entityDetails as any).table_schedule || '',
        table_dependency: (entityDetails as any).table_dependency || '',
      } : {
        entity_name: entityDetails.entity_name || entityDetails.name || '',
        tenant_name: entityDetails.tenant_name || '',
        team_name: entityDetails.team_name || '',
        notification_preferences: entityDetails.notification_preferences || [],
        is_entity_owner: entityDetails.is_entity_owner || false,
        owner_entity_ref_name: (typeof (entityDetails as any).owner_entity_ref_name === 'string'
          ? (entityDetails as any).owner_entity_ref_name
          : (entityDetails as any).owner_entity_ref_name?.entity_owner_name) || (entityDetails as any).owner_entity_reference || '',

        is_active: entityDetails.is_active !== undefined ? entityDetails.is_active : true,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes ?? undefined,
        donemarker_location: entityDetails.dag_donemarker_location || entityDetails.donemarker_location || '',
        donemarker_lookback: entityDetails.donemarker_lookback || 0,
        dag_name: (entityDetails as any).dag_name || entityDetails.entity_name || entityDetails.name || '',
        dag_description: (entityDetails as any).dag_description || entityDetails.description || '',
        dag_schedule: (entityDetails as any).dag_schedule || '',
        dag_dependency: (entityDetails as any).dag_dependency || '',
        server_name: (entityDetails as any).server_name || '',
      };

      console.log('[EditEntityModal] Resetting form with data:', {
        table_schedule: formData.table_schedule || (formData as any).dag_schedule,
        expected_runtime_minutes: formData.expected_runtime_minutes,
        fullFormData: formData
      });

      reset(formData);

      // Load cache data when modal opens
      if (isLockedContext) {
        setTenantOptions(initialTenantName ? [initialTenantName] : []);
        setTeamOptions(initialTeamName ? [initialTeamName] : []);
      } else {
        setTenantOptions(getFromCacheGeneric<string[]>('tenants', ['Ad Engineering', 'Data Engineering']));
        setTeamOptions(getFromCacheGeneric<string[]>('teams', ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']));
      }
      if (entityType === 'dag') {
        setDagOptions(getFromCacheGeneric<string[]>('dags', ['agg_daily', 'agg_hourly', 'PGM_Freeview_Play_Agg_Daily', 'CHN_agg', 'CHN_billing']));
      }
    } else if (!open) {
      // Reset form when modal is closed
      reset();
    }
  }, [entityDetails, reset, open, entityType, isLoadingEntityDetails, isLockedContext, initialTenantName, initialTeamName]);

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

      // Get user email from authentication context with proper type handling
      const userEmail = (user as any)?.email || (user as any)?.mail || (user as any)?.preferredUsername || '';
      if (!userEmail) {
        setValidationError('User email not found. Please log in again.');
        return;
      }

      // Build canonical PATCH updates: send only changed fields; use null when user cleared
      const prev: any = entityDetails || {};
      const updates: any = {};

      const toNull = (v: any) => {
        if (v === undefined || v === null) return null;
        if (typeof v === 'string' && v.trim() === '') return null;
        return v;
      };
      const parseStringOrList = (val: any): string | string[] | null => {
        if (val === undefined || val === null) return null;
        if (Array.isArray(val)) {
          const out = val.map((x) => String(x).trim()).filter((s) => s.length > 0);
          return out.length > 1 ? out : (out[0] || null);
        }
        const s = String(val).trim();
        if (!s) return null;
        if (s.includes(',')) {
          const out = s.split(',').map((x) => x.trim()).filter((t) => t.length > 0);
          return out.length > 1 ? out : (out[0] || null);
        }
        return s;
      };
      const parseIntOrList = (val: any): number | number[] | null => {
        if (val === undefined || val === null || val === '') return null;
        if (Array.isArray(val)) {
          const nums = val.map((x) => parseInt(String(x), 10)).filter((n) => !isNaN(n) && n >= 0);
          return nums.length > 0 ? nums : null;
        }
        const s = String(val).trim();
        if (s.includes(',')) {
          const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 0);
          return nums.length > 0 ? nums : null;
        }
        const n = parseInt(s, 10);
        return isNaN(n) ? null : n;
      };
      const changed = (next: any, prevVal: any) => JSON.stringify(next ?? null) !== JSON.stringify(prevVal ?? null);

      // Common fields (both types)
      if (changed(data.is_active, prev.is_active)) updates.is_active = !!data.is_active;
      if (changed(data.expected_runtime_minutes, prev.expected_runtime_minutes)) updates.expected_runtime_minutes = toNull(data.expected_runtime_minutes);
      if (changed(data.server_name, prev.server_name)) updates.server_name = toNull(data.server_name);
      // Map common field to prefixed ownership fields
      if (changed(data.donemarker_location, prev.donemarker_location)) {
        if (String(entityType) === 'dag') updates.dag_donemarker_location = parseStringOrList(data.donemarker_location);
        if (String(entityType) === 'table') updates.table_donemarker_location = parseStringOrList(data.donemarker_location);
      }
      if (changed(data.donemarker_lookback, prev.donemarker_lookback)) updates.donemarker_lookback = parseIntOrList(data.donemarker_lookback);

      const wasOwner = !!prev.is_entity_owner;
      const nowOwner = data.is_entity_owner === true ? true : (data.is_entity_owner === false ? false : wasOwner);

      if (entityType === 'dag') {
        if (nowOwner) {
          // Owner editable fields
          if (changed(data.dag_name, prev.dag_name)) updates.dag_name = toNull(data.dag_name);
          if (changed(data.dag_schedule, prev.dag_schedule)) updates.dag_schedule = toNull(data.dag_schedule);
          if (changed((data as any).dag_description, prev.dag_description)) updates.dag_description = toNull((data as any).dag_description);
          if (changed((data as any).dag_dependency, prev.dag_dependency)) updates.dag_dependency = parseStringOrList((data as any).dag_dependency);
          if (changed((data as any).owner_email, prev.owner_email)) updates.owner_email = parseStringOrList((data as any).owner_email);
          // If switching from non-owner to owner, clear reference
          if (!wasOwner && nowOwner) updates.owner_entity_ref_name = null;
        } else {
          // Non-owner: require/reference owner; null-out owner-only fields
          if (changed((data as any).owner_entity_ref_name, prev.owner_entity_ref_name?.entity_owner_name || prev.owner_entity_reference)) {
            updates.owner_entity_ref_name = toNull((data as any).owner_entity_ref_name);
          }
          updates.owner_email = null;
          updates.dag_name = null;
          updates.dag_schedule = null;
          updates.dag_description = null;
          updates.dag_dependency = null;
          updates.expected_runtime_minutes = null;
          if (String(entityType) === 'dag') updates.dag_donemarker_location = null;
          if (String(entityType) === 'table') updates.table_donemarker_location = null;
          updates.donemarker_lookback = null;
        }
      } else {
        // table
        if (nowOwner) {
          if (changed(data.schema_name, prev.schema_name)) updates.schema_name = toNull(data.schema_name);
          if (changed(data.table_name, prev.table_name)) updates.table_name = toNull(data.table_name);
          if (changed(data.table_schedule, prev.table_schedule)) updates.table_schedule = toNull(data.table_schedule);
          if (changed((data as any).table_description, prev.table_description)) updates.table_description = toNull((data as any).table_description);
          if (changed((data as any).table_dependency, prev.table_dependency)) updates.table_dependency = parseStringOrList((data as any).table_dependency);
          if (changed((data as any).owner_email, prev.owner_email)) updates.owner_email = parseStringOrList((data as any).owner_email);
          if (!wasOwner && nowOwner) updates.owner_entity_ref_name = null;
        } else {
          if (changed((data as any).owner_entity_ref_name, prev.owner_entity_ref_name?.entity_owner_name || prev.owner_entity_reference)) {
            updates.owner_entity_ref_name = toNull((data as any).owner_entity_ref_name);
          }
          updates.owner_email = null;
          updates.table_name = null;
          updates.table_schedule = null;
          updates.table_description = null;
          updates.table_dependency = null;
          updates.expected_runtime_minutes = null;
          if (String(entityType) === 'dag') updates.dag_donemarker_location = null;
          if (String(entityType) === 'table') updates.table_donemarker_location = null;
          updates.donemarker_lookback = null;
        }
      }

      // Always include current team_name and tenant_name for FastAPI/Express compatibility (no change of ownership context)
      if (!('team_name' in updates) && prev.team_name) {
        updates.team_name = prev.team_name;
      }
      if (!('tenant_name' in updates) && prev.tenant_name) {
        updates.tenant_name = prev.tenant_name;
      }
      // Final cleanup: remove undefined, keep nulls (intentional clears)
      Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

      const entityData = { ...updates, action_by_user_email: userEmail };

      console.log('🚀 ENTITY UPDATE START:', { entityName: entity.name, entityType, entityData });

      // Use modern cache-management approach with automatic cache invalidation
      const result = await updateEntity(entity.name, entityType, entityData);

      console.log('✅ ENTITY UPDATE SUCCESS:', result);

      toast({
        title: 'Success',
        description: `${entity.name} has been updated successfully.`,
        variant: 'default',
      });

      onClose();
    } catch (error) {
      // Close modal first so the toast is visible unobstructed
      onClose();
      const extractMessage = (err: any): string => {
        const raw = err?.message ?? String(err ?? 'Unknown error');
        try {
          const maybe = JSON.parse(raw);
          if (maybe && typeof maybe.message === 'string') return maybe.message;
        } catch {}
        const jsonStart = raw.indexOf('{');
        if (jsonStart !== -1) {
          try {
            const inner = JSON.parse(raw.slice(jsonStart));
            if (inner && typeof inner.message === 'string') return inner.message;
          } catch {}
        }
        return raw;
      };
      const cleanMessage = extractMessage(error);
      toast({
        title: 'Error',
        description: `Failed to update: ${cleanMessage}`,
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
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="sm" 
      fullWidth
      sx={{ zIndex: 9999 }}
      disablePortal={false}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography component="span" variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
          Edit {entityType.toUpperCase()} Entity
        </Typography>
        <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <form 
        onSubmit={(e) => {
          e.preventDefault();
          const currentForm = entityType === 'table' ? tableForm : dagForm;
          currentForm.handleSubmit(onSubmit)(e);
        }}
      >
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Entity Type: <strong>{entityType.toUpperCase()}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', mt: 1 }}>
              Entity: {entity?.name} | Team: {entity?.team_name} | Owner: {entity?.is_entity_owner ? 'Yes' : 'No'}
            </Typography>
          </Box>

          {validationError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {validationError}
            </Alert>
          )}

          {isLoadingEntityDetails ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Loading entity details...</Typography>
            </Box>
          ) : !entityDetails ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Unable to load entity details. Please try again.
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Fields marked with an asterisk (*) are mandatory
              </Typography>

              {/* Common Fields */}
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
                          disabled={true}
                          error={!!errors.entity_name}
                          helperText={errors.entity_name?.message || "Entity name cannot be changed"}
                          placeholder={fieldDefinitions.entity_name.placeholder}
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
                    freeSolo={!isLockedContext}
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
                    disabled={isLockedContext}
                    value={value}
                    onChange={(_, newValue) => {
                      onChange(newValue);
                    }}
                    freeSolo={!isLockedContext}
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

              {entityType === 'table' && entityDetails?.is_entity_owner && (
                <>
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
              )}


              {entityType === 'dag' && entityDetails?.is_entity_owner && (
                <>

              <Controller
                name="dag_name"
                control={control}
                render={({ field: { onChange, value, onBlur, ref } }) => (
                  <Autocomplete
                    value={value}
                    onChange={(_, newValue) => {
                      onChange(newValue);
                    }}
                    openOnFocus
                    freeSolo
                    options={dagOptions}
                    loading={loadingDags}
                    onInputChange={(_e, newInputValue, reason) => {
                      if (reason === 'input' || reason === 'clear') {
                        onChange(newInputValue || '');
                      }
                    }}
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


            </>
          )}


          {!entityDetails?.is_entity_owner && (
            <Controller
              name="owner_entity_ref_name"
              control={control}
              render={({ field: { onChange, value, onBlur } }) => (
                <Autocomplete
                  value={value}
                  onChange={(_, newValue) => onChange(newValue)}
                  openOnFocus
                  onOpen={() => {
                    const typeParam: 'table' | 'dag' = (entity?.type || 'dag') === 'table' ? 'table' : 'dag';
                    fetch(`/api/entities/owner-reference-options?type=${encodeURIComponent(typeParam)}&limit=50&ts=${Date.now()}`, { cache: 'no-store' as RequestCache })
                      .then(r => r.json())
                      .then(names => setOwnerRefOptions(Array.isArray(names) ? names : []))
                      .catch(() => setOwnerRefOptions([]));
                  }}
                  onFocus={() => {
                    const typeParam: 'table' | 'dag' = (entity?.type || 'dag') === 'table' ? 'table' : 'dag';
                    fetch(`/api/entities/owner-reference-options?type=${encodeURIComponent(typeParam)}&limit=50&ts=${Date.now()}`, { cache: 'no-store' as RequestCache })
                      .then(r => r.json())
                      .then(names => setOwnerRefOptions(Array.isArray(names) ? names : []))
                      .catch(() => setOwnerRefOptions([]));
                  }}
                  onInputChange={async (_e, newInputValue, reason) => {
                    try {
                      if (reason === 'input' || reason === 'clear') {
                        onChange(newInputValue || '');
                      }
                      const q = newInputValue?.trim();
                      const typeParam = (entity?.type || 'dag') === 'table' ? 'table' : 'dag';
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
                      error={!!(errors as any).owner_entity_ref_name}
                      helperText={(errors as any).owner_entity_ref_name?.message}
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


          {entityDetails?.is_entity_owner && (
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
                    value={field.value ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      field.onChange(v === '' ? '' : Number(v));
                    }}
                    inputProps={{ min: 1, max: 1440, inputMode: 'numeric' }}
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
                    helperText={errors.donemarker_location?.message || 'Comma-separated list for multiple done marker locations'}
                  />
                )}
              />

              <Controller
                name="donemarker_lookback"
                control={control}
                render={({ field }) => {
                  const list: (string | number)[] = Array.isArray(field.value)
                    ? field.value
                    : (field.value === undefined || field.value === null || (typeof field.value === 'string' && field.value === '')
                        ? ['']
                        : [Number.isFinite(field.value as any) ? Number(field.value) : String(field.value)]);
                  const setAt = (idx: number, val: string) => {
                    const next: any[] = [...list];
                    next[idx] = val === '' ? '' : Number(val);
                    field.onChange(next);
                  };
                  const addOne = () => field.onChange([...list, '']);
                  const removeAt = (idx: number) => {
                    const next = list.filter((_, i) => i !== idx);
                    field.onChange(next.length > 0 ? next : ['']);
                  };
                  return (
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {list.map((v: any, idx: number) => (
                          <div key={`lookback-edit-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <TextField
                              label={idx === 0 ? 'Done Marker Lookback (Days) *' : 'Additional Lookback'}
                    type="number"
                    fullWidth
                    margin="normal"
                              value={v ?? ''}
                              onChange={(e) => setAt(idx, e.target.value)}
                              inputProps={{ min: 0, inputMode: 'numeric' }}
                            />
                            <Button variant="outlined" onClick={() => removeAt(idx)} disabled={list.length === 1}>Remove</Button>
                          </div>
                        ))}
                      </div>
                      <Tooltip
                        title="Use this to add another lookback window when you have multiple done marker locations and need different lookback period for each."
                        componentsProps={{ tooltip: { sx: { zIndex: 99999 } } }}
                      >
                        <Button variant="text" onClick={addOne} sx={{ mt: 1, position: 'relative', zIndex: 99999 }}>Add Additional Lookback</Button>
                      </Tooltip>
                    </div>
                  );
                }}
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
                    helperText={errors.table_dependency?.message || 'Comma-separated list for multiple table names'}
                      />
                    )}
                  />
                </>
              )}

              {entityDetails?.is_entity_owner && entityType === 'dag' && (
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
                        helperText={errors.dag_dependency?.message || 'Comma-separated list for multiple DAG names'}
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
