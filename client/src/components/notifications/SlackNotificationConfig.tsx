/**
 * Slack notification configuration component
 * Handles channel name validation and setup
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Hash, AlertCircle, ChevronDown, X, Plus, Users } from 'lucide-react';
import { SlackNotificationConfig, SystemUser } from '@/lib/notifications/types';
import { validateSlackChannel } from '@/lib/notifications/types';
import { useQuery } from '@tanstack/react-query';

interface SlackConfigProps {
  config: SlackNotificationConfig;
  onChange: (config: SlackNotificationConfig) => void;
  teamName?: string;
  teamSlackChannels?: string[];
}

export function SlackNotificationConfigComponent({ config, onChange, teamName, teamSlackChannels = [] }: SlackConfigProps) {
  // Use React Query for data fetching - same pattern as EmailNotificationConfig
  const { data: users = [], isLoading: usersLoading } = useQuery<SystemUser[]>({ queryKey: ['/api/users'] });
  const { data: allTeamsData = [], isLoading: teamsLoading } = useQuery<any[]>({ queryKey: ['/api/teams'] });
  
  const [channelName, setChannelName] = useState(config?.channelName || '');
  const [channelError, setChannelError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [customChannelInput, setCustomChannelInput] = useState('');
  const [customChannels, setCustomChannels] = useState<string[]>(config?.customChannels || []);
  const [selectedTeamSlacks, setSelectedTeamSlacks] = useState<string[]>([]);
  const [selectedOtherSlacks, setSelectedOtherSlacks] = useState<string[]>([]);
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  
  // Compute other team Slack handles from React Query data
  const otherTeamSlacks = useMemo(() => {
    const allOtherSlacks: string[] = [];
    
    // Add ALL team Slack channels from OTHER teams
    allTeamsData.forEach((team: any) => {
      if (team.name !== teamName && team.team_slack) {
        allOtherSlacks.push(...team.team_slack);
      }
    });
    
    // Add ALL user Slack handles not in current team
    users.forEach((user: SystemUser) => {
      if (user.user_slack && Array.isArray(user.user_slack) && !teamSlackChannels.some(channel => user.user_slack?.includes(channel))) {
        allOtherSlacks.push(...user.user_slack);
      }
    });
    
    // Remove duplicates
    return Array.from(new Set(allOtherSlacks));
  }, [allTeamsData, users, teamName, teamSlackChannels]);
  
  // Loading state
  const isLoading = usersLoading || teamsLoading;
  
  // Get team member Slack handles
  const teamMemberSlacks = useMemo(() => {
    const slacks: string[] = [];
    users.forEach((user: SystemUser) => {
      if (user.team === teamName && user.user_slack && Array.isArray(user.user_slack)) {
        slacks.push(...user.user_slack);
      }
    });
    return Array.from(new Set([...teamSlackChannels, ...slacks]));
  }, [users, teamName, teamSlackChannels]);

  useEffect(() => {
    // Update config with all selected Slack channels
    const allSelectedChannels = [...selectedTeamSlacks, ...selectedOtherSlacks, ...customChannels];
    const updatedConfig = {
      ...config,
      channelName: channelName,
      defaultRecipients: allSelectedChannels,
      customChannels: customChannels,
    };
    onChange(updatedConfig);
  }, [selectedTeamSlacks, selectedOtherSlacks, customChannels, channelName]);
  
  const handleAddCustomChannel = () => {
    const channel = customChannelInput.trim();
    
    if (!channel) {
      setChannelError('Please enter a channel name');
      return;
    }
    
    if (!validateSlackChannel(channel)) {
      setChannelError('Channel name must contain only lowercase letters, numbers, hyphens, and underscores');
      return;
    }
    
    const normalizedChannel = channel.startsWith('#') ? channel : `#${channel}`;
    
    if (customChannels.includes(normalizedChannel)) {
      setChannelError('This channel is already added');
      return;
    }

    setCustomChannels([...customChannels, normalizedChannel]);
    setCustomChannelInput('');
    setChannelError('');
  };

  const handleRemoveCustomChannel = (channelToRemove: string) => {
    setCustomChannels(customChannels.filter(channel => channel !== channelToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomChannel();
    }
  };

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
    <div className="space-y-4">
      {/* Team Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members ({teamName || 'Default'})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Show team Slack channels/handles dropdown if available */}
          {teamMemberSlacks.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Team Slack Channels & Handles</Label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-md"
                value={selectedDropdownValue}
                onChange={(e) => {
                  const slack = e.target.value;
                  if (slack && !selectedTeamSlacks.includes(slack)) {
                    setSelectedTeamSlacks([...selectedTeamSlacks, slack]);
                  }
                  setSelectedDropdownValue(''); // Reset selection
                }}
              >
                <option value="" disabled>Select a team Slack channel or handle</option>
                {teamMemberSlacks.map((slack, index) => (
                  <option key={slack} value={slack}>
                    {slack}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Display selected TEAM Slack channels */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Selected team Slack channels</Label>
            <div className="flex flex-wrap gap-2">
              {selectedTeamSlacks.map((slack, index) => (
                <Badge key={`team-${index}`} variant="secondary" className="text-xs">
                  {slack}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setSelectedTeamSlacks(selectedTeamSlacks.filter(s => s !== slack))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
              {selectedTeamSlacks.length === 0 && (
                <p className="text-sm text-muted-foreground">No team Slack channels selected. Use the dropdown above to select team channels.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Recipients */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Additional Recipients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Other Team Slack channels and System Users - Multi-Select with Slider */}
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading additional recipients...</div>
          ) : (otherTeamSlacks.length > 0 || users.length > 0) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Other Team & System User Slack Channels</Label>
              <div className="border border-gray-300 rounded-md p-2 max-h-48 overflow-y-auto bg-white">
                <div className="space-y-1">
                  {/* Other team Slack channels */}
                  {otherTeamSlacks.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1 sticky top-0 bg-white py-1">Other Teams</div>
                      {otherTeamSlacks.map((slack, index) => (
                        <label key={`other-team-${index}`} className="flex items-center space-x-2 p-1 hover:bg-gray-50 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={selectedOtherSlacks.includes(slack)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOtherSlacks([...selectedOtherSlacks, slack]);
                              } else {
                                setSelectedOtherSlacks(selectedOtherSlacks.filter(s => s !== slack));
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm">{slack}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {/* System user Slack handles */}
                  {users.length > 0 && (
                    <div className={otherTeamSlacks.length > 0 ? "mt-3 pt-3 border-t border-gray-200" : ""}>
                      <div className="text-xs font-medium text-gray-600 mb-1 sticky top-0 bg-white py-1">System Users</div>
                      {users
                        .filter(user => user.user_slack && Array.isArray(user.user_slack) && user.team !== teamName)
                        .map((user) => (
                          user.user_slack?.map((slack) => (
                            <label key={`${user.id}-${slack}`} className="flex items-center space-x-2 p-1 hover:bg-gray-50 cursor-pointer rounded">
                              <input
                                type="checkbox"
                                checked={selectedOtherSlacks.includes(slack)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedOtherSlacks([...selectedOtherSlacks, slack]);
                                  } else {
                                    setSelectedOtherSlacks(selectedOtherSlacks.filter(s => s !== slack));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm">{slack}</span>
                              {(user.displayName || user.username) && (
                                <span className="text-xs text-gray-500">({user.displayName || user.username})</span>
                              )}
                            </label>
                          ))
                        ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Select All / Clear All buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allAvailableSlacks = [
                      ...otherTeamSlacks,
                      ...users
                        .filter(user => user.user_slack && Array.isArray(user.user_slack) && user.team !== teamName)
                        .flatMap(user => user.user_slack || [])
                    ];
                    setSelectedOtherSlacks(Array.from(new Set([...selectedOtherSlacks, ...allAvailableSlacks])));
                  }}
                  className="text-xs"
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOtherSlacks([])}
                  className="text-xs"
                >
                  Clear All
                </Button>
              </div>
            </div>
          )}
          
          {/* Display selected OTHER Slack channels */}
          {selectedOtherSlacks.length > 0 && (
            <div className="space-y-1 mt-3">
              <Label className="text-xs text-muted-foreground">Selected additional recipients</Label>
              <div className="flex flex-wrap gap-2">
                {selectedOtherSlacks.map((slack, index) => (
                  <Badge key={`other-${index}`} variant="outline" className="text-xs">
                    {slack}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1"
                      onClick={() => setSelectedOtherSlacks(selectedOtherSlacks.filter(s => s !== slack))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Slack Channels */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Custom Slack Channels
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            * Use for external Slack channels or custom notifications
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                <Hash className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                type="text"
                placeholder="general"
                value={customChannelInput}
                onChange={(e) => {
                  setCustomChannelInput(e.target.value);
                  setChannelError('');
                }}
                onKeyPress={handleKeyPress}
                className="h-8 pl-10"
              />
            </div>
            <Button 
              type="button" 
              onClick={handleAddCustomChannel}
              size="sm"
              className="h-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {channelError && (
            <p className="text-sm text-red-500">{channelError}</p>
          )}
          
          {/* Display custom channels */}
          {customChannels.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Custom channels added</Label>
              <div className="flex flex-wrap gap-2">
                {customChannels.map((channel, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {channel}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1"
                      onClick={() => handleRemoveCustomChannel(channel)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Setup Requirements</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Ensure the SLA Monitor bot is added to your Slack workspace</li>
              <li>• Invite the bot to the specified channel</li>
              <li>• Channel names must be lowercase with no spaces</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}