import React, { useState } from 'react';
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
  Alert,
  Tooltip,
  Collapse,
  IconButton
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Entity } from '@shared/schema';
import { SubscribeButton } from './SubscribeButton';
import { TRIGGER_TYPE_LABELS, DailyScheduleTrigger, NotificationTrigger } from '@/lib/notifications/timelineTypes';

interface Subscriber {
  id: number;
  userId: number;
  email: string;
  slackHandles: string[];
  createdAt: string;
}

interface NotificationTimeline {
  id: string;
  entityId: number;
  name: string;
  description?: string;
  triggers: NotificationTrigger[];
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
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());

  // Fetch notification timelines for this entity
  const { data: timelines = [], isLoading, error } = useQuery<NotificationTimeline[]>({
    queryKey: [`/api/entities/${entity.type}/${entity.name}/notification-timelines`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/entities/${entity.type}/${entity.name}/notification-timelines?teamName=${encodeURIComponent(entity.team_name || '')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notification timelines');
      }
      return response.json();
    },
  });

  // Fetch subscribers for each timeline
  const subscribersQueries = timelines.map(timeline => 
    useQuery<{ count: number; subscriptions: Subscriber[] }>({
      queryKey: [`/api/notification-timelines/${timeline.id}/subscriptions`],
      queryFn: async () => {
        const response = await apiRequest('GET', `/api/notification-timelines/${timeline.id}/subscriptions`);
        if (!response.ok) throw new Error('Failed to fetch subscribers');
        return response.json();
      },
      enabled: !!timeline.id,
    })
  );

  const toggleExpanded = (timelineId: string) => {
    setExpandedTimelines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(timelineId)) {
        newSet.delete(timelineId);
      } else {
        newSet.add(timelineId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <Box>
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

  const formatTriggerTypes = (triggers: NotificationTrigger[]) => {
    if (!triggers || triggers.length === 0) return 'No triggers';
    
    return triggers.map(trigger => {
      const label = TRIGGER_TYPE_LABELS[trigger.type as keyof typeof TRIGGER_TYPE_LABELS] || trigger.type;
      
      // For daily schedule triggers, show the time
      if (trigger.type === 'daily_schedule') {
        const dailyTrigger = trigger as DailyScheduleTrigger;
        const time = dailyTrigger.time || 'Not set';
        return `${label} at ${time}`;
      }
      
      return label;
    }).join(', ');
  };

  const formatChannels = (channels: string[]) => {
    if (!channels || channels.length === 0) return [];
    
    return channels.map(channel => ({
      label: channel.charAt(0).toUpperCase() + channel.slice(1),
      color: channel === 'email' ? 'primary' : channel === 'slack' ? 'secondary' : 'default'
    }));
  };

  const formatSubscribers = (subscribers: Subscriber[]) => {
    if (!subscribers || subscribers.length === 0) return '0 subscribers';
    
    return subscribers.map(sub => {
      const slackText = sub.slackHandles.length > 0 ? ` (${sub.slackHandles.join(', ')})` : '';
      return `${sub.email}${slackText}`;
    }).join('\n');
  };

  return (
    <Box>
      <Box sx={{ maxHeight, overflowY: 'auto' }}>
        <List disablePadding>
          {timelines.map((timeline, index) => {
            const subscriberData = subscribersQueries[index]?.data;
            const subscriberCount = subscriberData?.count || 0;
            const subscribers = subscriberData?.subscriptions || [];
            const isExpanded = expandedTimelines.has(timeline.id);

            return (
              <React.Fragment key={timeline.id}>
                <ListItem
                  alignItems="flex-start"
                  sx={{
                    px: 2,
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
                        
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
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

                        {/* Subscriber count and list */}
                        <Box sx={{ mt: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              <strong>{subscriberCount} subscriber{subscriberCount !== 1 ? 's' : ''}</strong>
                            </Typography>
                            {subscriberCount > 0 && (
                              <IconButton
                                size="small"
                                onClick={() => toggleExpanded(timeline.id)}
                                data-testid={`expand-subscribers-${timeline.id}`}
                              >
                                {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                              </IconButton>
                            )}
                          </Box>
                          
                          <Collapse in={isExpanded && subscriberCount > 0}>
                            <Box sx={{ mt: 1, pl: 2, borderLeft: 2, borderColor: 'divider' }}>
                              {subscribers.map((subscriber, idx) => (
                                <Typography 
                                  key={idx} 
                                  variant="caption" 
                                  display="block" 
                                  color="text.secondary"
                                  sx={{ mb: 0.5 }}
                                >
                                  • {subscriber.email}
                                  {subscriber.slackHandles.length > 0 && (
                                    <span style={{ color: '#1976d2', marginLeft: 4 }}>
                                      ({subscriber.slackHandles.join(', ')})
                                    </span>
                                  )}
                                </Typography>
                              ))}
                            </Box>
                          </Collapse>
                        </Box>
                      </Box>
                    }
                  />
                  
                  <ListItemSecondaryAction>
                    {timeline.isActive && (
                      <SubscribeButton
                        notificationTimelineId={timeline.id}
                        timelineName={timeline.name}
                        tenantId={entity.teamId}
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
            );
          })}
        </List>
      </Box>
    </Box>
  );
};

export default NotificationTimelinesList;
