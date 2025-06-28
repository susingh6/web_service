import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Box,
  Typography,
  Chip,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  NotificationTimeline,
  InsertNotificationTimeline,
  NotificationTrigger,
  NotificationTriggerType,
  TRIGGER_TYPE_LABELS
} from '@/lib/notifications/timelineTypes';
import { TriggerConfig } from './TriggerConfig';
import { Entity } from '@shared/schema';

interface NotificationTimelineModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  onSuccess?: () => void;
}

interface TimelineFormData {
  name: string;
  description: string;
  channels: string[];
  isActive: boolean;
}

export const NotificationTimelineModal: React.FC<NotificationTimelineModalProps> = ({
  open,
  onClose,
  entity,
  onSuccess
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [triggers, setTriggers] = useState<NotificationTrigger[]>([]);
  const [availableAiTasks, setAvailableAiTasks] = useState<string[]>([]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<TimelineFormData>({
    defaultValues: {
      name: '',
      description: '',
      channels: [],
      isActive: true
    }
  });

  // Fetch existing notification timelines for this entity
  const { data: existingTimelines, isLoading: isLoadingTimelines } = useQuery({
    queryKey: ['notification-timelines', entity?.id],
    queryFn: async () => {
      if (!entity?.id) return [];
      const res = await apiRequest('GET', `/api/entities/${entity.id}/notification-timelines`);
      return await res.json();
    },
    enabled: !!entity?.id && open
  });

  // Fetch AI tasks for this entity (if it's a DAG)
  const { data: aiTasks } = useQuery({
    queryKey: ['ai-tasks', entity?.id],
    queryFn: async () => {
      if (!entity?.id || entity?.type !== 'dag') return [];
      const res = await apiRequest('GET', `/api/entities/${entity.id}/ai-tasks`);
      return await res.json();
    },
    enabled: !!entity?.id && entity?.type === 'dag' && open
  });

  useEffect(() => {
    if (aiTasks) {
      setAvailableAiTasks(aiTasks.map((task: any) => task.name));
    }
  }, [aiTasks]);

  // Mutation to create notification timeline
  const createTimelineMutation = useMutation({
    mutationFn: async (data: InsertNotificationTimeline) => {
      const res = await apiRequest('POST', '/api/notification-timelines', data);
      return await res.json();
    },
    onSuccess: (newTimeline) => {
      toast({
        title: 'Success',
        description: 'Notification timeline created successfully'
      });
      queryClient.invalidateQueries({ queryKey: ['notification-timelines', entity?.id] });
      reset();
      setTriggers([]);
      onSuccess?.();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create notification timeline',
        variant: 'destructive'
      });
    }
  });

  const handleAddTrigger = (triggerType: NotificationTriggerType) => {
    const newTrigger: NotificationTrigger = (() => {
      switch (triggerType) {
        case 'daily_schedule':
          return { type: 'daily_schedule', time: '09:00' };
        case 'sla_failed':
          return { type: 'sla_failed', threshold: 95 };
        case 'ai_task_failed':
          return { type: 'ai_task_failed', taskNames: [] };
        case 'entity_success':
          return { type: 'entity_success' };
        case 'ai_tasks_status':
          return { type: 'ai_tasks_status', condition: 'all_passed', taskNames: [] };
        default:
          return { type: 'daily_schedule', time: '09:00' };
      }
    })();

    setTriggers(prev => [...prev, newTrigger]);
  };

  const handleUpdateTrigger = (index: number, updatedTrigger: NotificationTrigger) => {
    setTriggers(prev => prev.map((trigger, i) => i === index ? updatedTrigger : trigger));
  };

  const handleRemoveTrigger = (index: number) => {
    setTriggers(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (data: TimelineFormData) => {
    if (!entity) return;
    
    if (triggers.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one notification trigger',
        variant: 'destructive'
      });
      return;
    }

    const timelineData: InsertNotificationTimeline = {
      entityId: entity.id,
      name: data.name,
      description: data.description || undefined,
      triggers,
      channels: data.channels,
      isActive: data.isActive
    };

    createTimelineMutation.mutate(timelineData);
  };

  const entityLabel = entity?.type === 'table' ? 'Table' : 'DAG';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Set Notification Timelines for {entityLabel}: {entity?.name}
      </DialogTitle>
      
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Box sx={{ mb: 3 }}>
            <Controller
              name="name"
              control={control}
              rules={{ required: 'Timeline name is required' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Timeline Name"
                  fullWidth
                  margin="normal"
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />

            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Description (Optional)"
                  fullWidth
                  margin="normal"
                  multiline
                  rows={2}
                />
              )}
            />

            <Controller
              name="channels"
              control={control}
              rules={{ required: 'Select at least one notification channel' }}
              render={({ field: { onChange, value } }) => (
                <FormControl component="fieldset" margin="normal" fullWidth>
                  <FormLabel component="legend">Notification Channels</FormLabel>
                  <FormGroup row>
                    {['email', 'slack', 'pagerduty'].map((channel) => (
                      <FormControlLabel
                        key={channel}
                        control={
                          <Checkbox
                            checked={value?.includes(channel) || false}
                            onChange={(e) => {
                              const currentValue = value || [];
                              if (e.target.checked) {
                                onChange([...currentValue, channel]);
                              } else {
                                onChange(currentValue.filter((c: string) => c !== channel));
                              }
                            }}
                          />
                        }
                        label={channel.charAt(0).toUpperCase() + channel.slice(1)}
                      />
                    ))}
                  </FormGroup>
                  {errors.channels && (
                    <Typography color="error" variant="caption">
                      {errors.channels.message}
                    </Typography>
                  )}
                </FormControl>
              )}
            />

            <Controller
              name="isActive"
              control={control}
              render={({ field: { onChange, value } }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={value}
                      onChange={onChange}
                    />
                  }
                  label="Active Timeline"
                />
              )}
            />
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Notification Triggers
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <FormControl fullWidth>
                <FormLabel>Add New Trigger</FormLabel>
                <Select
                  value=""
                  onChange={(e) => handleAddTrigger(e.target.value as NotificationTriggerType)}
                  displayEmpty
                >
                  <MenuItem value="" disabled>
                    Select trigger type to add...
                  </MenuItem>
                  {Object.entries(TRIGGER_TYPE_LABELS).map(([type, label]) => (
                    <MenuItem key={type} value={type}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {triggers.length === 0 ? (
              <Alert severity="info">
                No triggers configured. Add at least one trigger to set up notifications.
              </Alert>
            ) : (
              <Box>
                {triggers.map((trigger, index) => (
                  <TriggerConfig
                    key={index}
                    trigger={trigger}
                    onChange={(updatedTrigger) => handleUpdateTrigger(index, updatedTrigger)}
                    onRemove={() => handleRemoveTrigger(index)}
                    availableAiTasks={availableAiTasks}
                    entityType={entity?.type as 'table' | 'dag'}
                  />
                ))}
              </Box>
            )}
          </Box>

          {existingTimelines && existingTimelines.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Existing Timelines
              </Typography>
              {existingTimelines.map((timeline: NotificationTimeline) => (
                <Chip
                  key={timeline.id}
                  label={`${timeline.name} (${timeline.triggers.length} triggers)`}
                  variant="outlined"
                  sx={{ mr: 1, mb: 1 }}
                  color={timeline.isActive ? 'primary' : 'default'}
                />
              ))}
            </Box>
          )}
        </form>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          disabled={createTimelineMutation.isPending}
        >
          {createTimelineMutation.isPending ? (
            <CircularProgress size={20} />
          ) : (
            'Create Timeline'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};