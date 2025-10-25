import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Divider, 
  Chip, 
  Card, 
  CardContent, 
  CardHeader,
  IconButton,
  Grid as MuiGrid,
  Button,
  CircularProgress,
  Alert,
  Stack
} from '@mui/material';
import { 
  PlayArrow, 
  CheckCircle, 
  Error as ErrorIcon, 
  Warning, 
  ArrowBack,
  MoreVert,
  Refresh
} from '@mui/icons-material';
import { Task } from '@/features/sla/types';
import { Entity } from '@shared/schema';
import { format } from 'date-fns';
import { normalizeStatus, getStatusColor, STANDARD_STATUSES } from '@/utils/status-normalization';
import { useGetDagTasksByName, useUpdateTaskPriority } from '@/features/sla/taskService.enhanced';
import TaskCard from './TaskCard';
import TaskDragLayer from './TaskDragLayer';
import PriorityZone from './PriorityZone';

// Create a Grid component that accepts the old style props
const Grid = (props: any) => {
  const { children, xs, md, lg, ...rest } = props;
  return (
    <MuiGrid item {...rest}>
      <Box 
        sx={{ 
          width: { 
            xs: xs === 12 ? '100%' : `${(xs / 12) * 100}%`,
            md: md ? `${(md / 12) * 100}%` : undefined,
            lg: lg ? `${(lg / 12) * 100}%` : undefined,
          }
        }}
      >
        {children}
      </Box>
    </MuiGrid>
  );
};

interface DagDetailViewProps {
  entity: Entity;
  onBack: () => void;
}

interface GroupedTasks {
  normal: Task[];
  high: Task[];
}

const DagDetailView: React.FC<DagDetailViewProps> = ({ entity, onBack }) => {
  const [groupedTasks, setGroupedTasks] = useState<GroupedTasks>({ normal: [], high: [] });
  
  // Use enhanced task service with 6-hour caching (by entity name to match server route)
  const { data: tasks = [], isLoading: loading, error: queryError } = useGetDagTasksByName(entity.name);
  const { mutate: updateTaskPriority, isPending: isUpdatingPriority } = useUpdateTaskPriority();
  
  const error = queryError ? 'Failed to load tasks. Please try again.' : null;

  // Status icon mapping
  const statusIconMap: Record<string, JSX.Element> = {
    'success': <CheckCircle color="success" />,
    'running': <PlayArrow color="warning" />,
    'failed': <ErrorIcon color="error" />,
    'warning': <Warning color="warning" />,
    'unknown': <MoreVert color="disabled" />
  };

  // Group tasks by priority using React Query data
  useEffect(() => {
    const grouped: GroupedTasks = { normal: [], high: [] };
    tasks.forEach((task: any) => {
      if (task.priority === 'high') {
        grouped.high.push(task);
      } else {
        grouped.normal.push(task);
      }
    });
    setGroupedTasks(grouped);
  }, [tasks]);

  // Handle moving a task between priority zones
  const handlePriorityChange = async (taskId: number, newPriority: 'normal' | 'high') => {
    try {
      // Find the task
      const task = tasks.find(t => t.id === taskId);
      if (!task || task.priority === newPriority) return;
      
      // Call the API to update the task using React Query mutation
      updateTaskPriority({ dagId: entity.id, taskId, priority: newPriority });
    } catch (err) {
      console.error('Error updating task priority:', err);
    }
  };

  const refreshTasks = () => {
    // React Query will handle the refresh automatically
    window.location.reload();
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button 
          startIcon={<ArrowBack />} 
          onClick={onBack}
          variant="outlined"
          size="small"
        >
          Back
        </Button>
        
        <Typography variant="h5" component="h1" fontWeight="bold">
          {entity.name}
        </Typography>
        
        <Button 
          startIcon={<Refresh />} 
          onClick={refreshTasks}
          variant="outlined"
          size="small"
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>
      
      {/* DAG Info Card */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Grid container spacing={2}>
          <Grid xs={12} md={6}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Status
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {statusIconMap[entity.status] || statusIconMap.unknown}
                <Chip 
                  label={entity.status ? normalizeStatus(entity.status) : 'Unknown'} 
                  size="small" 
                  color={getStatusColor(normalizeStatus(entity.status))}
                  sx={{ ml: 1 }}
                />
              </Box>
            </Box>
          </Grid>
          
          <Grid xs={12} md={6}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Last Run
              </Typography>
              <Typography>
                {entity.lastRun ? 
                  (() => {
                    try {
                      const date = new Date(entity.lastRun);
                      if (isNaN(date.getTime())) {
                        return 'Invalid date';
                      }
                      return format(date, 'MMM d, yyyy h:mm a');
                    } catch (error) {
                      return 'Invalid date';
                    }
                  })() 
                  : 'N/A'}
              </Typography>
            </Box>
          </Grid>
          
          <Grid xs={12} md={6}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Owner
              </Typography>
              <Typography>
                {entity.owner || 'N/A'}
              </Typography>
            </Box>
          </Grid>
          
          <Grid xs={12} md={6}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Current SLA
              </Typography>
              <Typography>
                {entity.currentSla ? `${entity.currentSla.toFixed(1)}%` : 'N/A'}
              </Typography>
            </Box>
          </Grid>
          
          {entity.description && (
            <Grid xs={12}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Description
                </Typography>
                <Typography>
                  {entity.description}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </Paper>
      
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {/* Tasks section */}
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
        Tasks
      </Typography>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Priority zones */}
          <Grid container spacing={2}>
            <Grid xs={12} md={6}>
              <PriorityZone 
                title="High Priority Tasks" 
                priority="high"
                tasks={groupedTasks.high}
                onTaskDropped={(taskId) => handlePriorityChange(taskId, 'high')}
              />
            </Grid>
            
            <Grid xs={12} md={6}>
              <PriorityZone 
                title="Normal Priority Tasks" 
                priority="normal"
                tasks={groupedTasks.normal}
                onTaskDropped={(taskId) => handlePriorityChange(taskId, 'normal')}
              />
            </Grid>
          </Grid>
          
          {/* Task drag layer */}
          <TaskDragLayer />
        </Box>
      )}
    </Box>
  );
};

export default DagDetailView;