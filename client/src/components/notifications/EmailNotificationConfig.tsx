/**
 * Email notification configuration component
 * Supports default recipients, role-based selection, and custom emails
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Users, Mail } from 'lucide-react';
import { EmailNotificationConfig, SystemUser, UserRole } from '@/lib/notifications/types';
import { validateEmail } from '@/lib/notifications/types';
import { getUsersFromCache, getRolesFromCache, getTeamMemberEmails } from '@/lib/notifications/cacheUtils';

interface EmailConfigProps {
  config: EmailNotificationConfig;
  onChange: (config: EmailNotificationConfig) => void;
  teamName?: string;
}

export function EmailNotificationConfigComponent({ config, onChange, teamName }: EmailConfigProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(config.roleBasedRecipients || []);
  const [customEmailInput, setCustomEmailInput] = useState('');
  const [customEmails, setCustomEmails] = useState<string[]>(config.customEmails || []);
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    // Load cached data
    setUsers(getUsersFromCache());
    setRoles(getRolesFromCache());
  }, []);

  useEffect(() => {
    // Generate default recipients based on team
    if (teamName && users.length > 0) {
      const teamEmails = getTeamMemberEmails(users, teamName);
      const updatedConfig = {
        ...config,
        defaultRecipients: teamEmails,
        roleBasedRecipients: selectedRoles,
        customEmails: customEmails,
      };
      onChange(updatedConfig);
    }
  }, [teamName, users, selectedRoles, customEmails]);

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

  const handleRoleToggle = (roleId: string) => {
    const updatedRoles = selectedRoles.includes(roleId)
      ? selectedRoles.filter(id => id !== roleId)
      : [...selectedRoles, roleId];
    
    setSelectedRoles(updatedRoles);
  };

  const handleUserSelect = (userId: string) => {
    const userIdNum = parseInt(userId);
    const updatedUsers = selectedUsers.includes(userIdNum)
      ? selectedUsers.filter(id => id !== userIdNum)
      : [...selectedUsers, userIdNum];
    
    setSelectedUsers(updatedUsers);
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
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {config.defaultRecipients?.map((email, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {email}
              </Badge>
            ))}
            {(!config.defaultRecipients || config.defaultRecipients.length === 0) && (
              <p className="text-sm text-muted-foreground">No team members found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role-based Recipients */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Additional Recipients by Role</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role.id)}
                  onChange={() => handleRoleToggle(role.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{role.name}</span>
              </label>
            ))}
          </div>
          
          {/* User Selection */}
          <div className="space-y-2">
            <Label className="text-xs">Additional Users</Label>
            <Select onValueChange={handleUserSelect}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select users..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.displayName || user.username} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((userId) => {
                  const user = users.find(u => u.id === userId);
                  return user ? (
                    <Badge key={userId} variant="outline" className="text-xs">
                      {user.email}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 ml-1"
                        onClick={() => setSelectedUsers(selectedUsers.filter(id => id !== userId))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>
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