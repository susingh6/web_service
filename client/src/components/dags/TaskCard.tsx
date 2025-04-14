import React, { useRef } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  Chip,
  Tooltip,
  CardActionArea
} from '@mui/material';
import { 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  RotateCw,
  Hourglass,
  ArrowRightCircle,
  ChevronRight
} from 'lucide-react';
import { Task, TaskStatus } from '@/features/sla/types';
import { formatDuration } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
}

const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  
  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 size={16} color="green" />;
      case 'failed':
        return <XCircle size={16} color="red" />;
      case 'running':
        return <RotateCw size={16} className="animate-spin" color="#3498db" />;
      case 'warning':
        return <AlertCircle size={16} color="orange" />;
      case 'retry':
        return <ArrowRightCircle size={16} color="purple" />;
      case 'pending':
        return <Hourglass size={16} color="gray" />;
      default:
        return <AlertCircle size={16} color="gray" />;
    }
  };
  
  const handleDragStart = (e: React.DragEvent) => {
    // Set the task ID as transfer data
    e.dataTransfer.setData('application/json', JSON.stringify({
      taskId: task.id,
      priority: task.priority
    }));
    
    // Set dragging effect
    e.dataTransfer.effectAllowed = 'move';
    
    // Append a ghost image to the body that will be used as dragging preview
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const ghostImg = cardRef.current.cloneNode(true) as HTMLElement;
      
      ghostImg.style.position = 'absolute';
      ghostImg.style.top = '-1000px';
      ghostImg.style.opacity = '0.8';
      ghostImg.style.width = `${rect.width}px`;
      
      document.body.appendChild(ghostImg);
      
      // Use the ghost image for dragging
      e.dataTransfer.setDragImage(ghostImg, 20, 20);
      
      // Remove the ghost image after drag ends
      setTimeout(() => {
        document.body.removeChild(ghostImg);
      }, 0);
    }
  };
  
  return (
    <Card 
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      elevation={0}
      sx={{ 
        mb: 1.5,
        borderLeft: 3, 
        borderColor: task.priority === 'high' ? 'error.main' : 'primary.main',
        transition: 'all 0.2s ease',
        borderRadius: 1,
        cursor: 'grab',
        '&:hover': {
          backgroundColor: 'action.hover',
          transform: 'translateY(-2px)',
          boxShadow: 2
        }
      }}
    >
      <CardActionArea>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}>
              {getStatusIcon(task.status)}
              <Box component="span" mx={0.5}>•</Box> 
              {task.name}
            </Typography>
            <Chip
              label={task.priority}
              size="small"
              color={task.priority === 'high' ? 'error' : 'primary'}
              sx={{ 
                height: '20px',
                '& .MuiChip-label': { 
                  px: 1,
                  fontSize: '0.625rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }
              }}
            />
          </Box>
          
          {task.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.8rem' }}>
              {task.description}
            </Typography>
          )}
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
            <Tooltip title="Task Duration">
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Clock size={14} />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  {formatDuration(task.duration)}
                </Typography>
              </Box>
            </Tooltip>
            
            {task.dependencies && task.dependencies.length > 0 && (
              <Tooltip title={`Depends on ${task.dependencies.length} task(s)`}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center' }}>
                  {task.dependencies.length} <ChevronRight size={14} />
                </Typography>
              </Tooltip>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default TaskCard;