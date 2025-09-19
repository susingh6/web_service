import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Chip,
  Paper,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Person as PersonIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { buildUrl, endpoints } from '@/config';
import { apiRequest } from '@/lib/queryClient';
import { useOptimisticMutation, CACHE_PATTERNS, INVALIDATION_SCENARIOS } from '@/utils/cache-management';
import { useLocation } from 'wouter';

interface ProfileData {
  user_id: number;
  user_name: string;
  user_email: string;
  user_slack: string[] | null;
  user_pagerduty: string[] | null;
  is_active: boolean;
}

const ProfilePage = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    user_name: '',
    user_email: '',
    user_slack: '',
    user_pagerduty: '',
    is_active: true,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();
  const [location, setLocation] = useLocation();

  // Fetch current user profile
  const { data: profileData, isLoading, error } = useQuery({
    queryKey: ['profile', 'current'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,   // Keep in memory for 10 minutes
    queryFn: async (): Promise<ProfileData> => {
      const response = await fetch(buildUrl(endpoints.profile.getCurrent), {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      return response.json();
    },
  });

  // Update form data when profile data changes
  useEffect(() => {
    if (profileData) {
      setFormData({
        user_name: profileData.user_name || '',
        user_email: profileData.user_email || '',
        user_slack: profileData.user_slack ? profileData.user_slack.join(', ') : '',
        user_pagerduty: profileData.user_pagerduty ? profileData.user_pagerduty.join(', ') : '',
        is_active: profileData.is_active ?? true,
      });
    }
  }, [profileData]);

  // Update profile mutation with optimistic updates
  const updateProfile = async (userData: any) => {
    try {
      const result = await executeWithOptimism({
        optimisticUpdate: {
          queryKey: ['profile', 'current'],
          updater: (old: ProfileData | undefined) => {
            if (!old) return old;
            return {
              ...old,
              user_name: userData.user_name,
              user_email: userData.user_email,
              user_slack: userData.user_slack,
              user_pagerduty: userData.user_pagerduty,
            };
          },
        },
        mutationFn: async () => {
          const response = await apiRequest(
            'PUT',
            buildUrl(endpoints.profile.updateCurrent),
            userData
          );
          return response.json();
        },
        // Use generic invalidation since profile doesn't have specific scenarios yet
        invalidationScenario: undefined,
        rollbackKeys: [['profile', 'current']],
      });

      // IMPORTANT: Apply optimistic update to admin users cache (matches entity operation pattern)
      const currentUser = queryClient.getQueryData(['profile', 'current']) as ProfileData | undefined;
      if (currentUser?.user_email) {
        cacheManager.setOptimisticData(['admin', 'users'], (old: any[] | undefined) => {
          if (!old) return old;
          return old.map(user => 
            user.email === currentUser.user_email 
              ? { 
                  ...user, 
                  user_name: userData.user_name,
                  username: userData.user_name, // Admin uses both fields
                  user_slack: userData.user_slack,
                  user_pagerduty: userData.user_pagerduty,
                }
              : user
          );
        });
      }

      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      
      return result;
    } catch (error: any) {
      let errorMessage = "Failed to update profile. Please try again.";
      let errorTitle = "Update Failed";

      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.status === 409) {
        errorMessage = "Username already exists. Please choose a different username.";
        errorTitle = "Username Taken";
      } else if (error?.status === 400) {
        errorMessage = "Invalid profile data provided. Please check your input.";
        errorTitle = "Invalid Data";
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateProfileMutation = useMutation({
    mutationFn: updateProfile,
  });

  const handleSave = async () => {
    try {
      const userData = {
        user_name: formData.user_name,
        user_email: formData.user_email,
        user_slack: formData.user_slack ? formData.user_slack.split(',').map((s: string) => s.trim()).filter((s: string) => s) : null,
        user_pagerduty: formData.user_pagerduty ? formData.user_pagerduty.split(',').map((s: string) => s.trim()).filter((s: string) => s) : null,
      };
      
      await updateProfileMutation.mutateAsync(userData);
      setIsEditing(false);
    } catch (error) {
      // Error handling is done in the mutation function
      console.error('Profile update error:', error);
    }
  };

  const handleCancel = () => {
    // Reset form data to current profile data
    if (profileData) {
      setFormData({
        user_name: profileData.user_name || '',
        user_email: profileData.user_email || '',
        user_slack: profileData.user_slack ? profileData.user_slack.join(', ') : '',
        user_pagerduty: profileData.user_pagerduty ? profileData.user_pagerduty.join(', ') : '',
        is_active: profileData.is_active ?? true,
      });
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load profile data. Please try refreshing the page.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => setLocation('/')}
          variant="outlined"
          size="small"
          data-testid="button-back-to-dashboard"
        >
          Back to Dashboard
        </Button>
      </Box>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            My Profile
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your account details and notification preferences
          </Typography>
        </Box>
        {!isEditing ? (
          <Button
            variant="contained"
            startIcon={<PersonIcon />}
            onClick={() => setIsEditing(true)}
            data-testid="button-edit-profile"
          >
            Edit Profile
          </Button>
        ) : (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<CancelIcon />}
              onClick={handleCancel}
              disabled={updateProfileMutation.isPending}
              data-testid="button-cancel-profile"
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={updateProfileMutation.isPending || !formData.user_name || !formData.user_email}
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </Box>
        )}
      </Box>

      <Card elevation={2}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            User Information
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            <TextField
              fullWidth
              label="User Name"
              value={formData.user_name}
              onChange={(e) => setFormData({ ...formData, user_name: e.target.value })}
              disabled={!isEditing}
              required
              helperText="Your unique username"
              data-testid="input-user-name"
            />
            
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.user_email}
              onChange={(e) => setFormData({ ...formData, user_email: e.target.value })}
              disabled={true}
              required
              helperText="Email is managed by OAuth and cannot be changed"
              data-testid="input-user-email"
              sx={{
                '& .MuiInputBase-input.Mui-disabled': {
                  WebkitTextFillColor: 'rgba(0, 0, 0, 0.6)',
                  opacity: 0.7
                }
              }}
            />
            
            <TextField
              fullWidth
              label="Slack Handles"
              value={formData.user_slack}
              onChange={(e) => setFormData({ ...formData, user_slack: e.target.value })}
              disabled={!isEditing}
              helperText="Comma-separated Slack handles (e.g., john.slack, john.backup)"
              placeholder="john.slack, john.backup"
              data-testid="input-user-slack"
            />
            
            <TextField
              fullWidth
              label="PagerDuty Contacts"
              value={formData.user_pagerduty}
              onChange={(e) => setFormData({ ...formData, user_pagerduty: e.target.value })}
              disabled={!isEditing}
              helperText="Comma-separated PagerDuty contacts (e.g., john@pagerduty, john.backup@pagerduty)"
              placeholder="john@pagerduty, john.backup@pagerduty"
              data-testid="input-user-pagerduty"
            />
            
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_active}
                    disabled={true} // Always readonly as specified
                    color="primary"
                  />
                }
                label="Active Status (Read-only)"
                data-testid="switch-user-active"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
                Your account status is managed by administrators
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Profile Overview - Show current settings */}
      {!isEditing && profileData && (
        <Card elevation={1} sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Current Settings
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Slack Notifications
                </Typography>
                {profileData.user_slack && profileData.user_slack.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                    {profileData.user_slack.map((slack: string, index: number) => (
                      <Chip key={index} label={slack} size="small" variant="outlined" color="info" />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    No Slack handles configured
                  </Typography>
                )}
              </Box>
              
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  PagerDuty Notifications
                </Typography>
                {profileData.user_pagerduty && profileData.user_pagerduty.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                    {profileData.user_pagerduty.map((pd: string, index: number) => (
                      <Chip key={index} label={pd} size="small" variant="outlined" color="warning" />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    No PagerDuty contacts configured
                  </Typography>
                )}
              </Box>
              
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Account Status
                </Typography>
                <Chip 
                  label={profileData.is_active ? "Active" : "Inactive"} 
                  size="small" 
                  color={profileData.is_active ? "success" : "error"}
                  sx={{ mt: 1 }}
                />
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default ProfilePage;