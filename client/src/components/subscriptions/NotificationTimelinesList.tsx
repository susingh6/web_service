import React from 'react';
import { 
  Box, 
  Typography, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemSecondaryAction,
  Chip,
  Divider,
  Skeleton,
  Alert
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Entity } from '@shared/schema';
import { SubscribeButton } from './SubscribeButton';
import { TRIGGER_TYPE_LABELS } from '@/lib/notifications/timelineTypes';

interface NotificationTimeline {
  id: string;
  entityId: number;
  name: string;
  description?: string;
  triggers: any[];
  channels: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotificationTimelinesListProps {
  entity: Entity;
  maxHeight?: number;
}

export const NotificationTimelinesList: React.FC<NotificationTimelinesListProps> = ({
  entity,
  maxHeight = 400
}) => {
  // Fetch notification timelines for this entity
  const { data: timelines = [], isLoading, error } = useQuery<NotificationTimeline[]>({
    queryKey: [`/api/entities/${entity.id}/notification-timelines`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/entities/${entity.id}/notification-timelines`);
      if (!response.ok) {
        throw new Error('Failed to fetch notification timelines');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Notification Timelines
        </Typography>
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{ mb: 2 }}>
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="text" width="80%" height={20} />
            <Skeleton variant="rectangular" width="100%" height={40} sx={{ mt: 1 }} />
          </Box>
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load notification timelines. Please try again later.
      </Alert>
    );
  }

  if (timelines.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No notification timelines configured for this entity.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Contact your team administrator to set up notifications.
        </Typography>
      </Box>
    );
  }

  const formatTriggerTypes = (triggers: any[]) => {
    if (!triggers || triggers.length === 0) return 'No triggers';
    
    return triggers
      .map(trigger => TRIGGER_TYPE_LABELS[trigger.type as keyof typeof TRIGGER_TYPE_LABELS] || trigger.type)
      .join(', ');
  };

  const formatChannels = (channels: string[]) => {
    if (!channels || channels.length === 0) return [];
    
    return channels.map(channel => ({
      label: channel.charAt(0).toUpperCase() + channel.slice(1),
      color: channel === 'email' ? 'primary' : channel === 'slack' ? 'secondary' : 'default'
    }));
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Notification Timelines
        <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
          ({timelines.length} configured)
        </Typography>
      </Typography>
      
      <Box sx={{ maxHeight, overflowY: 'auto' }}>
        <List disablePadding>
          {timelines.map((timeline, index) => (
            <React.Fragment key={timeline.id}>
              <ListItem
                alignItems="flex-start"
                sx={{
                  px: 0,
                  py: 2,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: timeline.isActive ? 'background.paper' : 'action.disabled',
                  opacity: timeline.isActive ? 1 : 0.6,
                }}
                data-testid={`timeline-item-${timeline.id}`}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {timeline.name}
                      </Typography>
                      {!timeline.isActive && (
                        <Chip size="small" label="Inactive" color="default" />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      {timeline.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {timeline.description}
                        </Typography>
                      )}
                      
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        <strong>Triggers:</strong> {formatTriggerTypes(timeline.triggers)}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {formatChannels(timeline.channels).map((channel, idx) => (
                          <Chip
                            key={idx}
                            size="small"
                            label={channel.label}
                            color={channel.color as any}
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Box>
                  }
                />
                
                <ListItemSecondaryAction>
                  {timeline.isActive && (
                    <SubscribeButton
                      notificationTimelineId={timeline.id}
                      timelineName={timeline.name}
                      tenantId={entity.teamId} // Using teamId as tenantId for now
                      teamId={entity.teamId}
                      size="small"
                      variant="outlined"
                      showSubscriberCount={true}
                    />
                  )}
                </ListItemSecondaryAction>
              </ListItem>
              
              {index < timelines.length - 1 && <Divider sx={{ my: 1 }} />}
            </React.Fragment>
          ))}
        </List>
      </Box>
    </Box>
  );
};

export default NotificationTimelinesList;