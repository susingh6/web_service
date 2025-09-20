/**
 * Main notification configuration manager
 * Orchestrates different notification channel configurations
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Bell } from 'lucide-react';
import { 
  NotificationSettings, 
  EmailNotificationConfig, 
  SlackNotificationConfig, 
  PagerDutyNotificationConfig,
  NOTIFICATION_CHANNELS 
} from '@/lib/notifications/types';
import { EmailNotificationConfigComponent } from './EmailNotificationConfig';
import { SlackNotificationConfigComponent } from './SlackNotificationConfig';
import { PagerDutyNotificationConfigComponent } from './PagerDutyNotificationConfig';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/config/api';

interface NotificationConfigManagerProps {
  value: string[]; // Array of enabled notification types from form
  onChange: (enabledTypes: string[], settings: NotificationSettings) => void;
  teamName?: string;
}

interface TeamData {
  team_email: string[];
  team_slack: string[];
  team_pagerduty: string[];
}

export function NotificationConfigManager({ value, onChange, teamName }: NotificationConfigManagerProps) {
  const [enabledChannels, setEnabledChannels] = useState<string[]>(value || []);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({});
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());

  // Fetch team data to get team notification settings
  const { data: teamData } = useQuery<TeamData>({
    queryKey: ['team-notification-settings', teamName],
    queryFn: async () => {
      if (!teamName) return { team_email: [], team_slack: [], team_pagerduty: [] };
      const response = await apiClient.teams.getDetails(teamName);
      const team = await response.json();
      
      // Combine team emails with individual member emails
      const teamEmails = team.team_email || [];
      const memberEmails = team.members ? team.members.map((member: any) => member.email).filter(Boolean) : [];
      const allEmails = [...teamEmails, ...memberEmails];
      
      return {
        team_email: allEmails,
        team_slack: team.team_slack || [],
        team_pagerduty: team.team_pagerduty || [],
      };
    },
    enabled: !!teamName,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    // Initialize settings for enabled channels
    const initialSettings: NotificationSettings = {};
    enabledChannels.forEach(channel => {
      if (channel === 'email' && !notificationSettings.email) {
        initialSettings.email = {
          type: 'email',
          enabled: true,
          defaultRecipients: [],
          roleBasedRecipients: [],
          customEmails: [],
        };
      } else if (channel === 'slack' && !notificationSettings.slack) {
        initialSettings.slack = {
          type: 'slack',
          enabled: true,
          channelName: '',
        };
      } else if (channel === 'pagerduty' && !notificationSettings.pagerduty) {
        initialSettings.pagerduty = {
          type: 'pagerduty',
          enabled: true,
          serviceKey: '',
        };
      }
    });

    if (Object.keys(initialSettings).length > 0) {
      setNotificationSettings(prev => ({ ...prev, ...initialSettings }));
    }
  }, [enabledChannels]);

  const handleChannelToggle = (channelType: string, enabled: boolean) => {
    const updatedChannels = enabled 
      ? [...enabledChannels, channelType]
      : enabledChannels.filter(c => c !== channelType);
    
    setEnabledChannels(updatedChannels);
    
    // Auto-expand when enabled
    if (enabled) {
      setExpandedChannels(prev => {
        const newSet = new Set(prev);
        newSet.add(channelType);
        return newSet;
      });
    } else {
      setExpandedChannels(prev => {
        const newSet = new Set(prev);
        newSet.delete(channelType);
        return newSet;
      });
    }

    // Update parent component
    onChange(updatedChannels, notificationSettings);
  };

  const handleChannelConfigChange = (channelType: string, config: any) => {
    const updatedSettings = {
      ...notificationSettings,
      [channelType]: config,
    };
    setNotificationSettings(updatedSettings);
    onChange(enabledChannels, updatedSettings);
  };

  const toggleChannelExpansion = (channelType: string) => {
    setExpandedChannels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(channelType)) {
        newSet.delete(channelType);
      } else {
        newSet.add(channelType);
      }
      return newSet;
    });
  };

  const renderChannelConfig = (channelType: string) => {
    switch (channelType) {
      case 'email':
        return (
          <EmailNotificationConfigComponent
            config={notificationSettings.email as EmailNotificationConfig || { roleBasedRecipients: [], customEmails: [] }}
            onChange={(config) => handleChannelConfigChange('email', config)}
            teamName={teamName}
            teamEmails={teamData?.team_email || []}
          />
        );
      case 'slack':
        return (
          <SlackNotificationConfigComponent
            config={notificationSettings.slack as SlackNotificationConfig || { channelName: '' }}
            onChange={(config) => handleChannelConfigChange('slack', config)}
            teamName={teamName}
            teamSlackChannels={teamData?.team_slack || []}
          />
        );
      case 'pagerduty':
        return (
          <PagerDutyNotificationConfigComponent
            config={notificationSettings.pagerduty as PagerDutyNotificationConfig || { serviceKey: '' }}
            onChange={(config) => handleChannelConfigChange('pagerduty', config)}
            teamName={teamName}
            teamPagerDutyKeys={teamData?.team_pagerduty || []}
          />
        );
      default:
        return null;
    }
  };

  const getChannelIcon = (iconName: string) => {
    // This could be expanded to dynamically import icons
    switch (iconName) {
      case 'Mail':
        return '📧';
      case 'MessageSquare':
        return '💬';
      case 'AlertTriangle':
        return '🚨';
      default:
        return '📢';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notification Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {NOTIFICATION_CHANNELS.map((channel) => {
          const isEnabled = enabledChannels.includes(channel.type);
          const isExpanded = expandedChannels.has(channel.type);

          return (
            <div key={channel.type} className="border rounded-lg overflow-hidden">
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id={`notification-${channel.type}`}
                      checked={isEnabled}
                      onChange={(e) => handleChannelToggle(channel.type, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Label 
                      htmlFor={`notification-${channel.type}`}
                      className="flex items-center space-x-2 cursor-pointer"
                    >
                      <span className="text-lg">{getChannelIcon(channel.icon)}</span>
                      <div>
                        <div className="font-medium">{channel.name}</div>
                        <div className="text-xs text-muted-foreground">{channel.description}</div>
                      </div>
                    </Label>
                  </div>
                  
                  {isEnabled && (
                    <Collapsible 
                      open={isExpanded} 
                      onOpenChange={() => toggleChannelExpansion(channel.type)}
                    >
                      <CollapsibleTrigger className="p-1 hover:bg-gray-100 rounded">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </CollapsibleTrigger>
                    </Collapsible>
                  )}
                </div>
              </div>

              {isEnabled && (
                <Collapsible 
                  open={isExpanded} 
                  onOpenChange={() => toggleChannelExpansion(channel.type)}
                >
                  <CollapsibleContent>
                    <div className="border-t bg-gray-50 p-4">
                      {renderChannelConfig(channel.type)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          );
        })}

        {enabledChannels.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Select notification channels to configure alert settings</p>
          </div>
        )}

        {enabledChannels.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Configuration saved locally.</strong> These settings will be stored when you save the entity.
              Actual notification delivery will be configured separately in the SLA Management Notification System Administration.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}