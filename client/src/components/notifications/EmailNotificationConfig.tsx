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
import { getUsersFromCache, getCachedUsers, getTeamMemberEmails } from '@/lib/notifications/cacheUtils';

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
  const [selectedTeamEmails, setSelectedTeamEmails] = useState<string[]>([]);
  const [selectedOtherEmails, setSelectedOtherEmails] = useState<string[]>([]);
  const [emailError, setEmailError] = useState('');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  const [allTeamsData, setAllTeamsData] = useState<any[]>([]);
  const [otherTeamEmails, setOtherTeamEmails] = useState<string[]>([]);

  useEffect(() => {
    // Load cached data, fetch if empty
    const loadUsers = async () => {
      let cachedUsers = getUsersFromCache();
      if (cachedUsers.length === 0) {
        // Cache is empty (after restart), fetch fresh data
        cachedUsers = await getCachedUsers();
      }
      setUsers(cachedUsers);
    };
    loadUsers();
  }, []);

  // Fetch all teams data and get ALL other emails
  useEffect(() => {
    const fetchAllTeams = async () => {
      try {
        const response = await fetch('/api/teams');
        if (response.ok) {
          const teams = await response.json();
          setAllTeamsData(teams);
          
          // Get ALL emails from system
          const allOtherEmails: string[] = [];
          
          // Add ALL team emails from OTHER teams
          teams.forEach((team: any) => {
            if (team.name !== teamName && team.team_email) {
              allOtherEmails.push(...team.team_email);
            }
          });
          
          // Add ALL user emails from the cached users data
          users.forEach((user: any) => {
            if (user.email && !teamEmails.includes(user.email)) {
              allOtherEmails.push(user.email);
            }
          });
          
          // Remove duplicates 
          const uniqueEmails = Array.from(new Set(allOtherEmails));
          setOtherTeamEmails(uniqueEmails);
        }
      } catch (error) {
        console.error('Error fetching teams data:', error);
      }
    };

    // Only fetch if users are loaded
    if (users.length > 0) {
      fetchAllTeams();
    }
  }, [teamName, teamEmails, users]);

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
          {teamEmails.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Team Email Addresses</Label>
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
                {teamEmails.map((email, index) => (
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
          {/* Other Team Emails and System Users */}
          {(otherTeamEmails.length > 0 || users.length > 0) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Other Team & System User Emails</Label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-md"
                value=""
                onChange={(e) => {
                  const email = e.target.value;
                  if (email && !selectedOtherEmails.includes(email)) {
                    setSelectedOtherEmails([...selectedOtherEmails, email]);
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