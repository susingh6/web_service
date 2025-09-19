/**
 * Team Notification Settings Component
 * Allows team members to manage their team's email, Slack, and PagerDuty notifications
 */

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Autocomplete,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Bell, Mail, MessageSquare, AlertTriangle, Save, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Team } from '@shared/schema';

interface TeamNotificationSettingsProps {
  team: Team;
  tenantName: string;
}

export function TeamNotificationSettings({ team, tenantName }: TeamNotificationSettingsProps) {
  const [formData, setFormData] = useState({
    team_email: team?.team_email || [],
    team_slack: team?.team_slack || [],
    team_pagerduty: team?.team_pagerduty || [],
  });
  
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Update form data when team prop changes
  useEffect(() => {
    if (team) {
      const newFormData = {
        team_email: team.team_email || [],
        team_slack: team.team_slack || [],
        team_pagerduty: team.team_pagerduty || [],
      };
      setFormData(newFormData);
      setHasChanges(false);
    }
  }, [team]);

  // Check for changes
  useEffect(() => {
    const originalData = {
      team_email: team?.team_email || [],
      team_slack: team?.team_slack || [],
      team_pagerduty: team?.team_pagerduty || [],
    };

    const hasActualChanges = 
      JSON.stringify(formData.team_email.sort()) !== JSON.stringify(originalData.team_email.sort()) ||
      JSON.stringify(formData.team_slack.sort()) !== JSON.stringify(originalData.team_slack.sort()) ||
      JSON.stringify(formData.team_pagerduty.sort()) !== JSON.stringify(originalData.team_pagerduty.sort());

    setHasChanges(hasActualChanges);
  }, [formData, team]);

  // Update team notification settings mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('PUT', `/api/v1/teams/${team.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Team notification settings updated successfully',
      });

      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, team.id] });

      setHasChanges(false);

      // Dispatch custom event to notify admin panel of updates
      window.dispatchEvent(new CustomEvent('admin-teams-updated', { 
        detail: { teamId: team.id, teamName: team.name, tenantName } 
      }));
    },
    onError: (error: any) => {
      console.error('Error updating team notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to update team notification settings',
        variant: 'destructive',
      });
    }
  });

  const handleSave = () => {
    if (!hasChanges) return;
    updateNotificationsMutation.mutate(formData);
  };

  const handleReset = () => {
    setFormData({
      team_email: team?.team_email || [],
      team_slack: team?.team_slack || [],
      team_pagerduty: team?.team_pagerduty || [],
    });
    setHasChanges(false);
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateSlackHandle = (handle: string) => {
    return /^[a-zA-Z0-9._-]+$/.test(handle.replace('@', ''));
  };

  return (
    <Card elevation={1} sx={{ mt: 3 }}>
      <CardHeader
        avatar={<Bell size={20} />}
        title={
          <Typography variant="h6" fontWeight={600}>
            Team Notification Settings
          </Typography>
        }
        subheader={
          <Typography variant="body2" color="text.secondary">
            Configure notification channels for this team's SLA alerts and updates
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        <Alert severity="info" sx={{ mb: 3 }} icon={<Info size={16} />}>
          <Typography variant="body2">
            These settings control where team-wide notifications are sent when entities owned by <strong>{team.name}</strong> have SLA breaches or status changes.
            Individual entity notifications can be configured separately.
          </Typography>
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Email Notifications */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
              <Mail size={16} />
              <Typography variant="subtitle2" fontWeight={600}>
                Email Notifications
              </Typography>
            </Box>
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={formData.team_email}
              onChange={(event, newValue) => {
                // Validate emails
                const validEmails = newValue.filter(email => 
                  typeof email === 'string' && validateEmail(email.trim())
                );
                setFormData({ ...formData, team_email: validEmails });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Team Email Addresses"
                  placeholder="Add email addresses for team notifications..."
                  helperText="Press Enter to add an email address. Only team members can modify these settings."
                  data-testid="input-team-emails"
                />
              )}
              renderTags={(tagValue, getTagProps) =>
                tagValue.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    {...getTagProps({ index })}
                    key={option}
                  />
                ))
              }
            />
          </Box>

          <Divider />

          {/* Slack Notifications */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
              <MessageSquare size={16} />
              <Typography variant="subtitle2" fontWeight={600}>
                Slack Notifications
              </Typography>
            </Box>
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={formData.team_slack}
              onChange={(event, newValue) => {
                // Validate Slack handles
                const validHandles = newValue.filter(handle => 
                  typeof handle === 'string' && validateSlackHandle(handle.trim())
                );
                setFormData({ ...formData, team_slack: validHandles });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Team Slack Handles/Channels"
                  placeholder="Add @username or #channel names..."
                  helperText="Press Enter to add Slack usernames (@username) or channel names (#channel)"
                  data-testid="input-team-slack"
                />
              )}
              renderTags={(tagValue, getTagProps) =>
                tagValue.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    {...getTagProps({ index })}
                    key={option}
                  />
                ))
              }
            />
          </Box>

          <Divider />

          {/* PagerDuty Notifications */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
              <AlertTriangle size={16} />
              <Typography variant="subtitle2" fontWeight={600}>
                PagerDuty Notifications
              </Typography>
            </Box>
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={formData.team_pagerduty}
              onChange={(event, newValue) => {
                setFormData({ ...formData, team_pagerduty: newValue as string[] });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="PagerDuty Service Keys/Users"
                  placeholder="Add service keys or user emails..."
                  helperText="Press Enter to add PagerDuty service keys or user email addresses"
                  data-testid="input-team-pagerduty"
                />
              )}
              renderTags={(tagValue, getTagProps) =>
                tagValue.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    {...getTagProps({ index })}
                    key={option}
                  />
                ))
              }
            />
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, pt: 2 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!hasChanges || updateNotificationsMutation.isPending}
              startIcon={updateNotificationsMutation.isPending ? <CircularProgress size={16} /> : <Save size={16} />}
              data-testid="button-save-notifications"
            >
              {updateNotificationsMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={!hasChanges || updateNotificationsMutation.isPending}
              data-testid="button-reset-notifications"
            >
              Reset
            </Button>
          </Box>

          {hasChanges && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              <Typography variant="body2">
                You have unsaved changes. Click "Save Changes" to apply them.
              </Typography>
            </Alert>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}