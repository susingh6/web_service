import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, Mail, MessageSquare, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Entity } from '@shared/schema';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: Entity | null;
}

interface SubscriptionData {
  entityId: number;
  notificationTypes: string[];
  channels: string[];
  frequency: string;
  customHours: number | null;
}

const NOTIFICATION_TYPES = [
  { id: 'sla_passed', label: 'SLA Passed', description: 'When SLA target is met or exceeded', color: 'bg-green-500' },
  { id: 'sla_failed', label: 'SLA Failed', description: 'When SLA target is not met', color: 'bg-red-500' },
  { id: 'sla_at_risk', label: 'SLA At Risk', description: 'When SLA is approaching failure threshold', color: 'bg-yellow-500' },
  { id: 'entity_updated', label: 'Entity Updated', description: 'When entity configuration changes', color: 'bg-blue-500' },
];

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'slack', label: 'Slack', icon: MessageSquare },
  { id: 'pagerduty', label: 'PagerDuty', icon: AlertTriangle },
];

const FREQUENCY_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'hourly', label: 'Hourly Digest' },
  { value: 'daily', label: 'Daily Digest' },
  { value: 'custom', label: 'Custom Hours' },
];

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  entity,
}) => {
  const [selectedNotificationTypes, setSelectedNotificationTypes] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['email']);
  const [frequency, setFrequency] = useState('immediate');
  const [customHours, setCustomHours] = useState<number>(24);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const subscriptionMutation = useMutation({
    mutationFn: async (data: SubscriptionData) => {
      const response = await apiRequest('POST', '/api/subscriptions', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Subscription Created',
        description: `Successfully subscribed to notifications for ${entity?.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions'] });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Subscription Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setSelectedNotificationTypes([]);
    setSelectedChannels(['email']);
    setFrequency('immediate');
    setCustomHours(24);
    onClose();
  };

  const handleNotificationTypeChange = (typeId: string, checked: boolean) => {
    if (checked) {
      setSelectedNotificationTypes(prev => [...prev, typeId]);
    } else {
      setSelectedNotificationTypes(prev => prev.filter(id => id !== typeId));
    }
  };

  const handleChannelChange = (channelId: string, checked: boolean) => {
    if (checked) {
      setSelectedChannels(prev => [...prev, channelId]);
    } else {
      setSelectedChannels(prev => prev.filter(id => id !== channelId));
    }
  };

  const handleSubmit = () => {
    if (!entity) return;
    
    if (selectedNotificationTypes.length === 0) {
      toast({
        title: 'Selection Required',
        description: 'Please select at least one notification type',
        variant: 'destructive',
      });
      return;
    }

    if (selectedChannels.length === 0) {
      toast({
        title: 'Selection Required',
        description: 'Please select at least one notification channel',
        variant: 'destructive',
      });
      return;
    }

    const subscriptionData: SubscriptionData = {
      entityId: entity.id,
      notificationTypes: selectedNotificationTypes,
      channels: selectedChannels,
      frequency,
      customHours: frequency === 'custom' ? customHours : null,
    };

    subscriptionMutation.mutate(subscriptionData);
  };

  if (!entity) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Subscribe to Notifications
          </DialogTitle>
          <DialogDescription>
            Set up notification preferences for <strong>{entity.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Entity Information */}
          <div className="bg-muted p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{entity.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {entity.type === 'dag' ? 'DAG' : 'Table'} • {entity.team_name} Team • {entity.tenant_name}
                </p>
              </div>
              <Badge variant={entity.status === 'Passed' ? 'default' : 'destructive'}>
                {entity.status}
              </Badge>
            </div>
          </div>

          {/* Notification Types */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Notification Types</Label>
            <div className="space-y-3">
              {NOTIFICATION_TYPES.map((type) => (
                <div key={type.id} className="flex items-start space-x-3">
                  <Checkbox
                    id={type.id}
                    checked={selectedNotificationTypes.includes(type.id)}
                    onCheckedChange={(checked) => 
                      handleNotificationTypeChange(type.id, checked as boolean)
                    }
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${type.color}`} />
                      <Label htmlFor={type.id} className="font-medium cursor-pointer">
                        {type.label}
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {type.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notification Channels */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Notification Channels</Label>
            <div className="grid grid-cols-3 gap-3">
              {CHANNELS.map((channel) => {
                const Icon = channel.icon;
                return (
                  <div key={channel.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={channel.id}
                      checked={selectedChannels.includes(channel.id)}
                      onCheckedChange={(checked) => 
                        handleChannelChange(channel.id, checked as boolean)
                      }
                    />
                    <Label htmlFor={channel.id} className="flex items-center gap-2 cursor-pointer">
                      <Icon className="h-4 w-4" />
                      {channel.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Frequency */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Notification Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {frequency === 'custom' && (
              <div className="flex items-center gap-2">
                <Label htmlFor="customHours">Every</Label>
                <Input
                  id="customHours"
                  type="number"
                  min={1}
                  max={168}
                  value={customHours}
                  onChange={(e) => setCustomHours(parseInt(e.target.value) || 24)}
                  className="w-20"
                />
                <Label>hours</Label>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={subscriptionMutation.isPending}
            className="min-w-[100px]"
          >
            {subscriptionMutation.isPending ? 'Subscribing...' : 'Subscribe'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};