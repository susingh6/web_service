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
  Stack,
  Tabs,
  Tab
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { endpoints, fieldDefinitions } from '@/config';
import {
  NotificationTimeline,
  InsertNotificationTimeline,
  NotificationTrigger,
  NotificationTriggerType,
  TRIGGER_TYPE_LABELS
} from '@/lib/notifications/timelineTypes';
import { TriggerConfig } from './TriggerConfig';
import { NotificationConfigManager } from '@/components/notifications/NotificationConfigManager';
import { NotificationSettings } from '@/lib/notifications/types';
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
  
  const [tabValue, setTabValue] = useState('add');
  const [selectedTimelineId, setSelectedTimelineId] = useState<string>('');
  const [triggers, setTriggers] = useState<NotificationTrigger[]>([]);
  const [availableAiTasks, setAvailableAiTasks] = useState<string[]>([]);
  const [availableRegularTasks, setAvailableRegularTasks] = useState<string[]>([]);
  const [enabledChannels, setEnabledChannels] = useState<string[]>([]);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({});

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

  // Fetch all tasks for this entity (if it's a DAG)
  const { data: allTasks } = useQuery({
    queryKey: ['tasks', entity?.id],
    queryFn: async () => {
      if (!entity?.id || entity?.type !== 'dag') return [];
      const res = await apiRequest('GET', endpoints.entity.tasks(entity.id));
      return await res.json();
    },
    enabled: !!entity?.id && entity?.type === 'dag' && open
  });

  // Filter tasks by type
  const aiTasks = allTasks?.filter((task: any) => task.task_type === 'AI') || [];
  const regularTasks = allTasks?.filter((task: any) => task.task_type === 'regular') || [];

  // Fetch individual notification timeline for editing
  const { data: selectedTimeline, isLoading: isLoadingTimeline } = useQuery({
    queryKey: ['notification-timeline', selectedTimelineId],
    queryFn: async () => {
      if (!selectedTimelineId) return null;
      const res = await apiRequest('GET', endpoints.notificationTimelines.byId(selectedTimelineId));
      return await res.json();
    },
    enabled: !!selectedTimelineId && tabValue === 'update'
  });

  useEffect(() => {
    if (aiTasks?.length > 0) {
      const taskNames = aiTasks.map((task: any) => task.name);
      setAvailableAiTasks(prev => {
        // Only update if the array actually changed
        if (JSON.stringify(prev) !== JSON.stringify(taskNames)) {
          return taskNames;
        }
        return prev;
      });
    }
  }, [aiTasks]);

  useEffect(() => {
    if (regularTasks?.length > 0) {
      const taskNames = regularTasks.map((task: any) => task.name);
      setAvailableRegularTasks(prev => {
        // Only update if the array actually changed
        if (JSON.stringify(prev) !== JSON.stringify(taskNames)) {
          return taskNames;
        }
        return prev;
      });
    }
  }, [regularTasks]);

  // Populate form when editing an existing timeline
  useEffect(() => {
    if (selectedTimeline && tabValue === 'update') {
      reset({
        name: selectedTimeline.name,
        description: selectedTimeline.description || '',
        channels: selectedTimeline.channels || [],
        isActive: selectedTimeline.isActive
      });
      
      // Filter out AI task triggers for table entities
      const filteredTriggers = entity?.type === 'table' 
        ? (selectedTimeline.triggers || []).filter(trigger => trigger.type !== 'ai_tasks_status')
        : (selectedTimeline.triggers || []);
      
      setTriggers(filteredTriggers);
      setEnabledChannels(selectedTimeline.channels || []);
    }
  }, [selectedTimeline, reset, tabValue, entity?.type]);

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
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create notification timeline',
        variant: 'destructive'
      });
    }
  });

  // Mutation to update notification timeline
  const updateTimelineMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<NotificationTimeline> }) => {
      const res = await apiRequest('PUT', endpoints.notificationTimelines.update(data.id), data.updates);
      return await res.json();
    },
    onSuccess: (updatedTimeline) => {
      toast({
        title: 'Success',
        description: 'Notification timeline updated successfully'
      });
      queryClient.invalidateQueries({ queryKey: ['notification-timelines', entity?.id] });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update notification timeline',
        variant: 'destructive'
      });
    }
  });

  const handleAddTrigger = (triggerType: NotificationTriggerType) => {
    // Check if this trigger type already exists
    const triggerExists = triggers.some(trigger => trigger.type === triggerType);
    
    if (triggerExists) {
      toast({
        title: 'Duplicate Trigger',
        description: `${TRIGGER_TYPE_LABELS[triggerType]} trigger already exists`,
        variant: 'destructive'
      });
      return;
    }

    const newTrigger: NotificationTrigger = (() => {
      switch (triggerType) {
        case 'daily_schedule':
          return { type: 'daily_schedule', time: '09:00' };
        case 'sla_threshold_breached':
          return { type: 'sla_threshold_breached', threshold: 95 };
        case 'entity_success':
          return { type: 'entity_success' };
        case 'entity_failure':
          return { type: 'entity_failure' };
        case 'ai_tasks_status':
          return { type: 'ai_tasks_status', condition: 'all_passed', taskNames: [] };
        case 'regular_tasks_status':
          return { type: 'regular_tasks_status', condition: 'all_passed', taskNames: [] };
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

    if (tabValue === 'add') {
      const payload: InsertNotificationTimeline = {
        entityId: entity?.id || 0,
        name: data.name,
        description: data.description,
        triggers,
        channels: enabledChannels,
        isActive: data.isActive
      };
      createTimelineMutation.mutate(payload);
    } else {
      const updates = {
        name: data.name,
        description: data.description,
        triggers,
        channels: enabledChannels,
        isActive: data.isActive
      };
      updateTimelineMutation.mutate({ id: selectedTimelineId, updates });
    }
  };

  const handleClose = () => {
    reset();
    setTriggers([]);
    setEnabledChannels([]);
    setNotificationSettings({});
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
        
        {/* Tabs for Add New vs Update Existing */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
          <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
            <Tab label="ADD NEW" value="add" />
            <Tab label="UPDATE EXISTING" value="update" />
          </Tabs>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ pt: 2 }}>
          {/* Dropdown for selecting existing timeline when updating */}
          {tabValue === 'update' && (
            <Box sx={{ mb: 3 }}>
              <FormControl fullWidth required>
                <FormLabel sx={{ mb: 1 }}>{fieldDefinitions.timeline_name?.label || "Timeline Name"}</FormLabel>
                <Select
                  value={selectedTimelineId}
                  onChange={(e) => setSelectedTimelineId(e.target.value)}
                  displayEmpty
                >
                  <MenuItem value="" disabled>
                    Select existing notification timeline
                  </MenuItem>
                  {existingTimelines?.map((timeline: NotificationTimeline) => (
                    <MenuItem key={timeline.id} value={timeline.id}>
                      {timeline.name.toUpperCase()}
                    </MenuItem>
                  ))}
                </Select>
                {isLoadingTimelines && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Loading timelines...
                    </Typography>
                  </Box>
                )}
              </FormControl>
            </Box>
          )}

          {/* Form fields - always visible in both tabs */}
          <Stack spacing={3}>
            {/* Basic Information Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Basic Information
              </Typography>
              <Stack spacing={2}>
                {/* Show Timeline Name field only in ADD mode, not in UPDATE mode since it's already in dropdown */}
                {tabValue === 'add' && (
                  <Controller
                    name="name"
                    control={control}
                    rules={{ required: 'Timeline name is required' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={fieldDefinitions.timeline_name?.label || "Timeline Name"}
                        fullWidth
                        required
                        error={!!errors.name}
                        helperText={errors.name?.message}
                        placeholder="e.g., Daily Status Update"
                      />
                    )}
                  />
                )}

                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.description?.label || "Description (Optional)"}
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
                  <MenuItem value="sla_threshold_breached">{TRIGGER_TYPE_LABELS.sla_threshold_breached}</MenuItem>
                  <MenuItem value="entity_success">{TRIGGER_TYPE_LABELS.entity_success}</MenuItem>
                  <MenuItem value="entity_failure">{TRIGGER_TYPE_LABELS.entity_failure}</MenuItem>
                  {entity?.type === 'dag' && (
                    <MenuItem value="ai_tasks_status">{TRIGGER_TYPE_LABELS.ai_tasks_status}</MenuItem>
                  )}
                  {entity?.type === 'dag' && (
                    <MenuItem value="regular_tasks_status">{TRIGGER_TYPE_LABELS.regular_tasks_status}</MenuItem>
                  )}
                </Select>
              </Box>

              {triggers.map((trigger, index) => (
                <TriggerConfig
                  key={index}
                  trigger={trigger}
                  onChange={(updatedTrigger) => handleUpdateTrigger(index, updatedTrigger)}
                  onRemove={() => handleRemoveTrigger(index)}
                  availableAiTasks={availableAiTasks}
                  availableRegularTasks={availableRegularTasks}
                  entityType={entity?.type as 'table' | 'dag' || 'dag'}
                />
              ))}
            </Box>

            <Divider />

            {/* Notification Channels Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Notification Channels
              </Typography>
              <NotificationConfigManager
                value={enabledChannels}
                onChange={(channels: string[], settings: NotificationSettings) => {
                  setEnabledChannels(channels);
                  setNotificationSettings(settings);
                }}
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
            disabled={createTimelineMutation.isPending || updateTimelineMutation.isPending}
            startIcon={(createTimelineMutation.isPending || updateTimelineMutation.isPending) ? <CircularProgress size={20} /> : null}
          >
            {tabValue === 'add' 
              ? (createTimelineMutation.isPending ? 'Creating...' : 'Create Timeline')
              : (updateTimelineMutation.isPending ? 'Updating...' : 'Update Timeline')
            }
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default NotificationTimelineModal;