import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Grid,
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
    <>
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
            <Typography variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
              Entity Details
            </Typography>
            <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
              <CloseIcon />
            </IconButton>
          </Box>
          
          {/* Content */}
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
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
            <Grid container spacing={2} mb={3}>
              <Grid item xs={6}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Current SLA
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {entity.currentSla ? entity.currentSla.toFixed(1) : 'N/A'}%
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Target SLA
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {entity.slaTarget ? entity.slaTarget.toFixed(1) : 'N/A'}%
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    30-Day Average
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {entity.currentSla ? (entity.currentSla - 1.2).toFixed(1) : 'N/A'}%
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Last Refreshed
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {entity.lastRefreshed 
                      ? format(entity.lastRefreshed, 'h:mm a')
                      : 'N/A'}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            
            {/* Description */}
            <Box mb={3}>
              <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                Description
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {entity.description || 
                  `This ${entity.type} contains important data for the ${teamName} team. It is refreshed ${entity.refreshFrequency} and has a target SLA of ${entity.slaTarget ? entity.slaTarget + '%' : 'N/A'}.`}
              </Typography>
            </Box>
            
            {/* Performance history */}
            <Box mb={3}>
              <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                Performance History
              </Typography>
              <Paper elevation={0} sx={{ p: 2, height: 200, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <EntityPerformanceChart entities={[entity]} />
              </Paper>
            </Box>
            
            {/* Refresh schedule */}
            <Box mb={3}>
              <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                Refresh Schedule
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Frequency
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {entity.refreshFrequency ? entity.refreshFrequency.charAt(0).toUpperCase() + entity.refreshFrequency.slice(1) : 'N/A'}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Next Refresh
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {entity.nextRefresh 
                        ? format(entity.nextRefresh, 'h:mm a')
                        : 'N/A'}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Time Zone
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      UTC-07:00
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
            
            {/* Owner information */}
            <Box mb={3}>
              <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                Owner Information
              </Typography>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'primary.dark', mr: 2 }}>
                  {getUserInitials()}
                </Avatar>
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    {entity.owner || 'Unassigned'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {entity.ownerEmail || 'No email provided'}
                  </Typography>
                </Box>
              </Paper>
            </Box>
            
            {/* Recent issues */}
            <Box mb={3}>
              <Typography variant="subtitle1" fontWeight={500} gutterBottom>
                Recent Issues
              </Typography>
              <Paper elevation={0} sx={{ borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <List disablePadding>
                  {mockIssues.length > 0 ? (
                    mockIssues.map((issue) => (
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
                          secondary={format(issue.date, 'MMM d, yyyy')}
                          primaryTypographyProps={{ fontWeight: 500 }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    ))
                  ) : (
                    <ListItem>
                      <ListItemText
                        primary="No recent issues"
                        primaryTypographyProps={{ 
                          align: 'center', 
                          color: 'text.secondary' 
                        }}
                      />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Box>
          </Box>
          

        </Box>
      </Drawer>
      
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

export default EntityDetailsDrawer;
