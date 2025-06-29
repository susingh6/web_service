import React from 'react';
import {
  FormControl,
  FormLabel,
  TextField,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Box,
  Typography,
  Chip,
  Radio,
  RadioGroup
} from '@mui/material';
import {
  NotificationTrigger,
  NotificationTriggerType,
  TRIGGER_TYPE_LABELS,
  AI_TASK_CONDITIONS,
  DailyScheduleTrigger,
  SlaThresholdBreachedTrigger,
  EntitySuccessTrigger,
  AiTasksStatusTrigger
} from '@/lib/notifications/timelineTypes';

interface TriggerConfigProps {
  trigger: NotificationTrigger;
  onChange: (trigger: NotificationTrigger) => void;
  onRemove: () => void;
  availableAiTasks?: string[];
  entityType: 'table' | 'dag';
}

export const TriggerConfig: React.FC<TriggerConfigProps> = ({
  trigger,
  onChange,
  onRemove,
  availableAiTasks = [],
  entityType
}) => {
  const getEntityLabel = () => entityType === 'table' ? 'Table' : 'DAG';
  
  const renderTriggerSpecificConfig = () => {
    switch (trigger.type) {
      case 'daily_schedule':
        return (
          <TextField
            label="Time (UTC)"
            type="time"
            value={trigger.time || '09:00'}
            onChange={(e) => onChange({ ...trigger, time: e.target.value })}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 300 }} // 5 minute steps
            fullWidth
            margin="normal"
          />
        );

      case 'sla_threshold_breached':
        return (
          <TextField
            label="SLA Threshold (%)"
            type="number"
            value={(trigger as SlaThresholdBreachedTrigger).threshold || 95}
            onChange={(e) => onChange({ 
              ...trigger, 
              threshold: parseFloat(e.target.value) || 95 
            })}
            inputProps={{ min: 0, max: 100, step: 0.1 }}
            fullWidth
            margin="normal"
            helperText={`Notify when ${getEntityLabel()} SLA drops below this percentage`}
          />
        );



      case 'entity_success':
        return (
          <Typography variant="body2" color="textSecondary">
            Notification will be sent when the {getEntityLabel().toLowerCase()} completes successfully.
          </Typography>
        );

      case 'entity_failure':
        return (
          <Typography variant="body2" color="textSecondary">
            Notification will be sent when the {getEntityLabel().toLowerCase()} fails to meet SLA requirements.
          </Typography>
        );

      case 'ai_tasks_status':
        return (
          <Box>
            <FormControl fullWidth margin="normal">
              <FormLabel>Condition</FormLabel>
              <Select
                value={(trigger as AiTasksStatusTrigger).condition || 'all_passed'}
                onChange={(e) => onChange({ 
                  ...trigger, 
                  condition: e.target.value as any 
                })}
              >
                {AI_TASK_CONDITIONS.map((condition) => (
                  <MenuItem key={condition.value} value={condition.value}>
                    {condition.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1, mt: 2 }}>
              Select specific AI tasks to monitor (leave empty for all):
            </Typography>
            <FormGroup>
              {availableAiTasks.map((taskName) => (
                <FormControlLabel
                  key={taskName}
                  control={
                    <Checkbox
                      checked={(trigger as AiTasksStatusTrigger).taskNames?.includes(taskName) || false}
                      onChange={(e) => {
                        const currentTasks = (trigger as AiTasksStatusTrigger).taskNames || [];
                        const newTasks = e.target.checked
                          ? [...currentTasks, taskName]
                          : currentTasks.filter(t => t !== taskName);
                        onChange({ ...trigger, taskNames: newTasks });
                      }}
                    />
                  }
                  label={taskName}
                />
              ))}
            </FormGroup>
            {(!(trigger as AiTasksStatusTrigger).taskNames || (trigger as AiTasksStatusTrigger).taskNames.length === 0) && (
              <Chip 
                label="Monitoring all AI tasks" 
                size="small" 
                color="primary" 
                variant="outlined"
                sx={{ mt: 1 }}
              />
            )}
            
            {/* Notification Behavior for AI TASKS PASSED */}
            {(trigger as AiTasksStatusTrigger).condition === 'all_passed' && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 2 }}>
                  Notification Behavior:
                </Typography>
                <FormControl component="fieldset">
                  <RadioGroup
                    value={(trigger as AiTasksStatusTrigger).notificationBehavior || 'notify_all'}
                    onChange={(e) => {
                      onChange({ 
                        ...trigger, 
                        notificationBehavior: e.target.value as 'notify_all' | 'notify_each'
                      });
                    }}
                  >
                    <FormControlLabel
                      value="notify_all"
                      control={<Radio />}
                      label="Notify when ALL selected tasks pass"
                      sx={{ mb: 1 }}
                    />
                    <Typography variant="caption" color="textSecondary" sx={{ ml: 4, mb: 2, display: 'block' }}>
                      Send one notification when all selected tasks complete successfully
                    </Typography>
                    
                    <FormControlLabel
                      value="notify_each"
                      control={<Radio />}
                      label="Notify for EACH task individually"
                    />
                    <Typography variant="caption" color="textSecondary" sx={{ ml: 4, display: 'block' }}>
                      Send separate notifications as each task completes successfully
                    </Typography>
                  </RadioGroup>
                </FormControl>
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box 
      sx={{ 
        border: 1, 
        borderColor: 'divider', 
        borderRadius: 2, 
        p: 2, 
        mb: 2,
        position: 'relative'
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {TRIGGER_TYPE_LABELS[trigger.type]}
        </Typography>
        <Chip 
          label="Remove" 
          onClick={onRemove} 
          color="error" 
          variant="outlined" 
          size="small"
          clickable
        />
      </Box>
      
      {renderTriggerSpecificConfig()}
    </Box>
  );
};