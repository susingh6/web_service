import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Grid,
  Chip,
  Button,
  Paper,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { Entity, Issue } from '@shared/schema';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface EntityDetailsModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
}

// Helper function to get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'error';
    default:
      return 'default';
  }
};

// Mock issues data - in a real app, this would come from an API
const mockIssues: Issue[] = [
  {
    id: 1,
    entityId: 1,
    type: 'delay',
    description: 'Refresh delay detected',
    severity: 'medium',
    date: new Date(2023, 3, 12),
    resolved: false,
    resolvedAt: null,
  },
  {
    id: 2,
    entityId: 1,
    type: 'quality',
    description: 'Data quality check failed',
    severity: 'high',
    date: new Date(2023, 3, 5),
    resolved: false,
    resolvedAt: null,
  },
];

const EntityDetailsModal = ({ open, onClose, entity, teams }: EntityDetailsModalProps) => {
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const { toast } = useToast();
  
  if (!entity) return null;
  
  // Find team name
  const teamName = teams.find(team => team.id === entity.teamId)?.name || 'Unknown Team';
  
  // Mock data for display
  const issues = mockIssues.filter(issue => issue.entityId === entity.id);
  
  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return format(date, 'MMM d, yyyy • h:mm a');
  };
  
  const handleDelete = () => {
    setOpenDeleteDialog(true);
  };
  
  const handleConfirmDelete = async () => {
    try {
      // This would be a real API call in production
      // await deleteEntity(entity.id);
      
      toast({
        title: 'Success',
        description: `${entity.name} has been deleted.`,
        variant: 'default',
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      
      setOpenDeleteDialog(false);
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to delete: ${error}`,
        variant: 'destructive',
      });
    }
  };
  
  // Get user initials for avatar
  const getUserInitials = () => {
    if (!entity.owner) return '?';
    
    const names = entity.owner.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return names[0].substring(0, 2).toUpperCase();
  };
  
  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
            Entity Details
          </Typography>
          <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ p: 3 }}>
          {/* Entity header */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              bgcolor: 'primary.light',
              color: 'primary.contrastText',
              borderLeft: 4,
              borderColor: 'primary.main',
              borderRadius: 1,
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="h6" fontWeight={600}>
                  {entity.name}
                </Typography>
                <Typography variant="body2">
                  {teamName}
                </Typography>
              </Box>
              <Chip
                label={entity.status ? entity.status.charAt(0).toUpperCase() + entity.status.slice(1) : 'Unknown'}
                color={getStatusColor(entity.status || 'unknown') as "success" | "warning" | "error" | "default"}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>
          </Paper>
          
          {/* Key metrics */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Current SLA
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {entity.currentSla?.toFixed(1) || 'N/A'}%
                </Typography>
              </Paper>
            </Grid>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Last Refreshed
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {formatDate(entity.lastRefreshed)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Type
                </Typography>
                <Typography variant="h6" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
                  {entity.type}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={6}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Owner
                </Typography>
                <Box display="flex" alignItems="center" mt={1}>
                  <Avatar sx={{ width: 24, height: 24, mr: 1, fontSize: '0.75rem' }}>
                    {getUserInitials()}
                  </Avatar>
                  <Typography variant="body2">
                    {entity.owner || 'Unassigned'}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
          
          {/* Performance Chart */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Performance Trend
            </Typography>
            <Box sx={{ height: 300 }}>
              <EntityPerformanceChart entities={[entity]} />
            </Box>
          </Paper>
          
          {/* Issues */}
          <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Recent Issues
            </Typography>
            {issues.length > 0 ? (
              <List dense>
                {issues.map((issue) => (
                  <ListItem key={issue.id} divider>
                    <ListItemIcon>
                      {issue.severity === 'high' ? (
                        <ErrorIcon color="error" />
                      ) : (
                        <WarningIcon color="warning" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={issue.description}
                      secondary={`${issue.type} • ${formatDate(issue.date)}`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" align="center">
                No recent issues
              </Typography>
            )}
          </Paper>
          

        </DialogContent>
      </Dialog>
      
      <ConfirmDialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Entity"
        content={`Are you sure you want to delete "${entity.name}"? This action cannot be undone.`}
      />
    </>
  );
};

export default EntityDetailsModal;