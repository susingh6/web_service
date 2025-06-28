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
import { fetchWithCache, getFromCache } from '@/lib/cacheUtils';
import { buildUrl, endpoints } from '@/config/index';
import { apiRequest } from '@/lib/queryClient';
import { fieldDefinitions } from '@/config/schemas';

// Entity types for validation
interface BaseEntity {
  tenant_name: string;
  team_name: string;
  expected_runtime_minutes: number;
  donemarker_location?: string;
  donemarker_lookback?: number;
  user_name?: string;
  user_email: string;
  is_active?: boolean;
}

interface TableEntity extends BaseEntity {
  schema_name: string;
  table_name: string;
  table_description?: string;
  table_schedule: string;
  table_dependency?: string | string[];  // Can be either a comma-separated string or string array
}

interface DagEntity extends BaseEntity {
  dag_name: string;
  dag_description?: string;
  dag_schedule: string;
  dag_dependency?: string | string[];  // Can be either a comma-separated string or string array
  needs_dag_validation?: boolean;  // Flag to indicate if this is a new DAG that needs backend validation
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
  const [dagOptions, setDagOptions] = useState<string[]>([]);
  
  // Loading states
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingDags, setLoadingDags] = useState(false);
  
  // Effect to fetch options when modal opens
  useEffect(() => {
    if (open) {
      // Initial load of cached options
      fetchTenantOptions();
      fetchTeamOptions();
      
      if (tabValue === 'dags') {
        fetchDagOptions();
      }
    }
  }, [open, tabValue]);
  
  // Functions to fetch options
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
      setTeamOptions([]);
    } finally {
      setLoadingTeams(false);
    }
  };
  
  const fetchDagOptions = async () => {
    setLoadingDags(true);
    try {
      const options = await fetchWithCache(buildUrl(endpoints.debug.teams), 'dags');
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
    
    if (!entity.expected_runtime_minutes) {
      errors.push({ field: 'expected_runtime_minutes', message: `${fieldDefinitions.expected_runtime_minutes.label} is required` });
    } else if (isNaN(Number(entity.expected_runtime_minutes))) {
      errors.push({ field: 'expected_runtime_minutes', message: `${fieldDefinitions.expected_runtime_minutes.label} must be a number` });
    } else if (Number(entity.expected_runtime_minutes) < 1 || Number(entity.expected_runtime_minutes) > 1440) {
      errors.push({ field: 'expected_runtime_minutes', message: `${fieldDefinitions.expected_runtime_minutes.label} must be between 1 and 1440 minutes` });
    }
    
    // User email is required with valid format using centralized field definitions
    if (!entity.user_email) {
      errors.push({ field: 'user_email', message: `${fieldDefinitions.user_email.label} is required` });
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(entity.user_email)) {
      errors.push({ field: 'user_email', message: `Invalid ${fieldDefinitions.user_email.label.toLowerCase()} format` });
    }
    
    // Done marker location is required using centralized field definitions
    if (!entity.donemarker_location) {
      errors.push({ field: 'donemarker_location', message: `${fieldDefinitions.donemarker_location.label} is required` });
    }
    
    // Entity type specific validation using centralized field definitions
    if (entityType === 'tables') {
      if (!entity.schema_name) {
        errors.push({ field: 'schema_name', message: `${fieldDefinitions.schema_name.label} is required` });
      }
      
      if (!entity.table_name) {
        errors.push({ field: 'table_name', message: `${fieldDefinitions.table_name.label} is required` });
      }
      
      if (!entity.table_schedule) {
        errors.push({ field: 'table_schedule', message: `${fieldDefinitions.table_schedule.label} is required` });
      } else if (!/^[\d*\/ ,\-]+$/.test(entity.table_schedule)) {
        errors.push({ field: 'table_schedule', message: `Invalid ${fieldDefinitions.table_schedule.label.toLowerCase()} format` });
      }
    } else { // DAGs validation
      if (!entity.dag_name) {
        errors.push({ field: 'dag_name', message: `${fieldDefinitions.dag_name.label} is required` });
      } else if (isNewDag) {
        // Only warn about new DAG names, don't treat as error since backend will validate
        // We already set the needs_dag_validation flag above
      }
      
      if (!entity.dag_schedule) {
        errors.push({ field: 'dag_schedule', message: `${fieldDefinitions.dag_schedule.label} is required` });
      } else if (!/^[\d*\/ ,\-]+$/.test(entity.dag_schedule)) {
        errors.push({ field: 'dag_schedule', message: `Invalid ${fieldDefinitions.dag_schedule.label.toLowerCase()} format` });
      }
    }
    
    // Optional field validations using centralized field definitions
    if (entity.donemarker_lookback !== undefined) {
      if (isNaN(Number(entity.donemarker_lookback))) {
        errors.push({ field: 'donemarker_lookback', message: `${fieldDefinitions.donemarker_lookback.label} must be a number` });
      } else if (Number(entity.donemarker_lookback) < 0) {
        errors.push({ field: 'donemarker_lookback', message: `${fieldDefinitions.donemarker_lookback.label} must be a non-negative number` });
      }
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
  const validateEntities = (entities: any[]) => {
    setIsValidating(true);
    
    try {
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
  
  // Handle the actual bulk upload process
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
    const validEntities = validationResults
      .filter(result => result.valid)
      .map(result => result.entity);
    
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
      // Actual API call to bulk upload using centralized configuration
      const entitiesWithNewDags = validEntities.filter(entity => 
        'needs_dag_validation' in entity && entity.needs_dag_validation
      );
      
      if (entitiesWithNewDags.length > 0) {
        console.log(`Found ${entitiesWithNewDags.length} DAGs that need backend validation:`, 
          entitiesWithNewDags.map(e => (e as DagEntity).dag_name)
        );
      }
      
      // Use centralized API configuration for bulk entity creation
      const endpoint = buildUrl(endpoints.entities);
      
      // Submit each entity individually using the standard entities endpoint
      const submitPromises = validEntities.map(async (entity) => {
        try {
          const response = await apiRequest('POST', endpoint, entity);
          return await response.json();
        } catch (error) {
          throw new Error(`Failed to submit entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
      
      const results = await Promise.allSettled(submitPromises);
      
      // Count successes and failures
      const successCount = results.filter(result => result.status === 'fulfilled').length;
      const failedCount = results.filter(result => result.status === 'rejected').length;
      
      // Update upload summary
      setUploadSummary(prev => ({
        ...prev,
        successCount,
        failedCount
      }));
      
      // Show success message
      toast({
        title: 'Upload successful',
        description: `Successfully uploaded ${successCount} entities.`,
      });
      
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
      
    } catch (error) {
      console.error('Error uploading entities:', error);
      toast({
        title: 'Upload error',
        description: 'An error occurred while uploading entities.',
        variant: 'destructive',
      });
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
          tenant_name: "Data Engineering",
          team_name: "PGM",
          schema_name: "analytics",
          table_name: "customer_data",
          table_description: "Contains customer information with demographics",
          table_schedule: "0 */4 * * *",  // Every 4 hours
          expected_runtime_minutes: 45,
          table_dependency: ["analytics.products", "analytics.orders"],  // Example as string array
          donemarker_location: "s3://data-warehouse/markers/customer_data/",
          donemarker_lookback: 1,
          user_name: "John Doe",
          user_email: "john.doe@example.com",
          is_active: true
        },
        {
          tenant_name: "Ad Engineering",
          team_name: "Core",
          schema_name: "reporting",
          table_name: "ad_performance",
          table_description: "Aggregated advertising performance metrics",
          table_schedule: "0 0 * * *",  // Daily at midnight
          expected_runtime_minutes: 120,
          table_dependency: "reporting.campaigns,reporting.conversions",  // Example as comma-separated string
          donemarker_location: "s3://ad-analytics/markers/performance/",
          donemarker_lookback: 2,
          user_name: "Jane Smith",
          user_email: "jane.smith@example.com",
          is_active: true
        }
      ];
    } else {
      sampleData = [
        {
          tenant_name: "Data Engineering",
          team_name: "IOT",
          dag_name: "device_data_etl",
          dag_description: "Processes and transforms IoT device data",
          dag_schedule: "0 */2 * * *",  // Every 2 hours
          expected_runtime_minutes: 30,
          dag_dependency: "sensor_validation,data_quality_check",  // Example as comma-separated string
          donemarker_location: "s3://airflow/markers/device_etl/",
          donemarker_lookback: 0,
          user_name: "Alex Johnson",
          user_email: "alex.johnson@example.com",
          is_active: true
        },
        {
          tenant_name: "Ad Engineering",
          team_name: "Viewer Product",
          dag_name: "user_segmentation",
          dag_description: "Creates user segments for targeted advertising",
          dag_schedule: "0 4 * * *",  // Daily at 4 AM
          expected_runtime_minutes: 60,
          dag_dependency: ["user_activity_collection", "model_training"],  // Example as string array
          donemarker_location: "s3://airflow/markers/segmentation/",
          donemarker_lookback: 1,
          user_name: "Sarah Williams",
          user_email: "sarah.williams@example.com",
          is_active: true
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
                Required fields for {tabValue === 'tables' ? 'Tables' : 'DAGs'}:
              </Typography>
              
              <Typography component="div" variant="body2" sx={{ pl: 2, mb: 1 }}>
                {tabValue === 'tables' ? (
                  <ul>
                    <li>tenant_name: String ("Data Engineering", "Ad Engineering", etc.)</li>
                    <li>team_name: String ("PGM", "Core", etc.)</li>
                    <li>schema_name: String</li>
                    <li>table_name: String</li>
                    <li>table_schedule: String (must be valid cron format)</li>
                    <li>expected_runtime_minutes: Number (must be between 1 and 1440)</li>
                    <li>user_email: String</li>
                  </ul>
                ) : (
                  <ul>
                    <li>tenant_name: String ("Data Engineering", "Ad Engineering", etc.)</li>
                    <li>team_name: String ("PGM", "Core", etc.)</li>
                    <li>dag_name: String (new DAG names will require backend validation)</li>
                    <li>dag_schedule: String (must be valid cron format)</li>
                    <li>expected_runtime_minutes: Number (must be between 1 and 1440)</li>
                    <li>user_email: String</li>
                  </ul>
                )}
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 1 }}>
                Optional fields for both entity types:
              </Typography>
              
              <Typography component="div" variant="body2" sx={{ pl: 2, mb: 1 }}>
                <ul>
                  <li>donemarker_location: String</li>
                  <li>donemarker_lookback: Number</li>
                  <li>is_active: Boolean</li>
                  {tabValue === 'tables' ? (
                    <>
                      <li>table_description: String</li>
                      <li>table_dependency: String or Array of strings (comma-separated)</li>
                    </>
                  ) : (
                    <>
                      <li>dag_description: String</li>
                      <li>dag_dependency: String or Array of strings (comma-separated)</li>
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
                      <TableCell>Schedule</TableCell>
                      <TableCell>{fieldDefinitions.expected_runtime_minutes.label}</TableCell>
                      <TableCell>{fieldDefinitions.user_email.label}</TableCell>
                      <TableCell width="120px">Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredValidationResults().map((result, index) => {
                      const entity = result.entity;
                      const isTable = 'table_name' in entity;
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
                          <TableCell>{entity.tenant_name}</TableCell>
                          <TableCell>{entity.team_name}</TableCell>
                          {isTable ? (
                            <>
                              <TableCell>{entity.schema_name}</TableCell>
                              <TableCell>{entity.table_name}</TableCell>
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
                          <TableCell>{isTable ? entity.table_schedule : (entity as DagEntity).dag_schedule}</TableCell>
                          <TableCell>{entity.expected_runtime_minutes} min</TableCell>
                          <TableCell>{entity.user_email}</TableCell>
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