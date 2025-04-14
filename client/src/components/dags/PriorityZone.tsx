import React, { useState } from 'react';
import { Paper, Typography, Box, Stack } from '@mui/material';
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
  const [isDragOver, setIsDragOver] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    
    // Get task data from drag event
    const taskDataString = e.dataTransfer.getData('application/json');
    if (!taskDataString) return;
    
    try {
      const taskData = JSON.parse(taskDataString);
      
      // Only show drop indication if the task priority would change
      if (taskData.priority !== priority) {
        setIsDragOver(true);
        e.dataTransfer.dropEffect = 'move';
      } else {
        e.dataTransfer.dropEffect = 'none';
      }
    } catch (error) {
      console.error('Error parsing task data:', error);
    }
  };
  
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    // Get task data from drop event
    const taskDataString = e.dataTransfer.getData('application/json');
    if (!taskDataString) return;
    
    try {
      const taskData = JSON.parse(taskDataString);
      
      // Only process drop if the task is changing priority
      if (taskData.priority !== priority) {
        onTaskDropped(taskData.taskId);
      }
    } catch (error) {
      console.error('Error parsing task data:', error);
    }
  };
  
  return (
    <Paper
      elevation={0}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        p: 2,
        height: '100%',
        minHeight: 200,
        backgroundColor: priority === 'high' ? 'error.lighter' : 'primary.lighter',
        border: 2,
        borderColor: isDragOver 
          ? (priority === 'high' ? 'error.main' : 'primary.main')
          : 'transparent',
        borderRadius: 1,
        transition: 'border-color 0.2s ease',
      }}
    >
      <Typography 
        variant="subtitle1" 
        fontWeight="bold" 
        color={priority === 'high' ? 'error.dark' : 'primary.dark'}
        sx={{ mb: 2 }}
      >
        {title} ({tasks.length})
      </Typography>
      
      <Box sx={{ overflow: 'auto', maxHeight: 'calc(70vh - 180px)' }}>
        {tasks.length === 0 ? (
          <Box 
            sx={{ 
              py: 3, 
              display: 'flex', 
              justifyContent: 'center',
              color: 'text.secondary',
              fontStyle: 'italic' 
            }}
          >
            No {priority} priority tasks
          </Box>
        ) : (
          <Stack spacing={1}>
            {tasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  );
};

export default PriorityZone;