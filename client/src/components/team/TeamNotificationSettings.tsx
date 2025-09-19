/**
 * Team Notification Settings Component
 * Allows team members to manage their team's email, Slack, and PagerDuty notifications
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
  Button,
  Autocomplete
} from '@mui/material';
import { Bell, Mail, MessageSquare, AlertTriangle } from 'lucide-react';
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

  // Track changes
  useEffect(() => {
    const hasDataChanges = (
      JSON.stringify(formData.team_email) !== JSON.stringify(team?.team_email || []) ||
      JSON.stringify(formData.team_slack) !== JSON.stringify(team?.team_slack || []) ||
      JSON.stringify(formData.team_pagerduty) !== JSON.stringify(team?.team_pagerduty || [])
    );
    setHasChanges(hasDataChanges);
  }, [formData, team]);

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
    },
    onError: (error: any) => {
      console.error('Update team notifications error:', error);
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

  const addValue = (type: 'team_email' | 'team_slack' | 'team_pagerduty', value: string) => {
    if (!value.trim()) return;
    
    let isValid = true;
    if (type === 'team_email') isValid = validateEmail(value.trim());
    if (type === 'team_slack') isValid = validateSlackHandle(value.trim());
    
    if (isValid) {
      const newValues = [...(formData[type] || []), value.trim()];
      setFormData({ ...formData, [type]: newValues });
    }
  };

  const removeValue = (type: 'team_email' | 'team_slack' | 'team_pagerduty', index: number) => {
    const newValues = formData[type]?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, [type]: newValues });
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Bell size={14} />
          Notification Settings:
        </Typography>
        {hasChanges && (
          <Box display="flex" gap={1}>
            <Button
              size="small"
              onClick={handleReset}
              sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
            >
              Reset
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={updateNotificationsMutation.isPending}
              sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
            >
              {updateNotificationsMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        )}
      </Box>

      <Box sx={{ pl: 2 }}>
        {/* Email Notifications */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Mail size={12} /> Email:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {formData.team_email?.map((email, index) => (
              <Chip 
                key={email}
                label={email} 
                size="small"
                variant="outlined"
                onDelete={() => removeValue('team_email', index)}
                sx={{ fontSize: '0.7rem', height: '20px' }}
              />
            ))}
            <Autocomplete
              freeSolo
              options={[]}
              size="small"
              sx={{ minWidth: '120px', maxWidth: '180px' }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Add email..."
                  sx={{ '& .MuiInputBase-root': { height: '24px', fontSize: '0.75rem' } }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value;
                      addValue('team_email', value);
                      (e.target as HTMLInputElement).value = '';
                      e.preventDefault();
                    }
                  }}
                />
              )}
            />
          </Box>
        </Box>

        {/* Slack Notifications */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <MessageSquare size={12} /> Slack:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {formData.team_slack?.map((handle, index) => (
              <Chip 
                key={handle}
                label={handle} 
                size="small"
                variant="outlined"
                onDelete={() => removeValue('team_slack', index)}
                sx={{ fontSize: '0.7rem', height: '20px' }}
              />
            ))}
            <Autocomplete
              freeSolo
              options={[]}
              size="small"
              sx={{ minWidth: '120px', maxWidth: '180px' }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="@user or #channel..."
                  sx={{ '& .MuiInputBase-root': { height: '24px', fontSize: '0.75rem' } }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value;
                      addValue('team_slack', value);
                      (e.target as HTMLInputElement).value = '';
                      e.preventDefault();
                    }
                  }}
                />
              )}
            />
          </Box>
        </Box>

        {/* PagerDuty Notifications */}
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AlertTriangle size={12} /> PagerDuty:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {formData.team_pagerduty?.map((key, index) => (
              <Chip 
                key={key}
                label={key} 
                size="small"
                variant="outlined"
                onDelete={() => removeValue('team_pagerduty', index)}
                sx={{ fontSize: '0.7rem', height: '20px' }}
              />
            ))}
            <Autocomplete
              freeSolo
              options={[]}
              size="small"
              sx={{ minWidth: '120px', maxWidth: '180px' }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="service key..."
                  sx={{ '& .MuiInputBase-root': { height: '24px', fontSize: '0.75rem' } }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value;
                      addValue('team_pagerduty', value);
                      (e.target as HTMLInputElement).value = '';
                      e.preventDefault();
                    }
                  }}
                />
              )}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}