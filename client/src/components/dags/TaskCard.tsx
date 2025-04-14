import React, { useRef } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  Chip,
  LinearProgress
} from '@mui/material';
import { 
  PlayArrow, 
  CheckCircle, 
  Error as ErrorIcon, 
  PauseCircle 
} from '@mui/icons-material';
import { Task } from '@/features/sla/types';
import { format } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onDragStart?: (taskId: number) => void;
  isDraggable?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  onDragStart,
  isDraggable = true
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Status icon and chip color mapping
  const statusMap: Record<string, { icon: JSX.Element, color: 'success' | 'error' | 'warning' | 'default' }> = {
    'pending': { icon: <PauseCircle />, color: 'default' },
    'running': { icon: <PlayArrow />, color: 'warning' },
    'completed': { icon: <CheckCircle />, color: 'success' },
    'failed': { icon: <ErrorIcon />, color: 'error' }
  };
  
  const statusInfo = statusMap[task.status] || statusMap.pending;
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isDraggable) return;
    
    e.dataTransfer.setData('taskId', task.id.toString());
    e.dataTransfer.setData('taskName', task.name);
    e.dataTransfer.setData('taskPriority', task.priority);
    
    // Set drag image (optional)
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(
        cardRef.current,
        e.clientX - rect.left,
        e.clientY - rect.top
      );
    }
    
    if (onDragStart) {
      onDragStart(task.id);
    }
  };

  return (
    <Card 
      ref={cardRef}
      variant="outlined" 
      draggable={isDraggable}
      onDragStart={handleDragStart}
      sx={{ 
        mb: 2, 
        cursor: isDraggable ? 'grab' : 'default',
        transition: 'all 0.2s ease',
        '&:hover': isDraggable ? {
          boxShadow: 2,
          transform: 'translateY(-2px)'
        } : {},
        borderColor: task.priority === 'high' ? 'error.main' : 'divider',
        borderWidth: task.priority === 'high' ? 2 : 1,
        position: 'relative',
        overflow: 'visible',
        '&::after': task.priority === 'high' ? {
          content: '""',
          position: 'absolute',
          top: -8,
          right: -8,
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: 'error.main',
        } : {}
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 500 }}>
            {task.name}
          </Typography>
          
          <Chip 
            icon={statusInfo.icon} 
            label={task.status.charAt(0).toUpperCase() + task.status.slice(1)} 
            color={statusInfo.color}
            size="small"
          />
        </Box>
        
        {task.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {task.description}
          </Typography>
        )}
        
        {task.status === 'running' && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress />
          </Box>
        )}
        
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {task.startTime && (
            <Box>
              <Typography variant="caption" color="text.secondary" component="div">
                Start Time
              </Typography>
              <Typography variant="body2">
                {format(new Date(task.startTime), 'h:mm a')}
              </Typography>
            </Box>
          )}
          
          {task.endTime && (
            <Box>
              <Typography variant="caption" color="text.secondary" component="div">
                End Time
              </Typography>
              <Typography variant="body2">
                {format(new Date(task.endTime), 'h:mm a')}
              </Typography>
            </Box>
          )}
          
          {task.duration && (
            <Box>
              <Typography variant="caption" color="text.secondary" component="div">
                Duration
              </Typography>
              <Typography variant="body2">
                {task.duration >= 60 
                  ? `${Math.floor(task.duration / 60)}m ${task.duration % 60}s` 
                  : `${task.duration}s`}
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default TaskCard;