/**
 * Email notification configuration component
 * Supports default recipients and custom emails
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Users, Mail } from 'lucide-react';
import { EmailNotificationConfig, SystemUser } from '@/lib/notifications/types';
import { validateEmail } from '@/lib/notifications/types';
import { getUsersFromCache, getTeamMemberEmails } from '@/lib/notifications/cacheUtils';

interface EmailConfigProps {
  config: EmailNotificationConfig;
  onChange: (config: EmailNotificationConfig) => void;
  teamName?: string;
  teamEmails?: string[];
}

export function EmailNotificationConfigComponent({ config, onChange, teamName, teamEmails = [] }: EmailConfigProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [customEmailInput, setCustomEmailInput] = useState('');
  const [customEmails, setCustomEmails] = useState<string[]>(config?.customEmails || []);
  const [emailError, setEmailError] = useState('');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  const [allTeamsData, setAllTeamsData] = useState<any[]>([]);
  const [otherTeamEmails, setOtherTeamEmails] = useState<string[]>([]);

  useEffect(() => {
    // Load cached data
    setUsers(getUsersFromCache());
  }, []);

  // Fetch all teams data to get emails from other teams
  useEffect(() => {
    const fetchAllTeams = async () => {
      try {
        const response = await fetch('/api/teams');
        if (response.ok) {
          const teams = await response.json();
          setAllTeamsData(teams);
          
          // Extract emails from all teams except current team
          const otherEmails: string[] = [];
          teams.forEach((team: any) => {
            if (team.name !== teamName) {
              // Add team emails
              if (team.team_email && Array.isArray(team.team_email)) {
                otherEmails.push(...team.team_email);
              }
              // Add member emails from other teams
              if (team.members && Array.isArray(team.members)) {
                team.members.forEach((member: any) => {
                  if (member.email) {
                    otherEmails.push(member.email);
                  }
                });
              }
            }
          });
          
          // Remove duplicates and filter out current team emails
          const uniqueOtherEmails = Array.from(new Set(otherEmails)).filter(email => 
            !teamEmails.includes(email)
          );
          setOtherTeamEmails(uniqueOtherEmails);
        }
      } catch (error) {
        console.error('Error fetching teams data:', error);
      }
    };

    fetchAllTeams();
  }, [teamName, teamEmails]);

  useEffect(() => {
    // Update config with custom emails only (don't auto-add all team emails)
    const updatedConfig = {
      ...config,
      defaultRecipients: [], // Don't auto-add team emails
      roleBasedRecipients: [], // No longer using roles
      customEmails: customEmails,
    };
    onChange(updatedConfig);
  }, [customEmails]);

  const handleAddCustomEmail = () => {
    const email = customEmailInput.trim();
    
    if (!email) {
      setEmailError('Please enter an email address');
      return;
    }
    
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    
    if (customEmails.includes(email)) {
      setEmailError('This email is already added');
      return;
    }

    setCustomEmails([...customEmails, email]);
    setCustomEmailInput('');
    setEmailError('');
  };

  const handleRemoveCustomEmail = (emailToRemove: string) => {
    setCustomEmails(customEmails.filter(email => email !== emailToRemove));
  };




  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomEmail();
    }
  };

  return (
    <div className="space-y-4">
      {/* Default Recipients */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members ({teamName || 'Default'})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Show team emails dropdown if available */}
          {teamEmails.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Team Email Addresses</Label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-md"
                value={selectedDropdownValue}
                onChange={(e) => {
                  const email = e.target.value;
                  if (email && !customEmails.includes(email)) {
                    setCustomEmails([...customEmails, email]);
                  }
                  setSelectedDropdownValue(''); // Reset selection
                }}
              >
                <option value="" disabled>Select a team member email</option>
                {teamEmails.map((email, index) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Display selected emails */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Selected emails</Label>
            <div className="flex flex-wrap gap-2">
              {customEmails.map((email, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {email}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => handleRemoveCustomEmail(email)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
              {customEmails.length === 0 && (
                <p className="text-sm text-muted-foreground">No emails selected. Use the dropdown above to select team member emails.</p>
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
          {/* Other Team Emails and System Users */}
          {(otherTeamEmails.length > 0 || users.length > 0) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Other Team & System User Emails</Label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-md"
                value=""
                onChange={(e) => {
                  const email = e.target.value;
                  if (email && !customEmails.includes(email)) {
                    setCustomEmails([...customEmails, email]);
                  }
                }}
              >
                <option value="" disabled>Select an email address</option>
                
                {/* Other team emails */}
                {otherTeamEmails.length > 0 && (
                  <optgroup label="Other Teams">
                    {otherTeamEmails.map((email, index) => (
                      <option key={`other-team-${index}`} value={email}>
                        {email}
                      </option>
                    ))}
                  </optgroup>
                )}
                
                {/* System user emails */}
                {users.length > 0 && (
                  <optgroup label="System Users">
                    {users
                      .filter(user => user.email && !teamEmails.includes(user.email) && !otherTeamEmails.includes(user.email))
                      .map((user) => (
                        <option key={user.id} value={user.email}>
                          {user.email} ({user.displayName || user.username})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Email Addresses */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Custom Email Addresses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter email address..."
              value={customEmailInput}
              onChange={(e) => {
                setCustomEmailInput(e.target.value);
                setEmailError('');
              }}
              onKeyPress={handleKeyPress}
              className="h-8"
            />
            <Button 
              type="button" 
              onClick={handleAddCustomEmail}
              size="sm"
              className="h-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {emailError && (
            <p className="text-sm text-red-500">{emailError}</p>
          )}
          
          {customEmails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customEmails.map((email, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {email}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => handleRemoveCustomEmail(email)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}