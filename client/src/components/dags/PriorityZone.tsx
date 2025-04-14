import React, { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography,
  Divider,
  useTheme
} from '@mui/material';
import { Task, TaskPriority } from '@/features/sla/types';
import TaskCard from './TaskCard';

interface PriorityZoneProps {
  title: string;
  priority: TaskPriority;
  tasks: Task[];
  onTaskDropped: (taskId: number) => void;
}

const PriorityZone: React.FC<PriorityZoneProps> = ({ 
  title, 
  priority, 
  tasks,
  onTaskDropped
}) => {
  const theme = useTheme();
  const [isOver, setIsOver] = useState(false);
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    // Don't allow dropping if task is already in this zone
    const taskPriority = e.dataTransfer.getData('taskPriority');
    if (taskPriority === priority) return;
    
    setIsOver(true);
  };
  
  const handleDragLeave = () => {
    setIsOver(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    
    const taskId = parseInt(e.dataTransfer.getData('taskId'), 10);
    const taskPriority = e.dataTransfer.getData('taskPriority');
    
    // Don't allow dropping if task is already in this zone
    if (taskPriority === priority) return;
    
    onTaskDropped(taskId);
  };

  return (
    <Paper
      variant="outlined"
      sx={{ 
        height: '100%',
        p: 2,
        transition: 'all 0.2s ease',
        borderColor: isOver ? (priority === 'high' ? 'error.main' : 'primary.main') : 'divider',
        backgroundColor: isOver ? (
          priority === 'high' 
            ? theme.palette.error.light + '20' 
            : theme.palette.primary.light + '20'
        ) : 'background.paper',
        borderWidth: isOver ? 2 : 1,
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Typography 
        variant="h6" 
        fontWeight="bold" 
        color={priority === 'high' ? 'error.main' : 'primary.main'}
        sx={{ mb: 2 }}
      >
        {title}
      </Typography>
      
      <Divider sx={{ mb: 2 }} />
      
      {tasks.length === 0 ? (
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            height: 100,
            backgroundColor: 'action.hover',
            borderRadius: 1,
            border: '1px dashed',
            borderColor: 'text.disabled'
          }}
        >
          <Typography color="text.secondary">
            {priority === 'high' 
              ? 'Drag tasks here to mark as high priority' 
              : 'Drag tasks here to mark as normal priority'}
          </Typography>
        </Box>
      ) : (
        <Box 
          sx={{ 
            maxHeight: 500, 
            overflowY: 'auto',
            pr: 1
          }}
        >
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default PriorityZone;