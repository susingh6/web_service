import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography } from '@mui/material';

// A simple component that follows the cursor during drag operations
const TaskDragLayer: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [taskName, setTaskName] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high'>('normal');
  
  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('taskId')) {
        setIsDragging(true);
        setTaskName(e.dataTransfer.getData('taskName') || 'Task');
        setPriority(e.dataTransfer.getData('taskPriority') as 'normal' | 'high' || 'normal');
      }
    };
    
    const handleDrag = (e: DragEvent) => {
      if (e.clientX && e.clientY) {
        setPosition({ x: e.clientX, y: e.clientY });
      }
    };
    
    const handleDragEnd = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('drag', handleDrag);
    document.addEventListener('dragend', handleDragEnd);
    
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('drag', handleDrag);
      document.removeEventListener('dragend', handleDragEnd);
    };
  }, []);
  
  if (!isDragging) return null;
  
  return (
    <Box
      sx={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 9999,
        left: position.x + 15,
        top: position.y + 15,
        opacity: 0.8,
      }}
    >
      <Paper
        elevation={3}
        sx={{ 
          p: 1, 
          minWidth: 150,
          backgroundColor: 'background.paper',
          borderLeft: 4,
          borderColor: priority === 'high' ? 'error.main' : 'primary.main'
        }}
      >
        <Typography variant="body2" fontWeight="medium">
          {taskName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Moving to {priority === 'high' ? 'normal' : 'high'} priority
        </Typography>
      </Paper>
    </Box>
  );
};

export default TaskDragLayer;