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
  CircularProgress,
  Stack
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { endpoints } from '@/config';
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
      const res = await apiRequest('GET', endpoints.entity.notificationTimelines(entity.id));
      return await res.json();
    },
    enabled: !!entity?.id && open
  });

  // Fetch AI tasks for this entity (if it's a DAG)
  const { data: aiTasks } = useQuery({
    queryKey: ['ai-tasks', entity?.id],
    queryFn: async () => {
      if (!entity?.id || entity?.type !== 'dag') return [];
      const res = await apiRequest('GET', endpoints.entity.aiTasks(entity.id));
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
      const res = await apiRequest('POST', endpoints.notificationTimelines.create, data);
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
    if (triggers.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one trigger',
        variant: 'destructive'
      });
      return;
    }

    const payload: InsertNotificationTimeline = {
      entityId: entity?.id || 0,
      name: data.name,
      description: data.description,
      triggers,
      channels: data.channels,
      isActive: data.isActive
    };

    createTimelineMutation.mutate(payload);
  };

  const handleClose = () => {
    reset();
    setTriggers([]);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: 24,
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="h2" fontWeight={600}>
          Set Notification Timeline
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Configure notification triggers and channels for {entity?.name}
        </Typography>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={3}>
            {/* Basic Information Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Basic Information
              </Typography>
              <Stack spacing={2}>
                <Controller
                  name="name"
                  control={control}
                  rules={{ required: 'Timeline name is required' }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Timeline Name"
                      fullWidth
                      required
                      error={!!errors.name}
                      helperText={errors.name?.message}
                      placeholder="e.g., Daily Status Update"
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
                      multiline
                      rows={2}
                      error={!!errors.description}
                      helperText={errors.description?.message}
                      placeholder="Describe when and why this notification should be sent"
                    />
                  )}
                />
              </Stack>
            </Box>

            <Divider />

            {/* Trigger Configuration Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Trigger Configuration
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <FormLabel component="legend" sx={{ mb: 1 }}>Add Trigger</FormLabel>
                <Select
                  value=""
                  onChange={(e) => handleAddTrigger(e.target.value as NotificationTriggerType)}
                  displayEmpty
                  fullWidth
                >
                  <MenuItem value="" disabled>Select trigger type to add</MenuItem>
                  <MenuItem value="daily_schedule">{TRIGGER_TYPE_LABELS.daily_schedule}</MenuItem>
                  <MenuItem value="sla_failed">{TRIGGER_TYPE_LABELS.sla_failed}</MenuItem>
                  <MenuItem value="ai_task_failed">{TRIGGER_TYPE_LABELS.ai_task_failed}</MenuItem>
                  <MenuItem value="entity_success">{TRIGGER_TYPE_LABELS.entity_success}</MenuItem>
                  <MenuItem value="ai_tasks_status">{TRIGGER_TYPE_LABELS.ai_tasks_status}</MenuItem>
                </Select>
              </Box>

              {triggers.map((trigger, index) => (
                <TriggerConfig
                  key={index}
                  trigger={trigger}
                  onUpdate={(updatedTrigger) => handleUpdateTrigger(index, updatedTrigger)}
                  onRemove={() => handleRemoveTrigger(index)}
                  availableAiTasks={availableAiTasks}
                />
              ))}
            </Box>

            <Divider />

            {/* Notification Channels Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Notification Channels
              </Typography>
              <Controller
                name="channels"
                control={control}
                render={({ field }) => (
                  <FormGroup>
                    {['email', 'slack', 'pagerduty'].map((channel) => (
                      <FormControlLabel
                        key={channel}
                        control={
                          <Checkbox
                            checked={field.value.includes(channel)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, channel]);
                              } else {
                                field.onChange(field.value.filter((c: string) => c !== channel));
                              }
                            }}
                          />
                        }
                        label={channel.charAt(0).toUpperCase() + channel.slice(1)}
                      />
                    ))}
                  </FormGroup>
                )}
              />
            </Box>

            <Divider />

            {/* Existing Timelines Section */}
            {existingTimelines && existingTimelines.length > 0 && (
              <Box>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                  Existing Timelines
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {existingTimelines.map((timeline: NotificationTimeline) => (
                    <Chip
                      key={timeline.id}
                      label={timeline.name}
                      variant="outlined"
                      color={timeline.isActive ? "primary" : "default"}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Status Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Status
              </Typography>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={field.value}
                        onChange={field.onChange}
                      />
                    }
                    label="Active"
                  />
                )}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleClose} disabled={createTimelineMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={createTimelineMutation.isPending}
            startIcon={createTimelineMutation.isPending ? <CircularProgress size={20} /> : null}
          >
            {createTimelineMutation.isPending ? 'Creating...' : 'Create Timeline'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default NotificationTimelineModal;