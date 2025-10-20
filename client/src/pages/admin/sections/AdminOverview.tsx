import { 
  Box, 
  Grid,
  Card, 
  CardContent, 
  Typography, 
  Avatar,
  useTheme 
} from '@mui/material';
import {
  Groups as TeamsIcon,
  Business as TenantsIcon,
  People as UsersIcon,
  Warning as ConflictsIcon,
  Security as RolesIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildUrl, endpoints } from '@/config';
import { useEffect } from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

const StatCard = ({ title, value, icon, color, subtitle }: StatCardProps) => {
  const theme = useTheme();
  
  return (
    <Card elevation={2} sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar sx={{ bgcolor: color, mr: 2 }}>
            {icon}
          </Avatar>
          <Box>
            <Typography variant="h4" component="div" fontWeight="bold">
              {value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

const AdminOverview = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();

  // Fetch overview data
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.teams));
      return response.json();
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users', 'v2'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.admin.users.getAll));
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    staleTime: 6 * 60 * 60 * 1000,
  });

  const { data: pendingConflicts = [] } = useQuery({
    queryKey: ['admin', 'conflicts', 'overview'], // Different key for overview
    staleTime: 6 * 60 * 60 * 1000, // Cache for 6 hours
    gcTime: 6 * 60 * 60 * 1000,    // Keep in memory for 6 hours
    queryFn: async () => {
      // Fetch from server (returns empty if Redis connected, mock if Redis unavailable)
      const res = await fetch('/api/v1/conflicts');
      if (!res.ok) {
        console.warn('Failed to fetch conflicts for overview, returning empty array');
        return [];
      }
      return res.json();
    },
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/tenants'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.tenants));
      return response.json();
    },
  });

  // Fetch roles data
  const { data: roles = [] } = useQuery({
    queryKey: ['admin', 'roles'],
    staleTime: 6 * 60 * 60 * 1000, // Cache for 6 hours
    gcTime: 6 * 60 * 60 * 1000,    // Keep in memory for 6 hours
    queryFn: async () => {
      const response = await fetch(buildUrl('/api/v1/roles'));
      if (!response.ok) {
        throw new Error('Failed to fetch roles');
      }
      return response.json();
    },
  });

  // Fetch broadcast messages data
  const { data: broadcastMessages = [] } = useQuery({
    queryKey: ['admin', 'broadcast-messages'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,   // Keep in memory for 10 minutes
    queryFn: async () => {
      try {
        const response = await fetch(buildUrl('/api/v1/admin/broadcast-messages'));
        if (!response.ok && response.status !== 404) {
          throw new Error('Failed to fetch broadcast messages');
        }
        return response.status === 404 ? [] : response.json();
      } catch (error) {
        console.log('Broadcast messages not available yet');
        return [];
      }
    },
  });

  const pendingConflictsCount = pendingConflicts.filter((c: any) => c.status === 'pending').length;
  const activeRoles = roles.filter((r: any) => r.is_active).length;
  const activeBroadcasts = broadcastMessages.filter((m: any) => m.isActive).length;
  
  // Filter for active users and tenants only
  const activeUsers = users.filter((u: any) => u.is_active !== false);
  const activeTenants = tenants.filter((t: any) => t.isActive !== false);

  // Listen for user and tenant updates to refresh overview counts
  useEffect(() => {
    const handleUserProfileUpdate = () => {
      // Refresh users data when any user is updated
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    };
    
    const handleDashboardUpdate = (event: any) => {
      const detail = event?.detail || {};
      // Refresh tenants and teams data when admin updates occur
      if (detail.source === 'tenant-status-update' || detail.tenantId) {
        queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
        queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      }
    };
    
    const handleTeamsRefresh = () => {
      // Refresh teams data when teams are updated
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] }); // Teams affect tenant counts
    };
    
    // Listen for various update events
    window.addEventListener('user-profile-updated', handleUserProfileUpdate);
    window.addEventListener('dashboard-data-updated', handleDashboardUpdate);
    window.addEventListener('refresh-teams-data', handleTeamsRefresh);
    
    return () => {
      window.removeEventListener('user-profile-updated', handleUserProfileUpdate);
      window.removeEventListener('dashboard-data-updated', handleDashboardUpdate);
      window.removeEventListener('refresh-teams-data', handleTeamsRefresh);
    };
  }, [queryClient]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        System Overview
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Quick summary of your SLA management system
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Active Tenants"
            value={activeTenants.length}
            icon={<TenantsIcon />}
            color={theme.palette.info.main}
            subtitle="Organizations"
          />
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Active Teams"
            value={teams.length}
            icon={<TeamsIcon />}
            color={theme.palette.primary.main}
            subtitle="Across all tenants"
          />
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Active Users"
            value={activeUsers.length}
            icon={<UsersIcon />}
            color={theme.palette.success.main}
            subtitle="System-wide"
          />
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Active Roles"
            value={`${activeRoles}/${roles.length}`}
            icon={<RolesIcon />}
            color={theme.palette.secondary.main}
            subtitle="Security roles"
          />
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Notifications"
            value={activeBroadcasts}
            icon={<NotificationsIcon />}
            color={theme.palette.warning.main}
            subtitle="Active broadcasts"
          />
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Pending Conflicts"
            value={pendingConflictsCount}
            icon={<ConflictsIcon />}
            color={pendingConflictsCount > 0 ? theme.palette.error.main : theme.palette.success.main}
            subtitle="Require attention"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RolesIcon />
                Security Roles Summary
              </Typography>
              {roles.length > 0 ? (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Role distribution across the system
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">System Roles:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {roles.filter((r: any) => r.is_system_role).length}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Team-specific Roles:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {roles.filter((r: any) => !r.is_system_role).length}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Active Roles:</Typography>
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {activeRoles}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Inactive Roles:</Typography>
                      <Typography variant="body2" fontWeight="bold" color="text.secondary">
                        {roles.length - activeRoles}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Loading roles data...
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <NotificationsIcon />
                System Notifications
              </Typography>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Broadcast message status
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Active Broadcasts:</Typography>
                    <Typography variant="body2" fontWeight="bold" color="warning.main">
                      {activeBroadcasts}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Total Messages:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {broadcastMessages.length}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Login Triggered:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {broadcastMessages.filter((m: any) => m.deliveryType === 'login_triggered').length}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Immediate:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {broadcastMessages.filter((m: any) => m.deliveryType === 'immediate').length}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Immediate & Login:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {broadcastMessages.filter((m: any) => m.deliveryType === 'immediate_and_login_triggered').length}
                    </Typography>
                  </Box>
                </Box>
                {broadcastMessages.length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    No system notifications configured
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminOverview;