import React, { useEffect, useState } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  IconButton, 
  Box, 
  Typography, 
  Divider,
  CircularProgress
} from '@mui/material';
// Note: Using Box-based layout instead of Grid to avoid type mismatch across MUI versions
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

  // Get tasks for this DAG using new architecture: cache structure + team-scoped AI tasks
  const { data: tasks, isLoading, error, refetch } = useGetDagTasks(dag?.name, dag?.name, dag?.team_name ?? undefined);
  const updateTaskPriority = useUpdateTaskPriority();

  // Split tasks into priority zones when data loads
  useEffect(() => {
    if (tasks) {
      setHighPriorityTasks(tasks.filter((task: Task) => task.priority === 'high'));
      setNormalPriorityTasks(tasks.filter((task: Task) => task.priority === 'normal'));
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

    // Build the updated tasks list with new priorities
    const updatedTasks = tasks?.map(t => 
      t.id === taskId ? { ...t, priority: newPriority } : t
    ) || [];

    // Call API to persist changes with team-scoped bulk update
    if (!dag) return;
    
    updateTaskPriority.mutate({ 
      entityName: dag.name,
      allTasks: updatedTasks,
      teamName: dag.team_name || '',
      tenantName: dag.tenant_name || ''
    }, {
      onSuccess: () => {
        console.log('[TaskManagementModal] Task priority update successful - UI will update after refetch');
        // Query auto-refetches due to invalidation, which updates highPriorityTasks/normalPriorityTasks via useEffect
      },
      onError: (error) => {
        console.error('[TaskManagementModal] Task priority update failed:', error);
        // Refetch to ensure UI shows correct state
        refetch();
      }
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
        <Typography variant="h6" component="span">
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

            <Box 
              sx={{ 
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, 
                gap: 3 
              }}
            >
              <Box>
                <PriorityZone 
                  title="AI Monitored Tasks"
                  priority="high"
                  tasks={highPriorityTasks}
                  onTaskDropped={(taskId) => handleTaskDropped(taskId, 'high')}
                />
              </Box>
              <Box>
                <PriorityZone 
                  title="Regular Tasks"
                  priority="normal"
                  tasks={normalPriorityTasks}
                  onTaskDropped={(taskId) => handleTaskDropped(taskId, 'normal')}
                />
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TaskManagementModal;