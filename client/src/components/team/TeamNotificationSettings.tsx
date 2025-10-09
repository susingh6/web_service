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
  Autocomplete,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  CircularProgress
} from '@mui/material';
import { Bell, Mail, MessageSquare, AlertTriangle, Plus, X, Save as SaveIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppDispatch } from '@/lib/store';
import { fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { apiRequest } from '@/lib/queryClient';
import { Team } from '@shared/schema';

interface TeamNotificationSettingsProps {
  team: Team;
  tenantName: string;
  variant?: 'default' | 'compact' | 'modal';
  onClose?: () => void;
}

export function TeamNotificationSettings({ team, tenantName, variant = 'default', onClose }: TeamNotificationSettingsProps) {
  const [formData, setFormData] = useState({
    team_email: team?.team_email || [],
    team_slack: team?.team_slack || [],
    team_pagerduty: team?.team_pagerduty || [],
  });
  
  const [hasChanges, setHasChanges] = useState(false);
  const [inputValues, setInputValues] = useState({
    team_email: '',
    team_slack: '',
    team_pagerduty: ''
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const isCompact = variant === 'compact';
  const isModal = variant === 'modal';

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
    const teamEmail = team?.team_email || [];
    const teamSlack = team?.team_slack || [];
    const teamPagerduty = team?.team_pagerduty || [];
    
    const hasDataChanges = (
      JSON.stringify(formData.team_email || []) !== JSON.stringify(teamEmail) ||
      JSON.stringify(formData.team_slack || []) !== JSON.stringify(teamSlack) ||
      JSON.stringify(formData.team_pagerduty || []) !== JSON.stringify(teamPagerduty)
    );
    
    
    setHasChanges(hasDataChanges);
  }, [formData, team]);

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('PUT', `/api/v1/teams/${team.id}`, data);
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: 'Success',
        description: 'Team notification settings updated successfully',
      });

      // Use centralized cache management system
      const { invalidateAdminCaches } = await import('@/lib/cacheKeys');
      await invalidateAdminCaches(queryClient);
      
      // Invalidate team-specific caches following centralized pattern
      await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      await queryClient.invalidateQueries({ queryKey: ['team-notification-settings', team.name] });
      await queryClient.invalidateQueries({ queryKey: ['teamMembers', tenantName, team.id] });
      
      // CRITICAL: Invalidate team details cache so notification dropdowns refresh immediately
      await queryClient.invalidateQueries({ queryKey: [`/api/v1/get_team_details/${team.name}`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/get_team_details/${team.name}`] });
      // Tenant-aware team members cache invalidation
      await queryClient.invalidateQueries({ queryKey: [`/api/get_team_members/${tenantName}/${team.name}`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/get_team_members/${team.name}`] });
      
      // Refresh Redux teams so NotificationSummary reflects new emails immediately
      dispatch(fetchTeams());
      
      setHasChanges(false);
      
      // Close modal if in modal variant
      if (isModal && onClose) {
        onClose();
      }
    },
    onError: (error: any) => {
      console.error('Update team notifications error:', error);
      const errorMessage = error?.message || 'Failed to update team notification settings';
      toast({
        title: 'Error',
        description: errorMessage,
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
    // Allow @user or #channel (letters, numbers, underscore, hyphen, dot)
    return /^[@#][a-zA-Z0-9._-]+$/.test(handle);
  };

  const addValue = (type: 'team_email' | 'team_slack' | 'team_pagerduty') => {
    const value = inputValues[type].trim();
    if (!value) return;
    
    let isValid = true;
    if (type === 'team_email') isValid = validateEmail(value);
    if (type === 'team_slack') isValid = validateSlackHandle(value);
    
    if (isValid && !formData[type]?.includes(value)) {
      const newValues = [...(formData[type] || []), value];
      setFormData({ ...formData, [type]: newValues });
      setInputValues({ ...inputValues, [type]: '' });
    } else if (!isValid) {
      toast({
        title: 'Invalid format',
        description: type === 'team_email' ? 'Please enter a valid email address' : 'Please enter a valid format',
        variant: 'destructive',
      });
    }
  };
  
  const handleInputChange = (type: 'team_email' | 'team_slack' | 'team_pagerduty', value: string) => {
    setInputValues({ ...inputValues, [type]: value });
  };
  
  const handleKeyPress = (type: 'team_email' | 'team_slack' | 'team_pagerduty', event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addValue(type);
    }
  };

  const removeValue = (type: 'team_email' | 'team_slack' | 'team_pagerduty', index: number) => {
    const newValues = formData[type]?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, [type]: newValues });
  };

  // Modal variant
  if (isModal) {
    return (
      <Dialog
        open={true}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { minHeight: '500px' }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Team Notification Settings</Typography>
            <IconButton onClick={onClose} size="small">
              <X size={20} />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configure email, Slack, and PagerDuty notifications for the {team.name} team
          </Typography>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 4 }}>
            {/* Email Notifications */}
            <Box>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  mb: 2, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  fontWeight: 600
                }}
              >
                <Mail size={16} /> Email Notifications
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: '32px', mb: 2 }}>
                {formData.team_email?.map((email, index) => (
                  <Chip 
                    key={email}
                    label={email} 
                    size="small"
                    variant="outlined"
                    onDelete={() => removeValue('team_email', index)}
                    sx={{ fontSize: '0.8rem' }}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="name@company.com"
                  value={inputValues.team_email}
                  onChange={(e) => handleInputChange('team_email', e.target.value)}
                  onKeyDown={(e) => handleKeyPress('team_email', e)}
                />
                <IconButton 
                  onClick={() => addValue('team_email')}
                  disabled={!inputValues.team_email.trim()}
                  color="primary"
                  size="small"
                >
                  <Plus size={16} />
                </IconButton>
              </Box>
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ fontSize: '0.7rem' }}
              >
                Type email and press Enter or click +
              </Typography>
            </Box>

            {/* Slack Notifications */}
            <Box>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  mb: 2, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  fontWeight: 600
                }}
              >
                <MessageSquare size={16} /> Slack Notifications
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: '32px', mb: 2 }}>
                {formData.team_slack?.map((handle, index) => (
                  <Chip 
                    key={handle}
                    label={handle} 
                    size="small"
                    variant="outlined"
                    onDelete={() => removeValue('team_slack', index)}
                    sx={{ fontSize: '0.8rem' }}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="@user or #channel"
                  value={inputValues.team_slack}
                  onChange={(e) => handleInputChange('team_slack', e.target.value)}
                  onKeyDown={(e) => handleKeyPress('team_slack', e)}
                />
                <IconButton 
                  onClick={() => addValue('team_slack')}
                  disabled={!inputValues.team_slack.trim()}
                  color="primary"
                  size="small"
                >
                  <Plus size={16} />
                </IconButton>
              </Box>
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ fontSize: '0.7rem' }}
              >
                Type handle and press Enter or click +
              </Typography>
            </Box>

            {/* PagerDuty Notifications */}
            <Box>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  mb: 2, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  fontWeight: 600
                }}
              >
                <AlertTriangle size={16} /> PagerDuty Notifications
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: '32px', mb: 2 }}>
                {formData.team_pagerduty?.map((key, index) => (
                  <Chip 
                    key={key}
                    label={key} 
                    size="small"
                    variant="outlined"
                    onDelete={() => removeValue('team_pagerduty', index)}
                    sx={{ fontSize: '0.8rem' }}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="service-escalation"
                  value={inputValues.team_pagerduty}
                  onChange={(e) => handleInputChange('team_pagerduty', e.target.value)}
                  onKeyDown={(e) => handleKeyPress('team_pagerduty', e)}
                />
                <IconButton 
                  onClick={() => addValue('team_pagerduty')}
                  disabled={!inputValues.team_pagerduty.trim()}
                  color="primary"
                  size="small"
                >
                  <Plus size={16} />
                </IconButton>
              </Box>
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ fontSize: '0.7rem' }}
              >
                Type service key and press Enter or click +
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1 }}>
          <Button onClick={handleReset} disabled={updateNotificationsMutation.isPending}>
            Reset
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!hasChanges || updateNotificationsMutation.isPending}
            startIcon={updateNotificationsMutation.isPending ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {updateNotificationsMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

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

      <Box sx={{ 
        pl: 2, 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, 
        gap: 2, 
        alignItems: 'start' 
      }}>
        {/* Email Notifications */}
        <Box>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              mb: 1, 
              fontSize: variant === 'compact' ? '0.7rem' : '0.75rem', 
              lineHeight: 1, 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 0.5,
              height: '20px'
            }}
          >
            <Mail size={12} /> Email:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: '24px', mb: 1 }}>
            {formData.team_email?.map((email, index) => (
              <Chip 
                key={email}
                label={email} 
                size="small"
                variant="outlined"
                onDelete={() => removeValue('team_email', index)}
                sx={{ fontSize: '0.75rem', height: '24px' }}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              size="small"
              placeholder="name@company.com"
              value={inputValues.team_email}
              onChange={(e) => handleInputChange('team_email', e.target.value)}
              onKeyDown={(e) => handleKeyPress('team_email', e)}
              sx={{ 
                flex: 1,
                '& .MuiInputBase-root': { 
                  height: '24px', 
                  fontSize: '0.75rem' 
                } 
              }}
            />
            <IconButton 
              size="small" 
              onClick={() => addValue('team_email')}
              disabled={!inputValues.team_email.trim()}
              sx={{ 
                height: '24px',
                width: '24px',
                color: 'primary.main',
                '&:hover': { bgcolor: 'primary.lighter' }
              }}
            >
              <Plus size={12} />
            </IconButton>
          </Box>
          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ fontSize: '0.65rem', mt: 0.5, display: 'block' }}
          >
            Type email and press Enter or click +
          </Typography>
        </Box>

        {/* Slack Notifications */}
        <Box>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              mb: 1, 
              fontSize: variant === 'compact' ? '0.7rem' : '0.75rem', 
              lineHeight: 1, 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 0.5,
              height: '20px'
            }}
          >
            <MessageSquare size={12} /> Slack:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: '24px', mb: 1 }}>
            {formData.team_slack?.map((handle, index) => (
              <Chip 
                key={handle}
                label={handle} 
                size="small"
                variant="outlined"
                onDelete={() => removeValue('team_slack', index)}
                sx={{ fontSize: '0.75rem', height: '24px' }}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              size="small"
              placeholder="@user or #channel"
              value={inputValues.team_slack}
              onChange={(e) => handleInputChange('team_slack', e.target.value)}
              onKeyDown={(e) => handleKeyPress('team_slack', e)}
              sx={{ 
                flex: 1,
                '& .MuiInputBase-root': { 
                  height: '24px', 
                  fontSize: '0.75rem' 
                } 
              }}
            />
            <IconButton 
              size="small" 
              onClick={() => addValue('team_slack')}
              disabled={!inputValues.team_slack.trim()}
              sx={{ 
                height: '24px',
                width: '24px',
                color: 'primary.main',
                '&:hover': { bgcolor: 'primary.lighter' }
              }}
            >
              <Plus size={12} />
            </IconButton>
          </Box>
          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ fontSize: '0.65rem', mt: 0.5, display: 'block' }}
          >
            Type handle and press Enter or click +
          </Typography>
        </Box>

        {/* PagerDuty Notifications */}
        <Box>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              mb: 1, 
              fontSize: variant === 'compact' ? '0.7rem' : '0.75rem', 
              lineHeight: 1, 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 0.5,
              height: '20px'
            }}
          >
            <AlertTriangle size={12} /> PagerDuty:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: '24px', mb: 1 }}>
            {formData.team_pagerduty?.map((key, index) => (
              <Chip 
                key={key}
                label={key} 
                size="small"
                variant="outlined"
                onDelete={() => removeValue('team_pagerduty', index)}
                sx={{ fontSize: '0.75rem', height: '24px' }}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              size="small"
              placeholder="service-escalation"
              value={inputValues.team_pagerduty}
              onChange={(e) => handleInputChange('team_pagerduty', e.target.value)}
              onKeyDown={(e) => handleKeyPress('team_pagerduty', e)}
              sx={{ 
                flex: 1,
                '& .MuiInputBase-root': { 
                  height: '24px', 
                  fontSize: '0.75rem' 
                } 
              }}
            />
            <IconButton 
              size="small" 
              onClick={() => addValue('team_pagerduty')}
              disabled={!inputValues.team_pagerduty.trim()}
              sx={{ 
                height: '24px',
                width: '24px',
                color: 'primary.main',
                '&:hover': { bgcolor: 'primary.lighter' }
              }}
            >
              <Plus size={12} />
            </IconButton>
          </Box>
          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ fontSize: '0.65rem', mt: 0.5, display: 'block' }}
          >
            Type service key and press Enter or click +
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}