import { useState, useEffect } from 'react';
import {
  Autocomplete,
  Badge,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  IconButton,
  Paper,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  AlertTitle,
  Stepper,
  Step,
  StepLabel,
  LinearProgress,
  FormControl,
  FormControlLabel,
  Switch,
  Tooltip,
  Collapse
} from '@mui/material';
import { 
  Close as CloseIcon, 
  CloudUpload as CloudUploadIcon, 
  Download as DownloadIcon, 
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Refresh as RefreshIcon,
  Filter as FilterIcon,
  FilterAlt as FilterAltIcon,
  DeleteOutline as DeleteOutlineIcon
} from '@mui/icons-material';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { fetchWithCacheGeneric, getFromCacheGeneric } from '@/lib/cacheUtils';
import { buildUrl, endpoints } from '@/config/index';
import { apiRequest } from '@/lib/queryClient';
import { fieldDefinitions } from '@/config/schemas';
import { entityRequest } from '@/features/sla/api';
import { useOptimisticMutation } from '@/utils/cache-management';
import { invalidateEntityCaches, cacheKeys } from '@/lib/cacheKeys';
import { useQueryClient } from '@tanstack/react-query';
import { useEntityMutation } from '@/utils/cache-management';

// Entity types for validation
interface BaseEntity {
  entity_name: string;
  tenant_name: string;
  team_name: string;
  expected_runtime_minutes?: number | null;
  donemarker_lookback?: number | null;
  user_email: string;
  owner_email?: string | null;
  is_active?: boolean;
  is_entity_owner?: boolean; // controls conditional validation
  owner_entity_ref_name?: string | null; // canonical for non-owners
}

interface TableEntity extends BaseEntity {
  schema_name: string;
  table_name: string;
  table_description?: string;
  table_schedule?: string; // Optional if not entity owner
  table_dependency?: string | string[];  // Can be either a comma-separated string or string array
  table_donemarker_location?: string | null; // canonical ownership field
}

interface DagEntity extends BaseEntity {
  dag_name: string;
  dag_description?: string;
  dag_schedule?: string; // Optional if not entity owner
  dag_dependency?: string | string[];  // Can be either a comma-separated string or string array
  needs_dag_validation?: boolean;  // Flag to indicate if this is a new DAG that needs backend validation
  dag_donemarker_location?: string | null; // canonical ownership field
}

type Entity = TableEntity | DagEntity;

// Validation result for an entity
interface ValidationResult {
  valid: boolean;
  entity: Entity;
  errors: {
    field: string;
    message: string;
  }[];
}

// Steps in the multi-step upload process
type UploadStep = 'upload' | 'validate' | 'submit';

// Filter options for the validation table
type ValidityFilter = 'all' | 'valid' | 'invalid';

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
}

const BulkUploadModal = ({ open, onClose }: BulkUploadModalProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { createEntity } = useEntityMutation();
  const { executeWithOptimism } = useOptimisticMutation();
  const [tabValue, setTabValue] = useState('tables');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Multi-step process state
  const [currentStep, setCurrentStep] = useState<UploadStep>('upload');
  const [parsedEntities, setParsedEntities] = useState<Entity[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>('all');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<{
    totalCount: number;
    validCount: number;
    invalidCount: number;
    successCount: number;
    failedCount: number;
  }>({
    totalCount: 0,
    validCount: 0,
    invalidCount: 0,
    successCount: 0,
    failedCount: 0
  });
  
  // State for dynamic options
  const [tenantOptions, setTenantOptions] = useState<string[]>(['Ad Engineering', 'Data Engineering']);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [teams, setTeams] = useState<{ id: number; name: string; tenant_name: string }[]>([]);
  const [dagOptions, setDagOptions] = useState<string[]>([]);
  
  // Loading states
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingDags, setLoadingDags] = useState(false);
  
  // Removed DAG-tab fetch on open; all network calls happen on Validate
  useEffect(() => {
    // no-op
  }, [open, tabValue]);

  // Removed automatic re-validation on tab toggle to avoid extra API calls
  
  // Functions to fetch options
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
      const teamsData = await response.json();
      const teamNames = teamsData.map((team: any) => team.name);
      setTeamOptions(teamNames);
      setTeams(teamsData); // Store full team objects for tenant-aware lookup
    } catch (error) {
      console.error('Error fetching team options:', error);
      setTeamOptions([]);
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  };
  
  const fetchDagOptions = async () => {
    setLoadingDags(true);
    try {
      const options = await fetchWithCacheGeneric<string[]>(buildUrl(endpoints.debug.teams), 'dags');
      setDagOptions(options);
    } catch (error) {
      console.error('Error fetching DAG options:', error);
    } finally {
      setLoadingDags(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setTabValue(newValue);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFile(droppedFile);
    }
  };

  // Function to validate a single entity and return validation result
  const validateEntity = (entity: any, entityType: 'tables' | 'dags'): ValidationResult => {
    const errors: { field: string; message: string }[] = [];
    
    // Flag for new DAG entries that need backend validation
    const isNewDag = entityType === 'dags' && entity.dag_name && 
      dagOptions.length > 0 && !dagOptions.includes(entity.dag_name);
    
    // Add needs_dag_validation flag to entities with new DAG names
    if (isNewDag) {
      entity.needs_dag_validation = true;
    }
    
    // Common required fields validation using centralized field definitions
    // Entity name is required
    if (!entity.entity_name) {
      errors.push({ field: 'entity_name', message: `${fieldDefinitions.entity_name.label} is required` });
    }
    
    // Tenant name must exist in the predefined list
    if (!entity.tenant_name) {
      errors.push({ field: 'tenant_name', message: `${fieldDefinitions.tenant_name.label} is required` });
    } else if (tenantOptions.length > 0 && !tenantOptions.includes(entity.tenant_name)) {
      errors.push({ field: 'tenant_name', message: `${fieldDefinitions.tenant_name.label} "${entity.tenant_name}" is not in the known list. New tenant names are not allowed.` });
    }
    
    // Team name must exist in the predefined list
    if (!entity.team_name) {
      errors.push({ field: 'team_name', message: `${fieldDefinitions.team_name.label} is required` });
    } else if (teamOptions.length > 0 && !teamOptions.includes(entity.team_name)) {
      errors.push({ field: 'team_name', message: `${fieldDefinitions.team_name.label} "${entity.team_name}" is not in the known list. New team names are not allowed.` });
    }
    
    // Action By user email is auto-populated from the authenticated session; no upload validation
    
    // Entity Owner conditional fields
    if (entity.is_entity_owner === true) {
      // Expected runtime is required for entity owners
      if (entity.expected_runtime_minutes === undefined || entity.expected_runtime_minutes === null || entity.expected_runtime_minutes === '') {
        errors.push({ field: 'expected_runtime_minutes', message: `${fieldDefinitions.expected_runtime_minutes.label} is required when Entity Owner is enabled` });
      } else if (isNaN(Number(entity.expected_runtime_minutes)) || !Number.isInteger(Number(entity.expected_runtime_minutes))) {
        errors.push({ field: 'expected_runtime_minutes', message: `${fieldDefinitions.expected_runtime_minutes.label} must be an integer` });
      } else if (Number(entity.expected_runtime_minutes) < 1 || Number(entity.expected_runtime_minutes) > 1440) {
        errors.push({ field: 'expected_runtime_minutes', message: `${fieldDefinitions.expected_runtime_minutes.label} must be between 1 and 1440 minutes` });
      }
      
      // Owner email is required for entity owners with comma-separated validation
      if (!entity.owner_email) {
        errors.push({ field: 'owner_email', message: `${fieldDefinitions.owner_email.label} is required when Entity Owner is enabled` });
      } else {
        // Validate comma-separated emails
        const emails = entity.owner_email.split(',').map((email: string) => email.trim());
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        for (const email of emails) {
          if (!emailRegex.test(email)) {
            errors.push({ field: 'owner_email', message: `Invalid email format in ${fieldDefinitions.owner_email.label.toLowerCase()}: ${email}` });
            break;
          }
        }
      }
      
      // Done marker location is required for entity owners
      const ownerDonemarker2 = (entityType === 'tables') ? (entity as TableEntity).table_donemarker_location : (entity as DagEntity).dag_donemarker_location;
      if (!ownerDonemarker2) {
        const missingField = (entityType === 'tables') ? 'table_donemarker_location' : 'dag_donemarker_location';
        errors.push({ field: missingField, message: `${fieldDefinitions.donemarker_location.label} is required when Entity Owner is enabled` });
      } else {
        const vals = Array.isArray(ownerDonemarker2)
          ? ownerDonemarker2
          : (typeof ownerDonemarker2 === 'string' && ownerDonemarker2.includes(',')
              ? ownerDonemarker2.split(',').map((s: string) => s.trim())
              : [String(ownerDonemarker2)]);
        if (vals.some((s: string) => s.length === 0)) {
          errors.push({ field: (entityType === 'tables') ? 'table_donemarker_location' : 'dag_donemarker_location', message: `${fieldDefinitions.donemarker_location.label} entries must be non-empty` });
        }
      }
      
      // Done marker lookback is required for entity owners
      if (entity.donemarker_lookback === undefined || entity.donemarker_lookback === null || entity.donemarker_lookback === '') {
        errors.push({ field: 'donemarker_lookback', message: `${fieldDefinitions.donemarker_lookback.label} is required when Entity Owner is enabled` });
      } else if (Array.isArray(entity.donemarker_lookback)) {
        const bad = entity.donemarker_lookback.some((v: any) => isNaN(Number(v)) || !Number.isInteger(Number(v)) || Number(v) < 0);
        if (bad) {
          errors.push({ field: 'donemarker_lookback', message: `${fieldDefinitions.donemarker_lookback.label} must be integer(s)` });
        }
      } else if (typeof entity.donemarker_lookback === 'string' && entity.donemarker_lookback.includes(',')) {
        const parts = String(entity.donemarker_lookback).split(',').map(s => s.trim());
        const bad = parts.some((p) => isNaN(Number(p)) || !Number.isInteger(Number(p)) || Number(p) < 0);
        if (bad) {
          errors.push({ field: 'donemarker_lookback', message: `${fieldDefinitions.donemarker_lookback.label} must be integer(s)` });
        }
      } else if (isNaN(Number(entity.donemarker_lookback)) || !Number.isInteger(Number(entity.donemarker_lookback))) {
        errors.push({ field: 'donemarker_lookback', message: `${fieldDefinitions.donemarker_lookback.label} must be an integer` });
      } else if (Number(entity.donemarker_lookback) < 0) {
        errors.push({ field: 'donemarker_lookback', message: `${fieldDefinitions.donemarker_lookback.label} must be a non-negative number` });
      }
    } else if (entity.is_entity_owner === false) {
      // Owner Entity Reference is required for non-entity owners
      if (!(entity as any).owner_entity_ref_name) {
        errors.push({ field: 'owner_entity_ref_name', message: `owner_entity_ref_name is required when Entity Owner is disabled` });
      }
    }
    
    // Entity type specific validation using centralized field definitions
    if (entityType === 'tables') {
      // schema_name and table_name required only for owners
      if (entity.is_entity_owner === true) {
      if (!entity.schema_name) {
          errors.push({ field: 'schema_name', message: `${fieldDefinitions.schema_name.label} is required when Entity Owner is enabled` });
      }
      if (!entity.table_name) {
          errors.push({ field: 'table_name', message: `${fieldDefinitions.table_name.label} is required when Entity Owner is enabled` });
      }
        if (!entity.table_schedule) {
          errors.push({ field: 'table_schedule', message: `${fieldDefinitions.table_schedule.label} is required when Entity Owner is enabled` });
        } else if (!/^[\d*\/ ,\-]+$/.test(entity.table_schedule)) {
          errors.push({ field: 'table_schedule', message: `Invalid ${fieldDefinitions.table_schedule.label.toLowerCase()} format` });
        }
      }
    } else { // DAGs validation
      if (entity.is_entity_owner === true && !entity.dag_name) {
        errors.push({ field: 'dag_name', message: `${fieldDefinitions.dag_name.label} is required when Entity Owner is enabled` });
      } else if (isNewDag) {
        // Only warn about new DAG names, don't treat as error since backend will validate
        // We already set the needs_dag_validation flag above
      }
      
      // DAG schedule only required if entity owner
      if (entity.is_entity_owner === true) {
        if (!entity.dag_schedule) {
          errors.push({ field: 'dag_schedule', message: `${fieldDefinitions.dag_schedule.label} is required when Entity Owner is enabled` });
        } else if (!/^[\d*\/ ,\-]+$/.test(entity.dag_schedule)) {
          errors.push({ field: 'dag_schedule', message: `Invalid ${fieldDefinitions.dag_schedule.label.toLowerCase()} format` });
        }
      }
    }
    
    // Set default for is_active if not specified
    if (entity.is_active === undefined || entity.is_active === null) {
      entity.is_active = true;
    }
    
    // If no errors, the entity is valid
    return {
      valid: errors.length === 0,
      entity: entity as Entity,
      errors
    };
  };

  // Process an uploaded file and move to validation step
  const handleFile = (selectedFile: File) => {
    // Check if the file is a JSON file
    if (selectedFile.type !== 'application/json' && !selectedFile.name.endsWith('.json')) {
      toast({
        title: 'Invalid file format',
        description: 'Please upload a JSON file.',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);
    
    // Reset validation state
    setParsedEntities([]);
    setValidationResults([]);
    
    // Read and parse the file
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string);
        
        // Check if it's an array
        if (!Array.isArray(jsonData)) {
          toast({
            title: 'Invalid JSON format',
            description: 'The JSON file must contain an array of entities.',
            variant: 'destructive',
          });
          return;
        }
        
        // If array is empty
        if (jsonData.length === 0) {
          toast({
            title: 'Empty file',
            description: 'The uploaded file contains an empty array. Please add entities to the file.',
            variant: 'destructive',
          });
          return;
        }
        
        toast({
          title: 'File parsed successfully',
          description: `Found ${jsonData.length} entities. Proceeding to validation.`,
        });
        
        // Store parsed entities and move to validation step
        setParsedEntities(jsonData);
        setCurrentStep('validate');
        validateEntities(jsonData);
      } catch (error) {
        toast({
          title: 'Error parsing JSON',
          description: 'The file contains invalid JSON.',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(selectedFile);
  };
  
  // Validate all entities in the parsed file
  const validateEntities = async (entities: any[]) => {
    setIsValidating(true);
    
    try {
      // Lazy-load options needed for validation on demand
      if (tenantOptions.length === 0) await fetchTenantOptions();
      if (teamOptions.length === 0) await fetchTeamOptions();
      // Validate each entity
      const results = entities.map(entity => validateEntity(entity, tabValue as 'tables' | 'dags'));
      
      // Update validation results
      setValidationResults(results);
      
      // Update validation summary
      const validCount = results.filter(result => result.valid).length;
      setUploadSummary({
        totalCount: entities.length,
        validCount,
        invalidCount: entities.length - validCount,
        successCount: 0,
        failedCount: 0
      });
      
      // Show toast with validation summary
      if (validCount === entities.length) {
        toast({
          title: 'Validation successful',
          description: `All ${entities.length} entities are valid.`,
        });
      } else {
        toast({
          title: 'Validation completed with issues',
          description: `${validCount} of ${entities.length} entities are valid. Please review the errors.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error during validation:', error);
      toast({
        title: 'Validation error',
        description: 'An unexpected error occurred during validation.',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      handleFile(event.target.files[0]);
    }
  };

  // Filter validation results based on validity filter
  const filteredValidationResults = () => {
    if (validityFilter === 'all') return validationResults;
    if (validityFilter === 'valid') return validationResults.filter(result => result.valid);
    return validationResults.filter(result => !result.valid);
  };
  
  // Handle filter change
  const handleFilterChange = (filter: ValidityFilter) => {
    setValidityFilter(filter);
  };
  
  // Move to previous step in the multi-step process
  const handleBack = () => {
    if (currentStep === 'validate') {
      setCurrentStep('upload');
      // Reset validation results
      setValidationResults([]);
      setParsedEntities([]);
    } else if (currentStep === 'submit') {
      setCurrentStep('validate');
    }
  };
  
  // Handle proceeding to the next step
  const handleNext = () => {
    if (currentStep === 'validate') {
      // Can only proceed if there are valid entities
      if (uploadSummary.validCount === 0) {
        toast({
          title: 'Cannot proceed',
          description: 'No valid entities found. Please fix the validation errors or upload a different file.',
          variant: 'destructive',
        });
        return;
      }
      
      setCurrentStep('submit');
    }
  };
  
  // Handle the actual bulk upload process - Single API call with all-or-nothing semantics
  const handleUpload = async () => {
    if (!file || validationResults.length === 0) {
      toast({
        title: 'No valid data',
        description: 'Please upload and validate a JSON file before submitting.',
        variant: 'destructive',
      });
      return;
    }
    
    // Get only the valid entities for upload
    const toNull = (v: any) => (v === '' || v === undefined ? null : v);
    const validEntities = validationResults
      .filter(result => result.valid)
      .map(result => {
        const e: any = { ...result.entity };
        const isTable = (tabValue === 'tables');
        const canonical: any = {
          entity_type: isTable ? 'table' : 'dag',
          entity_name: e.entity_name,
          tenant_name: e.tenant_name,
          team_name: e.team_name,
          is_active: e.is_active ?? true,
          is_entity_owner: e.is_entity_owner ?? false,
          action_by_user_email: (user as any)?.email || (user as any)?.user_email || e.user_email,
          expected_runtime_minutes: e.expected_runtime_minutes === undefined || e.expected_runtime_minutes === null || e.expected_runtime_minutes === ''
            ? null
            : parseInt(String(e.expected_runtime_minutes), 10),
          donemarker_lookback: (() => {
            const v = (e as any).donemarker_lookback;
            if (v === undefined || v === null || v === '') return null;
            if (Array.isArray(v)) {
              const nums = v.map((x: any) => parseInt(String(x), 10)).filter((n: number) => !isNaN(n) && n >= 0);
              return nums.length > 0 ? nums : null;
            }
            const s = String(v);
            if (s.includes(',')) {
              const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 0);
              return nums.length > 0 ? nums : null;
            }
            const n = parseInt(s, 10);
            return isNaN(n) ? null : n;
          })(),
          server_name: toNull(e.server_name),
        };
        if (isTable) {
          canonical.schema_name = toNull(e.schema_name);
          canonical.table_name = e.table_name;
          canonical.table_description = toNull(e.table_description);
          canonical.table_schedule = toNull(e.table_schedule);
          canonical.table_dependency = Array.isArray(e.table_dependency) ? e.table_dependency : (e.table_dependency ? String(e.table_dependency).split(',').map((s: string) => s.trim()) : null);
          canonical.table_donemarker_location = (() => {
            const v = (e as any).table_donemarker_location;
            if (v === undefined || v === null || v === '') return null;
            if (Array.isArray(v)) return v.map((x: any) => String(x).trim()).filter((s: string) => s.length > 0);
            const s = String(v).trim();
            if (s.includes(',')) return s.split(',').map((x) => x.trim()).filter((t) => t.length > 0);
            return s || null;
          })();
        } else {
          canonical.dag_name = e.dag_name;
          canonical.dag_description = toNull(e.dag_description);
          canonical.dag_schedule = toNull(e.dag_schedule);
          canonical.dag_dependency = Array.isArray(e.dag_dependency) ? e.dag_dependency : (e.dag_dependency ? String(e.dag_dependency).split(',').map((s: string) => s.trim()) : null);
          canonical.dag_donemarker_location = (() => {
            const v = (e as any).dag_donemarker_location;
            if (v === undefined || v === null || v === '') return null;
            if (Array.isArray(v)) return v.map((x: any) => String(x).trim()).filter((s: string) => s.length > 0);
            const s = String(v).trim();
            if (s.includes(',')) return s.split(',').map((x) => x.trim()).filter((t) => t.length > 0);
            return s || null;
          })();
        }
        if (canonical.is_entity_owner) {
          canonical.owner_email = (() => {
            const v = (e as any).owner_email;
            if (v === undefined || v === null) return null;
            if (Array.isArray(v)) {
              const emails = v.map((x: any) => String(x).trim()).filter((s: string) => s.length > 0);
              return emails.length > 1 ? emails : (emails[0] || null);
            }
            const s = String(v).trim();
            if (!s) return null;
            if (s.includes(',')) {
              const emails = s.split(',').map((x) => x.trim()).filter((t) => t.length > 0);
              return emails.length > 1 ? emails : (emails[0] || null);
            }
            return s;
          })();
        } else {
          canonical.owner_email = null;
          canonical.owner_entity_ref_name = toNull(e.owner_entity_ref_name || (e as any).owner_entity_reference);
        }
        return canonical;
      });
    
    // If no valid entities, show error
    if (validEntities.length === 0) {
      toast({
        title: 'No valid entities',
        description: 'There are no valid entities to upload.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Use existing createEntity mutation for each entity - this automatically handles:
      // ✅ Optimistic updates
      // ✅ Cache invalidation  
      // ✅ WebSocket broadcasting for real-time collaboration
      // ✅ Error handling and rollback
      // Get authenticated user's email from component-level hook
      const userEmail = user && 'email' in user ? user.email : null;
      
      if (!userEmail) {
        throw new Error('User email not found. Please log in again.');
      }

      // Redis-first bulk via Express transactional fallback; environment-aware API handles FastAPI when available
      const apiModule = await import('@/features/sla/api');
      const result = await apiModule.entitiesApi.bulkCreate(validEntities);
      
      // Update upload summary with results
      const successCount = Array.isArray(result) ? result.length : (result?.entities?.length || validEntities.length);
      const failedCount = 0; // All or nothing - if we get here, all succeeded
      
      setUploadSummary(prev => ({
        ...prev,
        successCount,
        failedCount
      }));
      
      // Show success message
      toast({
        title: 'Bulk upload successful',
        description: `Successfully created ${successCount} entities.`,
      });
      
      // Additional cache invalidation to ensure dashboard updates
      // This ensures summary dashboard reflects new entity counts across all filters
      const uniqueTenants = Array.from(new Set(validEntities.map(e => e.tenant_name)));
      const uniqueTeams = Array.from(new Set(validEntities.map(e => e.team_name)));
      
      // Invalidate caches for all affected tenants and teams
      for (const tenant of uniqueTenants) {
        for (const teamName of uniqueTeams) {
          // Get team ID from cache or make reasonable assumption
          const teamId = 1; // This would normally come from team data
          invalidateEntityCaches(queryClient, { 
            tenant, 
            teamId,
            // Include date ranges to ensure all dashboard filters are updated
            startDate: undefined,
            endDate: undefined
          });
        }
        
        // Also invalidate tenant-level caches
        invalidateEntityCaches(queryClient, { tenant });
      }
      
      // Emit dashboard update event for Redux-based components
      window.dispatchEvent(new CustomEvent('dashboard-data-updated', {
        detail: { 
          source: 'bulk-entity-creation',
          entityCount: successCount,
          tenants: uniqueTenants,
          teams: uniqueTeams
        }
      }));
      
      // Close modal after short delay
      setTimeout(() => {
        // Reset state
        setFile(null);
        setParsedEntities([]);
        setValidationResults([]);
        setCurrentStep('upload');
        setUploadSummary({
          totalCount: 0,
          validCount: 0,
          invalidCount: 0,
          successCount: 0,
          failedCount: 0
        });
        
        // Close modal
        onClose();
      }, 1500);
      
    } catch (error: any) {
      console.error('Error during bulk upload:', error);
      
      // Update summary to show all failed
      setUploadSummary(prev => ({
        ...prev,
        successCount: 0,
        failedCount: validEntities.length
      }));
      
      // Extract a clean human-readable message from API error shapes
      let message = 'All entities failed to upload. Please try again.';
      if (error && typeof error === 'object') {
        const data = (error as any).data || (error as any).response?.data || error;
        if (typeof data === 'string') {
          // Some layers stringify JSON into the message string
          const trimmed = data.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              const parsed = JSON.parse(trimmed);
              message = parsed?.message || parsed?.error || parsed?.detail || trimmed;
            } catch {
              message = trimmed;
            }
          } else {
            message = data;
          }
        } else if (data && typeof data === 'object') {
          message = data.message || data.error || data.detail || message;
        }
      }
      
      // Final safety: if message itself still looks like JSON, unwrap it
      if (typeof message === 'string') {
        const trimmedMsg = message.trim();
        if (trimmedMsg.startsWith('{') || trimmedMsg.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmedMsg);
            message = parsed?.message || parsed?.error || parsed?.detail || trimmedMsg;
          } catch {}
        }
      }
      
      toast({
        title: 'Bulk upload failed',
        description: message,
        variant: 'destructive',
      });

      // Close the modal so the toast is visible and the user can retry
      try { onClose(); } catch {}
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadSampleTemplate = () => {
    const entityType = tabValue;
    let sampleData;
    
    if (entityType === 'tables') {
      sampleData = [
        {
          entity_name: "Customer Analytics Table",
          tenant_name: "Data Engineering",
          team_name: "PGM",
          schema_name: "analytics",
          table_name: "customer_data",
          table_description: "Contains customer information with demographics",
          action_by_user_email: "john.doe@example.com",
          is_active: true,
          is_entity_owner: true,  // Entity owner - requires owner_email and conditional fields below
          owner_email: "john.doe@example.com",
          expected_runtime_minutes: 45,
          table_donemarker_location: "s3://data-warehouse/markers/customer_data/",
          donemarker_lookback: 1,
          table_schedule: "0 */4 * * *",  // Every 4 hours
          table_dependency: ["analytics.products", "analytics.orders"]  // Example as string array
        },
        {
          entity_name: "Ad Performance Metrics",
          tenant_name: "Ad Engineering",
          team_name: "Core",
          action_by_user_email: "jane.smith@example.com",
          is_active: true,
          is_entity_owner: false,  // Not entity owner - requires owner_entity_reference instead
          owner_entity_ref_name: "customer_analytics_table"  // Reference to actual entity owner
        }
      ];
    } else {
      sampleData = [
        {
          entity_name: "IoT Device Data ETL",
          tenant_name: "Data Engineering",
          team_name: "IOT",
          dag_name: "device_data_etl",
          dag_description: "Processes and transforms IoT device data",
          action_by_user_email: "alex.johnson@example.com",
          is_active: true,
          is_entity_owner: true,  // Entity owner - requires owner_email and conditional fields below
          owner_email: "alex.johnson@example.com",
          expected_runtime_minutes: 30,
          dag_donemarker_location: "s3://airflow/markers/device_etl/",
          donemarker_lookback: 0,
          dag_schedule: "0 */2 * * *",  // Every 2 hours
          dag_dependency: "sensor_validation,data_quality_check",  // Example as comma-separated string
          server_name: "airflow-prod-server"
        },
        {
          entity_name: "User Segmentation Pipeline",
          tenant_name: "Ad Engineering",
          team_name: "Viewer Product",
          dag_name: "user_segmentation",
          dag_description: "Creates user segments for targeted advertising",
          action_by_user_email: "sarah.williams@example.com",
          is_active: true,
          is_entity_owner: false,  // Not entity owner - requires owner_entity_reference instead
          owner_entity_ref_name: "iot_device_data_etl"  // Reference to actual entity owner
        }
      ];
    }
    
    // Convert to JSON and create downloadable file
    const jsonStr = JSON.stringify(sampleData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entityType}_template.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Bulk Upload {tabValue === 'tables' ? 'Tables' : 'DAGs'}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent>
        {/* Step indicator */}
        <Stepper activeStep={currentStep === 'upload' ? 0 : currentStep === 'validate' ? 1 : 2} sx={{ mb: 4 }}>
          <Step>
            <StepLabel>Upload File</StepLabel>
          </Step>
          <Step>
            <StepLabel>Validate & Preview</StepLabel>
          </Step>
          <Step>
            <StepLabel>Submit</StepLabel>
          </Step>
        </Stepper>
        
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="entity type tabs"
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="tables" label="Tables" />
          <Tab value="dags" label="DAGs" />
        </Tabs>
        
        {/* Upload Step */}
        {currentStep === 'upload' && (
          <>
            {/* Instructions */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 2, 
                mb: 3, 
                bgcolor: 'background.default',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                <InfoIcon color="info" sx={{ mr: 1, mt: 0.5 }} />
                <Typography variant="subtitle1" fontWeight="medium">Instructions</Typography>
              </Box>
              
              <Typography variant="body2" sx={{ mb: 1 }}>
                Upload a JSON file containing an array of {tabValue === 'tables' ? 'table' : 'DAG'} entities to add multiple records at once.
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 1 }}>
                Always Required fields:
              </Typography>
              
              <Typography component="div" variant="body2" sx={{ pl: 2, mb: 1 }}>
                <ul>
                  <li>{fieldDefinitions.entity_name.label}: String</li>
                  <li>{fieldDefinitions.tenant_name.label}: String ("Data Engineering", "Ad Engineering", etc.)</li>
                  <li>{fieldDefinitions.team_name.label}: String ("PGM", "Core", etc.)</li>
                  <li>Action By (auto-populated from your login) — do not include in file</li>
                  <li>Entity Owner: Boolean (true if entity owner, false if not)</li>
                  <li>{fieldDefinitions.is_active.label}: Boolean (defaults to true if not specified)</li>
                  <li>{fieldDefinitions.owner_entity_reference.label}: String (required if is_entity_owner is false)</li>
                  {/* No type-specific names required here; they are only required for owners below */}
                </ul>
              </Typography>

              <Typography variant="body2" sx={{ mb: 1 }}>
                Required only when Entity Owner is true:
              </Typography>
              {/* Entity owner conditional fields */}
              <Typography component="div" variant="body2" sx={{ pl: 2, mb: 1 }}>
                <ul>
                  {tabValue === 'tables' ? (
                    <>
                      <li>{fieldDefinitions.schema_name.label}: String ("roku", "dea", etc.)</li>
                      <li>{fieldDefinitions.table_name.label}: String ("agg_freeview_play_daily", "agg_brightscript_error_daily")</li>
                    </>
                  ) : (
                    <li>{fieldDefinitions.dag_name.label}: String (new DAG names will require backend validation)</li>
                  )}
                  <li>{fieldDefinitions.expected_runtime_minutes.label}: Number (must be between 1 and 1440)</li>
                  <li>{fieldDefinitions.owner_email.label}: String (single email or comma-separated multiple emails)</li>
                  <li>{tabValue === 'tables' ? 'Table Done Marker Location' : 'DAG Done Marker Location'}: String (single location or comma-separated multiple locations)</li>
                  <li>{fieldDefinitions.donemarker_lookback.label}: Number (must be a non-negative number)</li>
                  {tabValue === 'tables' ? (
                    <li>{fieldDefinitions.table_schedule.label}: String (must be valid cron format)</li>
                  ) : (
                    <li>{fieldDefinitions.dag_schedule.label}: String (must be valid cron format)</li>
                  )}
                </ul>
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 1 }}>
                Optional fields for owner entity types:
              </Typography>
              
              <Typography component="div" variant="body2" sx={{ pl: 2, mb: 1 }}>
                <ul>
                  {tabValue === 'dags' && (
                    <li>{fieldDefinitions.server_name.label}: String</li>
                  )}
                  {tabValue === 'tables' ? (
                    <>
                      <li>{fieldDefinitions.table_description.label}: String</li>
                      <li>{fieldDefinitions.table_dependency.label}: String or Array of strings (comma-separated)</li>
                    </>
                  ) : (
                    <>
                      <li>{fieldDefinitions.dag_description.label}: String</li>
                      <li>{fieldDefinitions.dag_dependency.label}: String or Array of strings (comma-separated)</li>
                    </>
                  )}
                </ul>
              </Typography>
              
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  startIcon={<DownloadIcon />}
                  onClick={downloadSampleTemplate}
                  color="info"
                  size="small"
                >
                  Download Sample Template
                </Button>
              </Box>
            </Paper>
            
            {/* Drop zone */}
            <Box
              sx={{
                border: 2,
                borderRadius: 1,
                borderStyle: 'dashed',
                borderColor: isDragging ? 'primary.main' : 'divider',
                bgcolor: isDragging ? 'action.hover' : 'background.paper',
                p: 3,
                textAlign: 'center',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                type="file"
                id="file-input"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
              
              <CloudUploadIcon 
                color="primary" 
                sx={{ 
                  fontSize: 48,
                  mb: 2,
                  opacity: 0.7,
                }} 
              />
              
              <Typography variant="h6" gutterBottom>
                {isDragging ? 'Drop your file here' : 'Drag & drop your JSON file here'}
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                or click to browse files
              </Typography>
              
              {file && (
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mt: 2,
                    bgcolor: 'background.default',
                    borderRadius: 1,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography variant="body2">
                    <strong>Selected file:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </Typography>
                  <IconButton 
                    size="small" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Paper>
              )}
            </Box>
          </>
        )}
        
        {/* Validation Step */}
        {currentStep === 'validate' && (
          <>
            {/* Validation Summary */}
            <Box sx={{ mb: 3 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: 'background.default',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ mr: 2 }}>Validation Results</Typography>
                  
                  {isValidating ? (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      <Typography variant="body2">Validating...</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip 
                        icon={<InfoIcon />} 
                        label={`Total: ${uploadSummary.totalCount}`} 
                        variant="outlined" 
                        color="default"
                      />
                      <Chip 
                        icon={<CheckCircleIcon />} 
                        label={`Valid: ${uploadSummary.validCount}`} 
                        variant="outlined" 
                        color="success"
                      />
                      <Chip 
                        icon={<ErrorIcon />} 
                        label={`Invalid: ${uploadSummary.invalidCount}`} 
                        variant="outlined" 
                        color="error"
                      />
                    </Box>
                  )}
                </Box>
                
                {/* Filter controls */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="body2" sx={{ mr: 2 }}>Filter:</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      variant={validityFilter === 'all' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleFilterChange('all')}
                      startIcon={<FilterAltIcon />}
                    >
                      All
                    </Button>
                    <Button 
                      variant={validityFilter === 'valid' ? 'contained' : 'outlined'}
                      size="small"
                      color="success"
                      onClick={() => handleFilterChange('valid')}
                      startIcon={<CheckCircleIcon />}
                    >
                      Valid
                    </Button>
                    <Button 
                      variant={validityFilter === 'invalid' ? 'contained' : 'outlined'}
                      size="small"
                      color="error"
                      onClick={() => handleFilterChange('invalid')}
                      startIcon={<ErrorIcon />}
                    >
                      Invalid
                    </Button>
                  </Box>
                </Box>
                
                {/* If no entities after filtering */}
                {filteredValidationResults().length === 0 && !isValidating && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    No entities match the current filter.
                  </Alert>
                )}
              </Paper>
            </Box>
            
            {/* Validation Preview Table */}
            {!isValidating && filteredValidationResults().length > 0 && (
              <TableContainer component={Paper} sx={{ maxHeight: 400, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width="60px">Status</TableCell>
                      <TableCell>{fieldDefinitions.entity_name.label}</TableCell>
                      <TableCell>{fieldDefinitions.tenant_name.label}</TableCell>
                      <TableCell>{fieldDefinitions.team_name.label}</TableCell>
                      {tabValue === 'tables' ? (
                        <>
                          <TableCell>{fieldDefinitions.schema_name.label}</TableCell>
                          <TableCell>{fieldDefinitions.table_name.label}</TableCell>
                        </>
                      ) : (
                        <TableCell>{fieldDefinitions.dag_name.label}</TableCell>
                      )}
              <TableCell>Action By</TableCell>
                      <TableCell>{fieldDefinitions.owner_entity_reference.label}</TableCell>
                      <TableCell>Entity Owner</TableCell>
                      <TableCell>{fieldDefinitions.owner_email.label}</TableCell>
                      <TableCell>{tabValue === 'tables' ? fieldDefinitions.table_schedule.label : fieldDefinitions.dag_schedule.label}</TableCell>
                      <TableCell>{fieldDefinitions.expected_runtime_minutes.label}</TableCell>
                      <TableCell width="120px">Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredValidationResults().map((result, index) => {
                      const entity = result.entity;
                      const isTable = tabValue === 'tables';
                      const isNewDag = !isTable && (entity as DagEntity).needs_dag_validation;
                      
                      return (
                        <TableRow key={index} sx={{
                          bgcolor: !result.valid ? 'error.lightest' : (isNewDag ? 'warning.lightest' : 'transparent')
                        }}>
                          <TableCell>
                            {result.valid ? (
                              isNewDag ? (
                                <Tooltip title="Valid but new DAG name (requires backend validation)">
                                  <Badge badgeContent="*" color="warning">
                                    <CheckCircleIcon color="success" fontSize="small" />
                                  </Badge>
                                </Tooltip>
                              ) : (
                                <Tooltip title="Valid">
                                  <CheckCircleIcon color="success" fontSize="small" />
                                </Tooltip>
                              )
                            ) : (
                              <Tooltip title={`${result.errors.length} error(s)`}>
                                <ErrorIcon color="error" fontSize="small" />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>{entity.entity_name}</TableCell>
                          <TableCell>{entity.tenant_name}</TableCell>
                          <TableCell>{entity.team_name}</TableCell>
                          {isTable ? (
                            <>
                              <TableCell>{(entity as any).schema_name}</TableCell>
                              <TableCell>{(entity as any).table_name}</TableCell>
                            </>
                          ) : (
                            <TableCell>
                              {(entity as DagEntity).dag_name}
                              {isNewDag && (
                                <Chip 
                                  label="New" 
                                  size="small" 
                                  color="warning" 
                                  sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                                />
                              )}
                            </TableCell>
                          )}
                          <TableCell>{(user as any)?.email || (user as any)?.user_email || 'Current User'}</TableCell>
                          <TableCell>{(entity as any).owner_entity_ref_name || (entity as any).owner_entity_reference || 'N/A'}</TableCell>
                          <TableCell>{entity.is_entity_owner ? 'Yes' : 'No'}</TableCell>
                          <TableCell>{entity.owner_email || 'N/A'}</TableCell>
                          <TableCell>{isTable ? (entity as any).table_schedule : (entity as DagEntity).dag_schedule}</TableCell>
                          <TableCell>{entity.expected_runtime_minutes ? `${entity.expected_runtime_minutes} min` : 'N/A'}</TableCell>
                          <TableCell>
                            {!result.valid && (
                              <Tooltip title={result.errors.map(err => `${err.field}: ${err.message}`).join('\n')}>
                                <Button size="small" color="error" variant="outlined">
                                  {result.errors.length} Error{result.errors.length !== 1 ? 's' : ''}
                                </Button>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
        
        {/* Submit Step */}
        {currentStep === 'submit' && (
          <>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                mb: 3,
                bgcolor: 'background.default',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                <InfoIcon color="info" sx={{ mr: 1, mt: 0.5 }} />
                <Typography variant="h6">Ready to Upload</Typography>
              </Box>
              
              <Typography variant="body1" sx={{ mb: 3 }}>
                You are about to upload {uploadSummary.validCount} valid {tabValue} entities.
                {uploadSummary.invalidCount > 0 && ` ${uploadSummary.invalidCount} invalid entities will be skipped.`}
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    flex: 1,
                    textAlign: 'center',
                    bgcolor: 'success.lightest',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="h3" color="success.main" gutterBottom>
                    {uploadSummary.validCount}
                  </Typography>
                  <Typography variant="body2">
                    Valid Entities
                  </Typography>
                </Paper>
                
                {uploadSummary.invalidCount > 0 && (
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      flex: 1,
                      textAlign: 'center',
                      bgcolor: 'error.lightest',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="h3" color="error.main" gutterBottom>
                      {uploadSummary.invalidCount}
                    </Typography>
                    <Typography variant="body2">
                      Invalid Entities (will be skipped)
                    </Typography>
                  </Paper>
                )}
              </Box>
              
              <Alert severity="info">
                <AlertTitle>Important</AlertTitle>
                <Typography variant="body2">
                  This operation will add new entities to the system. Once uploaded, you will need to manage them separately if any updates are needed.
                </Typography>
              </Alert>
              
              {isSubmitting && (
                <Box sx={{ width: '100%', mt: 3 }}>
                  <LinearProgress />
                  <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
                    Uploading entities... Please wait.
                  </Typography>
                </Box>
              )}
            </Paper>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        {currentStep === 'upload' ? (
          <>
            <Button onClick={onClose} color="inherit">
              Cancel
            </Button>
            <Button 
              onClick={() => handleFile(file!)} 
              variant="contained" 
              color="primary"
              disabled={!file}
            >
              Validate
            </Button>
          </>
        ) : currentStep === 'validate' ? (
          <>
            <Button onClick={handleBack} color="inherit" startIcon={<ArrowBackIcon />}>
              Back
            </Button>
            <Button 
              onClick={handleNext} 
              variant="contained" 
              color="primary"
              disabled={uploadSummary.validCount === 0 || isValidating}
              endIcon={<ArrowForwardIcon />}
            >
              Continue
            </Button>
          </>
        ) : (
          <>
            <Button 
              onClick={handleBack} 
              color="inherit" 
              startIcon={<ArrowBackIcon />}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button 
              onClick={handleUpload} 
              variant="contained" 
              color="primary"
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={20} /> : undefined}
            >
              {isSubmitting ? 'Uploading...' : 'Upload Entities'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkUploadModal;