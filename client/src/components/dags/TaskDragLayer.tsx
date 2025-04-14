import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';

/**
 * A drag layer component that shows a visual indicator when dragging a task
 * This provides better visual feedback during drag operations
 */
const TaskDragLayer: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragData, setDragData] = useState<{ taskId?: number; priority?: string } | null>(null);
  
  useEffect(() => {
    // Set up global drag event handlers
    const handleDragStart = (e: DragEvent) => {
      if (!e.dataTransfer) return;

      // Check if this is a task being dragged
      try {
        const dataString = e.dataTransfer.getData('application/json');
        if (!dataString) return;
        
        const data = JSON.parse(dataString);
        if (data && data.taskId) {
          setDragData(data);
          setIsDragging(true);
        }
      } catch (error) {
        // Not a valid task drag event
        console.error('Error parsing drag data:', error);
      }
    };
    
    const handleDrag = (e: DragEvent) => {
      if (isDragging && e.clientX && e.clientY) {
        setPosition({
          x: e.clientX,
          y: e.clientY
        });
      }
    };
    
    const handleDragEnd = () => {
      setIsDragging(false);
      setDragData(null);
    };
    
    // Add event listeners
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('drag', handleDrag);
    document.addEventListener('dragend', handleDragEnd);
    
    // Clean up event listeners
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('drag', handleDrag);
      document.removeEventListener('dragend', handleDragEnd);
    };
  }, [isDragging]);
  
  if (!isDragging || !dragData) {
    return null;
  }
  
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: position.y + 15,
          left: position.x + 15,
          backgroundColor: dragData.priority === 'high' ? 'error.main' : 'primary.main',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          boxShadow: 2,
          opacity: 0.8,
        }}
      >
        Moving Task
      </Box>
    </Box>
  );
};

export default TaskDragLayer;