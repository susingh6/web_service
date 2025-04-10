import { useState, useEffect } from 'react';
import {
  Autocomplete,
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
} from '@mui/material';
import { Close as CloseIcon, CloudUpload as CloudUploadIcon, Download as DownloadIcon, Info as InfoIcon } from '@mui/icons-material';
import { useToast } from '@/hooks/use-toast';

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

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
}

const BulkUploadModal = ({ open, onClose }: BulkUploadModalProps) => {
  const { toast } = useToast();
  const [tabValue, setTabValue] = useState('tables');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // State for dynamic options
  const [tenantOptions, setTenantOptions] = useState<string[]>(['Ad Engineering', 'Data Engineering']);
  const [teamOptions, setTeamOptions] = useState<string[]>(['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM']);
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
    toast({
      title: 'File added',
      description: `${selectedFile.name} is ready to upload.`,
    });

    // Here you would read the file and validate its format
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string);
        console.log('Parsed JSON data:', jsonData);
        
        // Additional validation could be added here
        if (!Array.isArray(jsonData)) {
          toast({
            title: 'Invalid JSON format',
            description: 'The JSON file must contain an array of entities.',
            variant: 'destructive',
          });
          return;
        }
        
        // Check if each entity has the required fields based on type
        const entityType = tabValue;
        const isValid = jsonData.every((entity) => {
          if (entityType === 'tables') {
            return (
              entity.tenant_name && 
              entity.team_name && 
              entity.schema_name && 
              entity.table_name && 
              entity.table_schedule && 
              entity.expected_runtime_minutes &&
              entity.user_name &&
              entity.user_email
            );
          } else {
            return (
              entity.tenant_name && 
              entity.team_name && 
              entity.dag_name && 
              entity.dag_schedule && 
              entity.expected_runtime_minutes &&
              entity.user_name &&
              entity.user_email
            );
          }
        });
        
        if (!isValid) {
          toast({
            title: 'Invalid entity data',
            description: `One or more entities are missing required fields for ${entityType}.`,
            variant: 'destructive',
          });
        }
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

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      handleFile(event.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a JSON file to upload.',
        variant: 'destructive',
      });
      return;
    }

    // Here you would implement the actual upload logic
    // For now, we'll just simulate a successful upload
    toast({
      title: 'Upload successful',
      description: `${file.name} has been uploaded and processed.`,
    });
    
    // Reset the form
    setFile(null);
    onClose();
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
          table_dependency: "analytics.products,analytics.orders",
          notification_preferences: ["email", "slack"],
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
          table_dependency: "reporting.campaigns,reporting.conversions",
          notification_preferences: ["slack", "pagerduty"],
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
          dag_dependency: "sensor_validation,data_quality_check",
          notification_preferences: ["pagerduty", "email"],
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
          dag_dependency: "user_activity_collection,model_training",
          notification_preferences: ["email", "slack"],
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Bulk Upload Entities
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
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="entity type tabs"
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="tables" label="Tables" />
          <Tab value="dags" label="DAGs" />
        </Tabs>
        
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
                <li>tenant_name: String (e.g., "Data Engineering")</li>
                <li>team_name: String (e.g., "PGM", "Core", etc.)</li>
                <li>schema_name: String</li>
                <li>table_name: String</li>
                <li>table_schedule: String (cron format)</li>
                <li>expected_runtime_minutes: Number</li>
                <li>user_name: String</li>
                <li>user_email: String</li>
              </ul>
            ) : (
              <ul>
                <li>tenant_name: String (e.g., "Data Engineering")</li>
                <li>team_name: String (e.g., "PGM", "Core", etc.)</li>
                <li>dag_name: String</li>
                <li>dag_schedule: String (cron format)</li>
                <li>expected_runtime_minutes: Number</li>
                <li>user_name: String</li>
                <li>user_email: String</li>
              </ul>
            )}
          </Typography>
          
          <Typography variant="body2" sx={{ mb: 1 }}>
            Optional fields for both entity types:
          </Typography>
          
          <Typography component="div" variant="body2" sx={{ pl: 2, mb: 1 }}>
            <ul>
              <li>notification_preferences: Array of strings (e.g., ["email", "slack", "pagerduty"])</li>
              <li>donemarker_location: String</li>
              <li>donemarker_lookback: Number</li>
              <li>is_active: Boolean</li>
              {tabValue === 'tables' ? (
                <>
                  <li>table_description: String</li>
                  <li>table_dependency: String (comma-separated)</li>
                </>
              ) : (
                <>
                  <li>dag_description: String</li>
                  <li>dag_dependency: String (comma-separated)</li>
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
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button 
          onClick={handleUpload} 
          variant="contained" 
          color="primary"
          disabled={!file}
        >
          Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkUploadModal;