import React, { useEffect, useState } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  IconButton, 
  Box, 
  Typography, 
  Divider,
  Grid,
  CircularProgress
} from '@mui/material';
import { X } from 'lucide-react';
import { Task, TaskPriority } from '@/features/sla/types';
import { Entity } from '@shared/schema';
import PriorityZone from '@/components/dags/PriorityZone';
import TaskDragLayer from '@/components/dags/TaskDragLayer';
import { useGetDagTasks, useUpdateTaskPriority } from '@/features/sla/taskService';

interface TaskManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  dag: Entity | null;
}

const TaskManagementModal: React.FC<TaskManagementModalProps> = ({ 
  isOpen, 
  onClose,
  dag 
}) => {
  const [highPriorityTasks, setHighPriorityTasks] = useState<Task[]>([]);
  const [normalPriorityTasks, setNormalPriorityTasks] = useState<Task[]>([]);
  
  // Get tasks for this DAG
  const { data: tasks, isLoading, error } = useGetDagTasks(dag?.id);
  const { mutate: updateTaskPriority } = useUpdateTaskPriority();
  
  // Split tasks into priority zones when data loads
  useEffect(() => {
    if (tasks) {
      setHighPriorityTasks(tasks.filter(task => task.priority === 'high'));
      setNormalPriorityTasks(tasks.filter(task => task.priority === 'normal'));
    }
  }, [tasks]);
  
  // Handle task being dropped into a priority zone
  const handleTaskDropped = (taskId: number, newPriority: TaskPriority) => {
    // Find the task in our local state
    const highPriorityTask = highPriorityTasks.find(t => t.id === taskId);
    const normalPriorityTask = normalPriorityTasks.find(t => t.id === taskId);
    const task = highPriorityTask || normalPriorityTask;
    
    if (!task) return;
    
    // Only process if priority is actually changing
    if (task.priority === newPriority) return;
    
    // Update local state immediately for a responsive UI
    const updatedTask = { ...task, priority: newPriority };
    
    if (newPriority === 'high') {
      setHighPriorityTasks(prev => [...prev, updatedTask]);
      setNormalPriorityTasks(prev => prev.filter(t => t.id !== taskId));
    } else {
      setNormalPriorityTasks(prev => [...prev, updatedTask]);
      setHighPriorityTasks(prev => prev.filter(t => t.id !== taskId));
    }
    
    // Call API to persist changes
    updateTaskPriority({ 
      taskId, 
      priority: newPriority,
      dagId: dag?.id as number
    });
  };
  
  if (!dag) return null;
  
  return (
    <Dialog 
      open={isOpen} 
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ 
        elevation: 3,
        sx: { 
          overflow: 'visible',
          borderRadius: 1 
        }
      }}
    >
      <DialogTitle sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">
          {dag.name} - Task Management
        </Typography>
        <IconButton edge="end" onClick={onClose} aria-label="close">
          <X size={18} />
        </IconButton>
      </DialogTitle>
      
      <Divider />
      
      <DialogContent sx={{ px: 3, py: 3 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="error">
              Error loading tasks: {error.toString()}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ position: 'relative' }}>
            <TaskDragLayer />
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Drag and drop tasks between zones to change their priority. Tasks can be configured with enhanced monitoring and notification triggers.
              </Typography>
            </Box>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <PriorityZone 
                  title="AI Monitored Tasks"
                  priority="high"
                  tasks={highPriorityTasks}
                  onTaskDropped={(taskId) => handleTaskDropped(taskId, 'high')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PriorityZone 
                  title="Regular Tasks"
                  priority="normal"
                  tasks={normalPriorityTasks}
                  onTaskDropped={(taskId) => handleTaskDropped(taskId, 'normal')}
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TaskManagementModal;