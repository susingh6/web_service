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
    if (selectedFile.type !== 'text/csv') {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV file.',
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
    
    setFile(selectedFile);
  };

  const handleDownloadTemplate = () => {
    // In a real app, this would download a template CSV file
    toast({
      title: 'Template downloaded',
      description: `${tabValue === 'tables' ? 'Tables' : 'DAGs'} template has been downloaded.`,
      variant: 'default',
    });
  };

  const handleUpload = () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a CSV file to upload.',
        variant: 'destructive',
      });
      return;
    }
    
    // In a real app, this would upload the file to the server
    toast({
      title: 'Upload successful',
      description: `${file.name} has been uploaded.`,
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
                Drag and drop your CSV file here, or
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
                  accept=".csv"
                  onChange={handleFileInput}
                />
              </Button>
              <Typography variant="caption" color="text.secondary" mt={2}>
                Maximum file size: 10MB. Supported format: CSV
              </Typography>
            </>
          )}
        </Box>
        
        <Typography variant="h6" fontWeight={500} gutterBottom>
          Template
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Download our CSV template to ensure your data is properly formatted for upload.
        </Typography>
        <Button 
          startIcon={<DownloadIcon />} 
          color="primary"
          onClick={handleDownloadTemplate}
          sx={{ mb: 3 }}
        >
          Download CSV Template
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
              <Typography variant="body2">Ensure all required fields are populated</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">Entity names must be unique</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">SLA values should be between 0-100</Typography>
            </Box>
            <Box component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">Team names must match existing teams</Typography>
            </Box>
            <Box component="li">
              <Typography variant="body2">Owner email addresses must be valid company emails</Typography>
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
