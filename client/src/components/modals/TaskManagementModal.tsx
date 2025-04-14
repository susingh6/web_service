import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  Button,
  Grid as MuiGrid,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment
} from '@mui/material';

import { Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import { Entity, Task } from '@/features/sla/types';
import { getTasksForDag, updateTaskPriority } from '@/features/sla/mockService';
import PriorityZone from '@/components/dags/PriorityZone';
import TaskDragLayer from '@/components/dags/TaskDragLayer';
import { useToast } from '@/hooks/use-toast';

// Create a custom Grid system compatible with MUI Grid v1
const Grid = (props: any) => {
  const { children, container, item, xs, md, lg, spacing, ...rest } = props;
  
  if (container) {
    return (
      <Box 
        {...rest}
        sx={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          margin: spacing ? `-${spacing * 4}px` : 0,
          ...rest.sx
        }}
      >
        {children}
      </Box>
    );
  }
  
  return (
    <Box 
      {...rest}
      sx={{
        padding: props.spacing ? `${props.spacing * 4}px` : 0,
        width: {
          xs: xs === 12 ? '100%' : `${(xs / 12) * 100}%`,
          md: md ? `${(md / 12) * 100}%` : undefined,
          lg: lg ? `${(lg / 12) * 100}%` : undefined,
        },
        ...rest.sx
      }}
    >
      {children}
    </Box>
  );
};

interface TaskManagementModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
}

interface GroupedTasks {
  normal: Task[];
  high: Task[];
}

const TaskManagementModal: React.FC<TaskManagementModalProps> = ({
  open,
  onClose,
  entity
}) => {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupedTasks, setGroupedTasks] = useState<GroupedTasks>({ normal: [], high: [] });
  
  // Load tasks for the selected DAG
  useEffect(() => {
    if (entity && open) {
      const fetchTasks = async () => {
        try {
          setLoading(true);
          const taskData = await getTasksForDag(entity.id);
          setTasks(taskData);
          setFilteredTasks(taskData);
          
          // Group tasks by priority
          groupTasksByPriority(taskData);
          
          setError(null);
        } catch (err) {
          setError('Failed to load tasks. Please try again.');
          console.error('Error loading tasks:', err);
        } finally {
          setLoading(false);
        }
      };
      
      fetchTasks();
    }
  }, [entity, open]);
  
  // Filter tasks based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTasks(tasks);
      groupTasksByPriority(tasks);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = tasks.filter(task => 
      task.name.toLowerCase().includes(query) || 
      (task.description && task.description.toLowerCase().includes(query))
    );
    
    setFilteredTasks(filtered);
    groupTasksByPriority(filtered);
  }, [searchQuery, tasks]);
  
  const groupTasksByPriority = (taskList: Task[]) => {
    const grouped: GroupedTasks = { normal: [], high: [] };
    taskList.forEach(task => {
      if (task.priority === 'high') {
        grouped.high.push(task);
      } else {
        grouped.normal.push(task);
      }
    });
    setGroupedTasks(grouped);
  };
  
  // Handle moving a task between priority zones
  const handlePriorityChange = async (taskId: number, newPriority: 'normal' | 'high') => {
    try {
      // Find the task
      const task = tasks.find(t => t.id === taskId);
      if (!task || task.priority === newPriority) return;
      
      // Optimistically update UI
      const updatedTasks = tasks.map(t => 
        t.id === taskId ? { ...t, priority: newPriority } : t
      );
      setTasks(updatedTasks);
      setFilteredTasks(prevFiltered => 
        prevFiltered.map(t => t.id === taskId ? { ...t, priority: newPriority } : t)
      );
      
      // Update groupings
      groupTasksByPriority(
        searchQuery ? 
          updatedTasks.filter(task => 
            task.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()))
          ) : 
          updatedTasks
      );
      
      // Show toast
      toast({
        title: 'Priority updated',
        description: `Task "${task.name}" moved to ${newPriority} priority`,
        variant: 'default'
      });
      
      // Call the API to update the task
      await updateTaskPriority(taskId, newPriority);
    } catch (err) {
      setError('Failed to update task priority. Please try again.');
      console.error('Error updating task priority:', err);
      
      // Revert the optimistic update
      const fetchTasks = async () => {
        try {
          if (!entity) return;
          
          const taskData = await getTasksForDag(entity.id);
          setTasks(taskData);
          
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const filtered = taskData.filter(task => 
              task.name.toLowerCase().includes(query) || 
              (task.description && task.description.toLowerCase().includes(query))
            );
            setFilteredTasks(filtered);
            groupTasksByPriority(filtered);
          } else {
            setFilteredTasks(taskData);
            groupTasksByPriority(taskData);
          }
        } catch (err) {
          console.error('Error reloading tasks:', err);
        }
      };
      
      fetchTasks();
    }
  };
  
  if (!entity) return null;
  
  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: 2,
          minHeight: '70vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight="bold">
            Task Management: {entity.name}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ py: 3 }}>
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            placeholder="Search tasks..."
            variant="outlined"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        
        {/* Error message */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Priority zones */}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <PriorityZone 
                    title="High Priority Tasks" 
                    priority="high"
                    tasks={groupedTasks.high}
                    onTaskDropped={(taskId) => handlePriorityChange(taskId, 'high')}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
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
            
            {filteredTasks.length === 0 && (
              <Box sx={{ textAlign: 'center', my: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  {tasks.length === 0 
                    ? 'No tasks found for this DAG' 
                    : 'No tasks match your search criteria'}
                </Typography>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TaskManagementModal;