import React, { useState } from 'react';
import { Button, CircularProgress, Badge, Tooltip } from '@mui/material';
import { Notifications as Bell, NotificationsOff as BellOff, People } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

interface SubscribeButtonProps {
  notificationTimelineId: string;
  timelineName: string;
  tenantId: number;
  teamId: number;
  size?: 'small' | 'medium' | 'large';
  variant?: 'contained' | 'outlined' | 'text';
  showSubscriberCount?: boolean;
}

export const SubscribeButton: React.FC<SubscribeButtonProps> = ({
  notificationTimelineId,
  timelineName,
  tenantId,
  teamId,
  size = 'small',
  variant = 'outlined',
  showSubscriberCount = true
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Check if user is subscribed
  const { data: userSubscriptions = [], isLoading: isLoadingSubscriptions } = useQuery({
    queryKey: ['/api/me/subscriptions'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/me/subscriptions');
      return response.json();
    },
    enabled: !!user?.id,
  });

  // Get subscription count for this timeline
  const { data: timelineSubscriptionData, isLoading: isLoadingCount } = useQuery({
    queryKey: [`/api/notification-timelines/${notificationTimelineId}/subscriptions`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/notification-timelines/${notificationTimelineId}/subscriptions`);
      return response.json();
    },
  });

  const isSubscribed = userSubscriptions.some(
    (sub: any) => sub.notificationTimelineId === notificationTimelineId && sub.isActive
  );

  const subscriberCount = timelineSubscriptionData?.count || 0;

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/subscriptions', {
        notificationTimelineId,
        tenantId,
        teamId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Subscribed',
        description: `You will now receive notifications for "${timelineName}"`,
      });
      // Invalidate cache to refresh subscription status
      queryClient.invalidateQueries({ queryKey: ['/api/me/subscriptions'] });
      queryClient.invalidateQueries({ queryKey: [`/api/notification-timelines/${notificationTimelineId}/subscriptions`] });
    },
    onError: (error: any) => {
      console.error('Subscribe error:', error);
      toast({
        title: 'Error',
        description: 'Failed to subscribe to notifications',
        variant: 'destructive',
      });
    },
  });

  // Unsubscribe mutation
  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/subscriptions/${notificationTimelineId}`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: 'Unsubscribed',
        description: `You will no longer receive notifications for "${timelineName}"`,
      });
      // Invalidate cache to refresh subscription status
      queryClient.invalidateQueries({ queryKey: ['/api/me/subscriptions'] });
      queryClient.invalidateQueries({ queryKey: [`/api/notification-timelines/${notificationTimelineId}/subscriptions`] });
    },
    onError: (error: any) => {
      console.error('Unsubscribe error:', error);
      toast({
        title: 'Error',
        description: 'Failed to unsubscribe from notifications',
        variant: 'destructive',
      });
    },
  });

  const handleToggleSubscription = () => {
    if (isSubscribed) {
      unsubscribeMutation.mutate();
    } else {
      subscribeMutation.mutate();
    }
  };

  const isLoading = subscribeMutation.isPending || unsubscribeMutation.isPending || isLoadingSubscriptions;

  const buttonContent = (
    <Button
      size={size}
      variant={variant}
      color={isSubscribed ? 'secondary' : 'primary'}
      onClick={handleToggleSubscription}
      disabled={isLoading || !user?.id}
      startIcon={
        isLoading ? (
          <CircularProgress size={16} />
        ) : isSubscribed ? (
          <BellOff />
        ) : (
          <Bell />
        )
      }
      data-testid={`subscribe-button-${notificationTimelineId}`}
      sx={{
        minWidth: 'auto',
        ...(showSubscriberCount && {
          minWidth: '120px',
        }),
      }}
    >
      {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
      {showSubscriberCount && !isLoadingCount && (
        <Badge
          badgeContent={subscriberCount}
          color="info"
          sx={{ ml: 1 }}
          data-testid={`subscriber-count-${notificationTimelineId}`}
        >
          <People fontSize="small" />
        </Badge>
      )}
    </Button>
  );

  if (!user?.id) {
    return (
      <Tooltip title="You must be logged in to subscribe to notifications">
        {buttonContent}
      </Tooltip>
    );
  }

  return buttonContent;
};

export default SubscribeButton;