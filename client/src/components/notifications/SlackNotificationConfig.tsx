/**
 * Slack notification configuration component
 * Handles channel name validation and setup
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MessageSquare, Hash, AlertCircle } from 'lucide-react';
import { SlackNotificationConfig } from '@/lib/notifications/types';
import { validateSlackChannel } from '@/lib/notifications/types';

interface SlackConfigProps {
  config: SlackNotificationConfig;
  onChange: (config: SlackNotificationConfig) => void;
}

export function SlackNotificationConfigComponent({ config, onChange }: SlackConfigProps) {
  const [channelName, setChannelName] = useState(config?.channelName || '');
  const [channelError, setChannelError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    // Update parent config when channel name changes
    if (channelName !== config?.channelName) {
      const updatedConfig = {
        ...(config || {}),
        channelName: channelName,
      };
      onChange(updatedConfig);
    }
  }, [channelName, config, onChange]);

  const handleChannelNameChange = (value: string) => {
    setChannelName(value);
    setChannelError('');

    // Real-time validation
    if (value && !validateSlackChannel(value)) {
      setChannelError('Channel name must contain only lowercase letters, numbers, hyphens, and underscores');
    }
  };

  const normalizeChannelName = (name: string): string => {
    // Add # prefix if not present
    return name.startsWith('#') ? name : `#${name}`;
  };

  const validateChannelExists = async (channelName: string) => {
    setIsValidating(true);
    try {
      // This would be implemented when Slack integration is added
      // const response = await fetch(`/api/slack/validate-channel?channel=${encodeURIComponent(channelName)}`);
      // if (!response.ok) {
      //   setChannelError('Channel not found or bot not invited to channel');
      // }
      
      // For now, just validate format
      if (!validateSlackChannel(channelName)) {
        setChannelError('Invalid channel name format');
      }
    } catch (error) {
      setChannelError('Unable to validate channel. Please check your Slack integration.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleBlur = () => {
    if (channelName) {
      const normalizedName = normalizeChannelName(channelName);
      setChannelName(normalizedName);
      validateChannelExists(normalizedName);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Slack Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="slack-channel" className="text-sm">
            Channel Name <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              <Hash className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              id="slack-channel"
              type="text"
              placeholder="general"
              value={channelName.startsWith('#') ? channelName.substring(1) : channelName}
              onChange={(e) => handleChannelNameChange(e.target.value)}
              onBlur={handleBlur}
              className="pl-10"
              disabled={isValidating}
            />
          </div>
          
          {channelError && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {channelError}
            </div>
          )}
          
          {isValidating && (
            <p className="text-sm text-muted-foreground">Validating channel...</p>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Setup Requirements</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Ensure the SLA Monitor bot is added to your Slack workspace</li>
            <li>• Invite the bot to the specified channel</li>
            <li>• Channel names must be lowercase with no spaces</li>
          </ul>
        </div>

        {channelName && !channelError && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              Notifications will be sent to: <code className="bg-green-100 px-1 rounded">{normalizeChannelName(channelName)}</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}