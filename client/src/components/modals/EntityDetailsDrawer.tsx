import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Chip,
  Paper,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Close as CloseIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { Entity } from '@shared/schema';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';

interface EntityDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
}

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'running':
    case 'success':
      return 'success';
    case 'warning':
    case 'delayed':
      return 'warning';
    case 'failed':
    case 'error':
    case 'inactive':
      return 'error';
    default:
      return 'default';
  }
};

// Mock issues data - in a real app, this would come from an API
const mockIssues = [
  {
    id: 1,
    entityId: 1,
    type: 'delay',
    description: 'Refresh delay detected',
    severity: 'medium',
    date: new Date(2023, 3, 12), // April 12, 2023
    resolved: false,
    resolvedAt: undefined,
  },
  {
    id: 2,
    entityId: 1,
    type: 'quality',
    description: 'Data quality check failed',
    severity: 'high',
    date: new Date(2023, 3, 5), // April 5, 2023
    resolved: false,
    resolvedAt: undefined,
  },
];

const EntityDetailsDrawer = ({ open, onClose, entity, teams }: EntityDetailsDrawerProps) => {
  
  if (!entity) {
    return null;
  }
  
  const teamName = teams.find(team => team.id === entity.teamId)?.name || 'Unknown';
  
  const formatDate = (date: Date | undefined) => {
    if (!date) return 'N/A';
    return format(date, 'MMM d, yyyy • h:mm a');
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
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 480 },
          maxWidth: '100%',
        },
      }}
    >
      <Box display="flex" flexDirection="column" height="100%">
        {/* Header */}
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" component="h2">
            Entity Details
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {/* Basic Information */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Basic Information
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Name:</Typography>
                <Typography variant="body1" fontWeight="medium">{entity.name || 'N/A'}</Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Type:</Typography>
                <Chip 
                  label={entity.type || 'N/A'} 
                  size="small" 
                  variant="outlined" 
                />
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Status:</Typography>
                <Chip 
                  label={entity.status || 'Unknown'} 
                  size="small" 
                  color={getStatusColor(entity.status || '')}
                />
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Team:</Typography>
                <Typography variant="body1" fontWeight="medium">{teamName}</Typography>
              </Box>
            </Box>
          </Paper>

          {/* Performance Metrics */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Performance Metrics
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">SLA Compliance:</Typography>
                <Typography variant="body1" fontWeight="medium">{entity.slaCompliance?.toFixed(1) || 'N/A'}%</Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Avg Runtime:</Typography>
                <Typography variant="body1" fontWeight="medium">{entity.avgRuntime?.toFixed(1) || 'N/A'}m</Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Last Updated:</Typography>
                <Typography variant="body1" fontWeight="medium">{formatDate(entity.lastUpdated)}</Typography>
              </Box>
            </Box>
          </Paper>

          {/* Owner Information */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Owner Information
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                {getUserInitials()}
              </Avatar>
              <Box>
                <Typography variant="body1" fontWeight="medium">
                  {entity.owner || 'Unassigned'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Owner
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Performance Chart */}
          <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Performance Chart
            </Typography>
            <EntityPerformanceChart entityId={entity.id} />
          </Paper>

          {/* Recent Issues */}
          <Paper elevation={1} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Issues
            </Typography>
            
            {mockIssues.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No recent issues found
              </Typography>
            ) : (
              <List dense>
                {mockIssues.map((issue) => (
                  <ListItem key={issue.id} sx={{ px: 0 }}>
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
            )}
          </Paper>
        </Box>
      </Box>
    </Drawer>
  );
};

export default EntityDetailsDrawer;