import { useState } from 'react';
import {
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
} from '@mui/material';
import { Close as CloseIcon, CloudUpload as CloudUploadIcon, Download as DownloadIcon, Info as InfoIcon } from '@mui/icons-material';
import { useToast } from '@/hooks/use-toast';

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
}

const BulkUploadModal = ({ open, onClose }: BulkUploadModalProps) => {
  const { toast } = useToast();
  const [tabValue, setTabValue] = useState('tables');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      handleFile(selectedFile);
    }
  };

  const handleFile = (selectedFile: File) => {
    if (selectedFile.type !== 'application/json' && !selectedFile.name.endsWith('.json')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JSON file.',
        variant: 'destructive',
      });
      return;
    }
    
    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB
      toast({
        title: 'File too large',
        description: 'Maximum file size is 10MB.',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate JSON format and structure
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonContent = JSON.parse(e.target?.result as string);
        
        // Validate that it's an array of entities
        if (!Array.isArray(jsonContent)) {
          throw new Error('JSON must contain an array of entities');
        }
        
        // Basic validation of required fields based on entity type
        const entityType = tabValue === 'tables' ? 'table' : 'dag';
        
        let invalidEntities = [];
        if (entityType === 'table') {
          invalidEntities = jsonContent.filter(entity => {
            return !entity.tenant_name || 
                   !entity.team_name || 
                   !entity.schema_name || 
                   !entity.table_name || 
                   !entity.table_schedule || 
                   !entity.expected_runtime_minutes || 
                   !entity.user_name || 
                   !entity.user_email;
          });
        } else {
          invalidEntities = jsonContent.filter(entity => {
            return !entity.tenant_name || 
                   !entity.team_name || 
                   !entity.dag_name || 
                   !entity.dag_schedule || 
                   !entity.expected_runtime_minutes || 
                   !entity.user_name || 
                   !entity.user_email;
          });
        }
        
        if (invalidEntities.length > 0) {
          toast({
            title: 'Invalid entity data',
            description: `${invalidEntities.length} entities are missing required fields.`,
            variant: 'destructive',
          });
          return;
        }
        
        setFile(selectedFile);
        
      } catch (error) {
        toast({
          title: 'Invalid JSON format',
          description: error instanceof Error ? error.message : 'The uploaded file contains invalid JSON.',
          variant: 'destructive',
        });
      }
    };
    
    reader.readAsText(selectedFile);
  };

  const handleDownloadTemplate = () => {
    // Create a sample JSON template based on the selected tab
    const entityType = tabValue === 'tables' ? 'table' : 'dag';
    
    // Different templates for tables and dags
    let sampleData = [];
    
    if (entityType === 'table') {
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
          notification_preference: "email",
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
          notification_preference: "slack",
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
          notification_preference: "pagerduty",
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
          notification_preference: "email",
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
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    
    toast({
      title: 'Template downloaded',
      description: `${tabValue === 'tables' ? 'Tables' : 'DAGs'} JSON template has been downloaded.`,
      variant: 'default',
    });
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
    
    // In a real app, this would upload the file to the server and process the entities
    // For now, we'll just simulate a successful upload
    toast({
      title: 'Upload successful',
      description: `${file.name} has been processed. Entities will be added shortly.`,
      variant: 'default',
    });
    
    setFile(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
          Bulk Upload Entities
        </Typography>
        <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <Box sx={{ px: 3, pt: 0, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab 
            label="Tables" 
            value="tables"
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
          <Tab 
            label="DAGs" 
            value="dags"
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
        </Tabs>
      </Box>
      
      <DialogContent>
        <Box
          sx={{
            p: 4,
            bgcolor: 'grey.50',
            border: (theme) => `2px dashed ${isDragging ? theme.palette.primary.main : theme.palette.grey[300]}`,
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: 3,
            transition: 'border-color 0.2s ease',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          
          {file ? (
            <Box display="flex" flexDirection="column" alignItems="center">
              <Typography variant="body1" fontWeight={500}>
                {file.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {(file.size / 1024).toFixed(1)} KB
              </Typography>
              <Button 
                variant="outlined" 
                color="secondary" 
                sx={{ mt: 2 }}
                onClick={() => setFile(null)}
              >
                Remove
              </Button>
            </Box>
          ) : (
            <>
              <Typography variant="body1" textAlign="center" mb={2}>
                Drag and drop your JSON file here, or
              </Typography>
              <Button
                variant="contained"
                component="label"
                color="primary"
              >
                Browse Files
                <input
                  type="file"
                  hidden
                  accept=".json,application/json"
                  onChange={handleFileInput}
                />
              </Button>
              <Typography variant="caption" color="text.secondary" mt={2}>
                Maximum file size: 10MB. Supported format: JSON
              </Typography>
            </>
          )}
        </Box>
        
        <Typography variant="h6" fontWeight={500} gutterBottom>
          JSON Structure
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Upload a JSON file with an array of entities following the structure below.
        </Typography>
        <Paper
          sx={{ 
            p: 2, 
            mb: 3, 
            bgcolor: 'grey.50',
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            maxHeight: '300px',
            overflow: 'auto'
          }}
        >
          <pre>{tabValue === 'tables' ? 
`[
  {
    "tenant_name": "Data Engineering",
    "team_name": "PGM",
    "schema_name": "analytics",
    "table_name": "customer_data",
    "table_description": "Contains customer information with demographics",
    "table_schedule": "0 */4 * * *",
    "expected_runtime_minutes": 45,
    "table_dependency": "analytics.products,analytics.orders",
    "notification_preference": "email",
    "donemarker_location": "s3://data-warehouse/markers/customer_data/",
    "donemarker_lookback": 1,
    "user_name": "John Doe",
    "user_email": "john.doe@example.com",
    "is_active": true
  },
  // Additional tables...
]` : 
`[
  {
    "tenant_name": "Data Engineering",
    "team_name": "IOT",
    "dag_name": "device_data_etl",
    "dag_description": "Processes and transforms IoT device data",
    "dag_schedule": "0 */2 * * *",
    "expected_runtime_minutes": 30,
    "dag_dependency": "sensor_validation,data_quality_check",
    "notification_preference": "pagerduty",
    "donemarker_location": "s3://airflow/markers/device_etl/",
    "donemarker_lookback": 0,
    "user_name": "Alex Johnson",
    "user_email": "alex.johnson@example.com",
    "is_active": true
  },
  // Additional DAGs...
]`}</pre>
        </Paper>
        <Button 
          startIcon={<DownloadIcon />} 
          color="primary"
          onClick={handleDownloadTemplate}
          sx={{ mb: 3 }}
        >
          Download JSON Template
        </Button>
        
        <Paper 
          elevation={0} 
          sx={{ 
            p: 3, 
            bgcolor: 'info.light', 
            color: 'info.contrastText',
            borderRadius: 2, 
          }}
        >
          <Box display="flex" alignItems="flex-start" mb={1}>
            <InfoIcon sx={{ mr: 1, mt: 0.25 }} />
            <Typography variant="subtitle1" fontWeight={500}>
              Instructions
            </Typography>
          </Box>
          <Box component="ul" sx={{ pl: 4, m: 0 }}>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">JSON must contain an array of entity objects</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">For Tables: Required fields include tenant_name, team_name, schema_name, table_name, table_schedule, expected_runtime_minutes, user_name, user_email</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">For DAGs: Required fields include tenant_name, team_name, dag_name, dag_schedule, expected_runtime_minutes, user_name, user_email</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">Entity names must be unique across the system</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">Tenant name should be either "Data Engineering" or "Ad Engineering"</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">Team name should be one of: "PGM", "Core", "Viewer Product", "IOT", "CDM"</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">Schedule format should follow cron syntax (e.g., "0 * * * *")</Typography>
            </Box>
            <Box component="li">
              <Typography variant="body2">Notification preference should be one of: "email", "slack", "pagerduty", "none"</Typography>
            </Box>
          </Box>
        </Paper>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button 
          variant="contained" 
          color="primary"
          onClick={handleUpload}
          disabled={!file}
        >
          Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkUploadModal;
