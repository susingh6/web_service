/**
 * Email notification configuration component
 * Supports default recipients and custom emails
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Users, Mail } from 'lucide-react';
import { EmailNotificationConfig, SystemUser } from '@/lib/notifications/types';
import { validateEmail } from '@/lib/notifications/types';
import { useQuery } from '@tanstack/react-query';

interface EmailConfigProps {
  config: EmailNotificationConfig;
  onChange: (config: EmailNotificationConfig) => void;
  teamName?: string;
  teamEmails?: string[];
}

export function EmailNotificationConfigComponent({ config, onChange, teamName, teamEmails = [] }: EmailConfigProps) {
  // Use React Query for data fetching - this replaces localStorage cache
  const { data: users = [], isLoading: usersLoading } = useQuery<SystemUser[]>({ queryKey: ['/api/users'] });
  const { data: allTeamsData = [], isLoading: teamsLoading } = useQuery<any[]>({ queryKey: ['/api/teams'] });
  
  // CRITICAL: Fetch team members for the current team to get individual member emails
  const { data: teamMembers = [], isLoading: teamMembersLoading, error: teamMembersError } = useQuery({
    queryKey: [`/api/get_team_members/${teamName}`], // Use CACHE_PATTERNS.TEAMS.MEMBERS pattern
    queryFn: async () => {
      if (!teamName) return [];
      // Use the correct API client method
      const { apiClient } = await import('@/config/api');
      const response = await apiClient.teams.getMembers(teamName);
      return response.json();
    },
    enabled: !!teamName,
    staleTime: 30 * 1000, // 30 seconds
  });
  
  const [customEmailInput, setCustomEmailInput] = useState('');
  const [customEmails, setCustomEmails] = useState<string[]>(config?.customEmails || []);
  const [selectedTeamEmails, setSelectedTeamEmails] = useState<string[]>([]);
  const [selectedOtherEmails, setSelectedOtherEmails] = useState<string[]>([]);
  const [emailError, setEmailError] = useState('');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  
  // Loading state
  const isLoading = usersLoading || teamsLoading || teamMembersLoading;
  
  // CRITICAL: Combine team-level emails with individual team member emails
  const allTeamEmails = useMemo(() => {
    const emails = [...teamEmails]; // Start with team-level emails
    
    // Add individual team member emails
    teamMembers.forEach((member: any) => {
      if (member.email && !emails.includes(member.email)) {
        emails.push(member.email);
      }
      // Also check for user_email field (different API responses may use different field names)
      if (member.user_email && !emails.includes(member.user_email)) {
        emails.push(member.user_email);
      }
    });
    
    return emails;
  }, [teamEmails, teamMembers]);
  
  // Compute other team emails from React Query data
  const otherTeamEmails = useMemo(() => {
    const allOtherEmails: string[] = [];
    
    // Add ALL team emails from OTHER teams
    allTeamsData.forEach((team: any) => {
      if (team.name !== teamName && team.team_email) {
        allOtherEmails.push(...team.team_email);
      }
    });
    
    // Add ALL user emails not in current team
    users.forEach((user: SystemUser) => {
      if (user.email && !allTeamEmails.includes(user.email)) {
        allOtherEmails.push(user.email);
      }
    });
    
    // Remove duplicates
    return Array.from(new Set(allOtherEmails));
  }, [allTeamsData, users, teamName, allTeamEmails]);

  useEffect(() => {
    // Update config with all selected emails
    const allSelectedEmails = [...selectedTeamEmails, ...selectedOtherEmails, ...customEmails];
    const updatedConfig = {
      ...config,
      defaultRecipients: allSelectedEmails,
      roleBasedRecipients: [], // No longer using roles
      customEmails: customEmails, // Keep track of manually entered emails separately
    };
    onChange(updatedConfig);
  }, [selectedTeamEmails, selectedOtherEmails, customEmails]);

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
          {allTeamEmails.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Team Email Addresses (Team + Members)</Label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-md"
                value={selectedDropdownValue}
                onChange={(e) => {
                  const email = e.target.value;
                  if (email && !selectedTeamEmails.includes(email)) {
                    setSelectedTeamEmails([...selectedTeamEmails, email]);
                  }
                  setSelectedDropdownValue(''); // Reset selection
                }}
              >
                <option value="" disabled>Select a team member email</option>
                {allTeamEmails.map((email, index) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Display selected TEAM emails ONLY */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Selected team emails</Label>
            <div className="flex flex-wrap gap-2">
              {selectedTeamEmails.map((email, index) => (
                <Badge key={`team-${index}`} variant="secondary" className="text-xs">
                  {email}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setSelectedTeamEmails(selectedTeamEmails.filter(e => e !== email))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
              {selectedTeamEmails.length === 0 && (
                <p className="text-sm text-muted-foreground">No team emails selected. Use the dropdown above to select team emails.</p>
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
          {/* Other Team Emails and System Users - Multi-Select with Slider */}
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading additional recipients...</div>
          ) : (otherTeamEmails.length > 0 || users.length > 0) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Other Team & System User Emails</Label>
              <div className="border border-gray-300 rounded-md p-2 max-h-48 overflow-y-auto bg-white">
                <div className="space-y-1">
                  {/* Other team emails */}
                  {otherTeamEmails.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1 sticky top-0 bg-white py-1">Other Teams</div>
                      {otherTeamEmails.map((email, index) => (
                        <label key={`other-team-${index}`} className="flex items-center space-x-2 p-1 hover:bg-gray-50 cursor-pointer rounded">
                          <input
                            type="checkbox"
                            checked={selectedOtherEmails.includes(email)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOtherEmails([...selectedOtherEmails, email]);
                              } else {
                                setSelectedOtherEmails(selectedOtherEmails.filter(e => e !== email));
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm">{email}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {/* System user emails */}
                  {users.length > 0 && (
                    <div className={otherTeamEmails.length > 0 ? "mt-3 pt-3 border-t border-gray-200" : ""}>
                      <div className="text-xs font-medium text-gray-600 mb-1 sticky top-0 bg-white py-1">System Users</div>
                      {users
                        .filter(user => user.email && !allTeamEmails.includes(user.email) && !otherTeamEmails.includes(user.email))
                        .map((user) => (
                          <label key={user.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 cursor-pointer rounded">
                            <input
                              type="checkbox"
                              checked={selectedOtherEmails.includes(user.email)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOtherEmails([...selectedOtherEmails, user.email]);
                                } else {
                                  setSelectedOtherEmails(selectedOtherEmails.filter(e => e !== user.email));
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm">{user.email}</span>
                            {(user.displayName || user.username) && (
                              <span className="text-xs text-gray-500">({user.displayName || user.username})</span>
                            )}
                          </label>
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
                    const allAvailableEmails = [
                      ...otherTeamEmails,
                      ...users
                        .filter(user => user.email && !allTeamEmails.includes(user.email) && !otherTeamEmails.includes(user.email))
                        .map(user => user.email)
                    ];
                    setSelectedOtherEmails(Array.from(new Set([...selectedOtherEmails, ...allAvailableEmails])));
                  }}
                  className="text-xs"
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOtherEmails([])}
                  className="text-xs"
                >
                  Clear All
                </Button>
              </div>
            </div>
          )}
          
          {/* Display selected OTHER emails */}
          {selectedOtherEmails.length > 0 && (
            <div className="space-y-1 mt-3">
              <Label className="text-xs text-muted-foreground">Selected additional recipients</Label>
              <div className="flex flex-wrap gap-2">
                {selectedOtherEmails.map((email, index) => (
                  <Badge key={`other-${index}`} variant="outline" className="text-xs">
                    {email}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1"
                      onClick={() => setSelectedOtherEmails(selectedOtherEmails.filter(e => e !== email))}
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

      {/* Custom Email Addresses */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Custom Email Addresses
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            * Use for non-SLA users or external recipients who need notifications
          </p>
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
          
          {/* Display custom emails */}
          {customEmails.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Custom emails added</Label>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}