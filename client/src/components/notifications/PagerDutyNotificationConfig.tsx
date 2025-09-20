/**
 * PagerDuty notification configuration component
 * Follows same pattern as Email/Slack with Team Members and Custom sections
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Users, AlertTriangle, Key } from 'lucide-react';
import { PagerDutyNotificationConfig, SystemUser } from '@/lib/notifications/types';
import { useQuery } from '@tanstack/react-query';

interface PagerDutyConfigProps {
  config: PagerDutyNotificationConfig;
  onChange: (config: PagerDutyNotificationConfig) => void;
  teamName?: string;
  teamPagerDutyKeys?: string[];
}

export function PagerDutyNotificationConfigComponent({ config, onChange, teamName, teamPagerDutyKeys = [] }: PagerDutyConfigProps) {
  // Use React Query for data fetching
  const { data: users = [], isLoading: usersLoading } = useQuery<SystemUser[]>({ queryKey: ['/api/users'] });
  
  const [customServiceKeyInput, setCustomServiceKeyInput] = useState('');
  const [customServiceKeys, setCustomServiceKeys] = useState<string[]>([]);
  const [selectedTeamPagerDuty, setSelectedTeamPagerDuty] = useState<string[]>([]);
  const [serviceKeyError, setServiceKeyError] = useState('');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  
  // Get team members' PagerDuty services
  const teamMemberPagerDutyServices = useMemo(() => {
    const allServices: string[] = [];
    
    users.forEach((user: SystemUser) => {
      if (user.user_pagerduty && Array.isArray(user.user_pagerduty)) {
        allServices.push(...user.user_pagerduty);
      }
    });
    
    // Remove duplicates and sort
    return Array.from(new Set(allServices)).sort();
  }, [users]);

  // Combine team PagerDuty keys and individual member services for Team Members section
  const allTeamPagerDutyOptions = useMemo(() => {
    const combined = [...teamPagerDutyKeys, ...teamMemberPagerDutyServices];
    return Array.from(new Set(combined)).sort();
  }, [teamPagerDutyKeys, teamMemberPagerDutyServices]);

  useEffect(() => {
    // Update config with selected services
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

  const handleTeamPagerDutyToggle = (service: string) => {
    setSelectedTeamPagerDuty(prev => {
      if (prev.includes(service)) {
        return prev.filter(s => s !== service);
      } else {
        return [...prev, service];
      }
    });
  };

  const handleDropdownSelect = (value: string) => {
    if (value && !selectedTeamPagerDuty.includes(value)) {
      setSelectedTeamPagerDuty(prev => [...prev, value]);
    }
    setSelectedDropdownValue(''); // Reset dropdown
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
          {/* Show team PagerDuty services dropdown if available */}
          {allTeamPagerDutyOptions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Team PagerDuty Services</Label>
              <Select value={selectedDropdownValue} onValueChange={handleDropdownSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team PagerDuty services" />
                </SelectTrigger>
                <SelectContent>
                  {allTeamPagerDutyOptions
                    .filter(service => !selectedTeamPagerDuty.includes(service))
                    .map((service) => (
                    <SelectItem key={service} value={service}>
                      {service}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Selected team PagerDuty services */}
          {selectedTeamPagerDuty.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Selected Team Services</Label>
              <div className="flex flex-wrap gap-2">
                {selectedTeamPagerDuty.map((service) => (
                  <Badge key={service} variant="secondary" className="flex items-center gap-1">
                    {service}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleTeamPagerDutyToggle(service)}
                      data-testid={`remove-team-pagerduty-${service}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {allTeamPagerDutyOptions.length === 0 && !usersLoading && (
            <p className="text-sm text-muted-foreground">
              No team PagerDuty services configured. Add services in team settings or use custom service keys below.
            </p>
          )}

          {usersLoading && (
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
              <div className="flex-1">
                <Input
                  type="password"
                  placeholder="Enter PagerDuty service integration key"
                  value={customServiceKeyInput}
                  onChange={(e) => {
                    setCustomServiceKeyInput(e.target.value);
                    setServiceKeyError('');
                  }}
                  onKeyPress={handleKeyPress}
                  className={serviceKeyError ? 'border-red-500' : ''}
                  data-testid="input-custom-pagerduty-key"
                />
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