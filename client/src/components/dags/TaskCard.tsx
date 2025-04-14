import React from 'react';
import { 
  Paper, 
  Typography, 
  Box, 
  Chip,
  IconButton
} from '@mui/material';
import { 
  CheckCircle,
  Error as ErrorIcon, 
  PlayArrow, 
  Warning,
  SettingsBackupRestore,
  MoreVert
} from '@mui/icons-material';
import { Task, TaskStatus } from '@/features/sla/types';

interface TaskCardProps {
  task: Task;
}

const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle color="success" fontSize="small" />;
      case 'failed':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'running':
        return <PlayArrow color="warning" fontSize="small" />;
      case 'warning':
        return <Warning color="warning" fontSize="small" />;
      case 'retry':
        return <SettingsBackupRestore color="info" fontSize="small" />;
      default:
        return <MoreVert color="disabled" fontSize="small" />;
    }
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('taskId', task.id.toString());
    e.dataTransfer.setData('taskName', task.name);
    e.dataTransfer.setData('taskPriority', task.priority);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Paper
      variant="outlined"
      sx={{ 
        p: 2, 
        mb: 2, 
        borderLeft: 4,
        borderLeftColor: task.priority === 'high' ? 'error.main' : 'primary.main',
        transition: 'all 0.2s ease',
        cursor: 'grab',
        '&:hover': {
          boxShadow: 2,
          bgcolor: 'background.default'
        }
      }}
      draggable
      onDragStart={handleDragStart}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" fontWeight="bold">
          {task.name}
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {getStatusIcon(task.status)}
          <Chip 
            label={task.status.charAt(0).toUpperCase() + task.status.slice(1)} 
            size="small" 
            color={
              task.status === 'success' ? 'success' :
              task.status === 'running' ? 'warning' :
              task.status === 'failed' ? 'error' :
              task.status === 'warning' ? 'warning' :
              'default'
            }
            sx={{ ml: 1 }}
          />
        </Box>
      </Box>
      
      {task.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {task.description}
        </Typography>
      )}
      
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {task.duration ? `Duration: ${task.duration}s` : 'Not run yet'}
        </Typography>
        
        <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
          Priority: {task.priority === 'high' ? 
            <span style={{ color: '#d32f2f' }}>High</span> : 
            <span style={{ color: '#1976d2' }}>Normal</span>
          }
        </Typography>
      </Box>
    </Paper>
  );
};

export default TaskCard;