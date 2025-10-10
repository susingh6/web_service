/**
 * PagerDuty notification configuration component
 * Follows exact same pattern as Email/Slack with React Query and cache invalidation
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Users, Key, Eye, EyeOff } from 'lucide-react';
import { PagerDutyNotificationConfig, SystemUser } from '@/lib/notifications/types';
import { useQuery } from '@tanstack/react-query';

interface PagerDutyConfigProps {
  config: PagerDutyNotificationConfig;
  onChange: (config: PagerDutyNotificationConfig) => void;
  teamName?: string;
  tenantName?: string;
  teamPagerDutyKeys?: string[];
}

export function PagerDutyNotificationConfigComponent({ config, onChange, teamName, tenantName, teamPagerDutyKeys = [] }: PagerDutyConfigProps) {
  // Use React Query for data fetching - exact same pattern as Email/Slack
  const { data: users = [], isLoading: usersLoading } = useQuery<SystemUser[]>({ queryKey: ['/api/users'] });
  const { data: allTeamsData = [], isLoading: teamsLoading } = useQuery<any[]>({ queryKey: ['/api/teams'] });
  
  // CRITICAL: Fetch team members for the current team to get individual member PagerDuty services (tenant-aware)
  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery({
    queryKey: tenantName ? [`/api/get_team_members/${tenantName}/${teamName}`] : [`/api/get_team_members/${teamName}`],
    queryFn: async () => {
      if (!teamName) return [];
      // Use the correct API client method
      const { apiClient } = await import('@/config/api');
      const response = await apiClient.teams.getMembers(teamName, tenantName);
      return response.json();
    },
    enabled: !!teamName,
    staleTime: 30 * 1000, // 30 seconds
  });
  
  const [customServiceKeyInput, setCustomServiceKeyInput] = useState('');
  const [customServiceKeys, setCustomServiceKeys] = useState<string[]>([]);
  const [selectedTeamPagerDuty, setSelectedTeamPagerDuty] = useState<string[]>([]);
  const [serviceKeyError, setServiceKeyError] = useState('');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  const [showServiceKey, setShowServiceKey] = useState(false);
  
  // Loading state - exact same pattern as Email/Slack
  const isLoading = usersLoading || teamsLoading || teamMembersLoading;
  
  // CRITICAL: Get team member PagerDuty services from dedicated team members endpoint
  const teamMemberPagerDutyServices = useMemo(() => {
    const services = [...teamPagerDutyKeys]; // Start with team-level PagerDuty keys
    
    // Add individual team member PagerDuty services
    teamMembers.forEach((member: any) => {
      // Check for user_pagerduty field (array of PagerDuty service keys)
      if (member.user_pagerduty && Array.isArray(member.user_pagerduty)) {
        member.user_pagerduty.forEach((service: string) => {
          if (service && !services.includes(service)) {
            services.push(service);
          }
        });
      }
      // Also check for pagerduty field (single service key or array)
      if (member.pagerduty) {
        const serviceKeys = Array.isArray(member.pagerduty) ? member.pagerduty : [member.pagerduty];
        serviceKeys.forEach((service: string) => {
          if (service && !services.includes(service)) {
            services.push(service);
          }
        });
      }
    });
    
    return services;
  }, [teamPagerDutyKeys, teamMembers]);

  useEffect(() => {
    // Update config with selected services - exact same pattern as Email/Slack
    const allSelectedServices = [...selectedTeamPagerDuty, ...customServiceKeys];
    const updatedConfig = {
      ...config,
      serviceKey: allSelectedServices.join(','), // Store as comma-separated string
    };
    onChange(updatedConfig);
  }, [selectedTeamPagerDuty, customServiceKeys]);

  const validateServiceKey = (key: string): boolean => {
    // Basic validation - PagerDuty integration keys are typically 32 alphanumeric characters
    return key.length >= 10 && /^[a-zA-Z0-9]+$/.test(key);
  };

  const handleAddCustomServiceKey = () => {
    const serviceKey = customServiceKeyInput.trim();
    
    if (!serviceKey) {
      setServiceKeyError('Please enter a service key');
      return;
    }
    
    if (!validateServiceKey(serviceKey)) {
      setServiceKeyError('Service key should be at least 10 alphanumeric characters');
      return;
    }
    
    if (customServiceKeys.includes(serviceKey)) {
      setServiceKeyError('This service key is already added');
      return;
    }

    setCustomServiceKeys([...customServiceKeys, serviceKey]);
    setCustomServiceKeyInput('');
    setServiceKeyError('');
  };

  const handleRemoveCustomServiceKey = (keyToRemove: string) => {
    setCustomServiceKeys(customServiceKeys.filter(key => key !== keyToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomServiceKey();
    }
  };

  return (
    <div className="space-y-4">
      {/* Team Members PagerDuty Services */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members ({teamName || 'Default'})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Show team PagerDuty services dropdown if available - exact same pattern as Email/Slack */}
          {teamMemberPagerDutyServices.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Team PagerDuty Services</Label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-md"
                value={selectedDropdownValue}
                onChange={(e) => {
                  const service = e.target.value;
                  if (service && !selectedTeamPagerDuty.includes(service)) {
                    setSelectedTeamPagerDuty([...selectedTeamPagerDuty, service]);
                  }
                  setSelectedDropdownValue(''); // Reset selection
                }}
              >
                <option value="" disabled>Select a team PagerDuty service</option>
                {teamMemberPagerDutyServices.map((service, index) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Display selected TEAM PagerDuty services - exact same pattern as Email/Slack */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Selected team services</Label>
            <div className="flex flex-wrap gap-2">
              {selectedTeamPagerDuty.map((service, index) => (
                <Badge key={`team-${index}`} variant="secondary" className="text-xs">
                  {service}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setSelectedTeamPagerDuty(selectedTeamPagerDuty.filter(s => s !== service))}
                    data-testid={`remove-team-pagerduty-${service}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
              {selectedTeamPagerDuty.length === 0 && (
                <p className="text-sm text-muted-foreground">No team services selected. Use the dropdown above to select team PagerDuty services.</p>
              )}
            </div>
          </div>

          {teamMemberPagerDutyServices.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">
              No team PagerDuty services configured. Add services in team settings or use custom service keys below.
            </p>
          )}

          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading team PagerDuty services...</p>
          )}
        </CardContent>
      </Card>

      {/* Custom Service Keys */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="h-4 w-4" />
            Custom Service Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Enter custom service key
            </Label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  type={showServiceKey ? "text" : "password"}
                  placeholder="Enter PagerDuty service integration key"
                  value={customServiceKeyInput}
                  onChange={(e) => {
                    setCustomServiceKeyInput(e.target.value);
                    setServiceKeyError('');
                  }}
                  onKeyPress={handleKeyPress}
                  className={`pr-10 ${serviceKeyError ? 'border-red-500' : ''}`}
                  data-testid="input-custom-pagerduty-key"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowServiceKey(!showServiceKey)}
                  data-testid="toggle-service-key-visibility"
                >
                  {showServiceKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <Button 
                onClick={handleAddCustomServiceKey} 
                size="sm"
                data-testid="button-add-custom-pagerduty-key"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {serviceKeyError && (
              <p className="text-sm text-red-500">{serviceKeyError}</p>
            )}
          </div>

          {/* Custom service keys display */}
          {customServiceKeys.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Custom Service Keys</Label>
              <div className="space-y-2">
                {customServiceKeys.map((serviceKey, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm font-mono">
                      {serviceKey.substring(0, 8)}...{serviceKey.substring(serviceKey.length - 4)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCustomServiceKey(serviceKey)}
                      className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      data-testid={`remove-custom-pagerduty-key-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup Requirements */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
        <h4 className="text-sm font-medium text-orange-900 mb-2">Setup Requirements</h4>
        <ul className="text-sm text-orange-800 space-y-1">
          <li>• Create a service in your PagerDuty account</li>
          <li>• Generate an integration key for the service</li>
          <li>• Escalation policies are configured in PagerDuty</li>
          <li>• Test the integration before going live</li>
        </ul>
      </div>

      {/* Success message */}
      {(selectedTeamPagerDuty.length > 0 || customServiceKeys.length > 0) && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-800">
            Incidents will be created in PagerDuty when SLA violations occur
          </p>
        </div>
      )}
    </div>
  );
}