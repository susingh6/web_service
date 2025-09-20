/**
 * PagerDuty notification configuration component
 * Handles service key validation and escalation policy setup
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Key, AlertCircle } from 'lucide-react';
import { PagerDutyNotificationConfig } from '@/lib/notifications/types';

interface PagerDutyConfigProps {
  config: PagerDutyNotificationConfig;
  onChange: (config: PagerDutyNotificationConfig) => void;
  teamPagerDutyKeys?: string[];
}

export function PagerDutyNotificationConfigComponent({ config, onChange, teamPagerDutyKeys = [] }: PagerDutyConfigProps) {
  const [serviceKey, setServiceKey] = useState(config?.serviceKey || '');
  const [escalationPolicy, setEscalationPolicy] = useState(config?.escalationPolicy || '');
  const [serviceKeyError, setServiceKeyError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const updatedConfig = {
      ...(config || {}),
      serviceKey: serviceKey,
      escalationPolicy: escalationPolicy,
    };
    onChange(updatedConfig);
  }, [serviceKey, escalationPolicy, config, onChange]);

  const handleServiceKeyChange = (value: string) => {
    setServiceKey(value);
    setServiceKeyError('');

    // Real-time validation
    if (value && value.length < 10) {
      setServiceKeyError('Service key must be at least 10 characters');
    }
  };

  const validateServiceKey = async (key: string) => {
    if (!key || key.length < 10) {
      setServiceKeyError('Service key is required and must be at least 10 characters');
      return;
    }

    setIsValidating(true);
    try {
      // This would be implemented when PagerDuty integration is added
      // const response = await fetch(`/api/pagerduty/validate-service?key=${encodeURIComponent(key)}`);
      // if (!response.ok) {
      //   setServiceKeyError('Invalid service key or service not accessible');
      // }
      
      // For now, just validate length and format
      if (!/^[a-zA-Z0-9]+$/.test(key)) {
        setServiceKeyError('Service key should contain only alphanumeric characters');
      }
    } catch (error) {
      setServiceKeyError('Unable to validate service key. Please check your PagerDuty integration.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleBlur = () => {
    if (serviceKey) {
      validateServiceKey(serviceKey);
    }
  };

  const escalationPolicies = [
    { value: 'default', label: 'Default Escalation Policy' },
    { value: 'critical', label: 'Critical Issues' },
    { value: 'data-team', label: 'Data Team Escalation' },
    { value: 'engineering', label: 'Engineering Team' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          PagerDuty Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pagerduty-service-key" className="text-sm">
            Service Integration Key <span className="text-red-500">*</span>
          </Label>
          
          {/* Show team PagerDuty keys dropdown if available */}
          {teamPagerDutyKeys.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Team PagerDuty Services</Label>
              <Select onValueChange={(value) => handleServiceKeyChange(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team PagerDuty service" />
                </SelectTrigger>
                <SelectContent>
                  {teamPagerDutyKeys.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Custom service key input */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {teamPagerDutyKeys.length > 0 ? 'Or enter custom service key' : 'Service integration key'}
            </Label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                <Key className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                id="pagerduty-service-key"
                type="password"
                placeholder="Enter PagerDuty service integration key"
                value={serviceKey}
                onChange={(e) => handleServiceKeyChange(e.target.value)}
                onBlur={handleBlur}
                className="pl-10"
                disabled={isValidating}
              />
            </div>
          </div>
          
          {serviceKeyError && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {serviceKeyError}
            </div>
          )}
          
          {isValidating && (
            <p className="text-sm text-muted-foreground">Validating service key...</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="escalation-policy" className="text-sm">
            Escalation Policy (Optional)
          </Label>
          <Select value={escalationPolicy} onValueChange={setEscalationPolicy}>
            <SelectTrigger>
              <SelectValue placeholder="Select escalation policy..." />
            </SelectTrigger>
            <SelectContent>
              {escalationPolicies.map((policy) => (
                <SelectItem key={policy.value} value={policy.value}>
                  {policy.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-orange-900 mb-2">Setup Requirements</h4>
          <ul className="text-sm text-orange-800 space-y-1">
            <li>• Create a service in your PagerDuty account</li>
            <li>• Generate an integration key for the service</li>
            <li>• Configure escalation policies for proper incident routing</li>
            <li>• Test the integration before going live</li>
          </ul>
        </div>

        {serviceKey && !serviceKeyError && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              Incidents will be created in PagerDuty when SLA violations occur
              {escalationPolicy && ` using the "${escalationPolicies.find(p => p.value === escalationPolicy)?.label}" escalation policy`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}