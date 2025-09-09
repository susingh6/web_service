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
  Warning as ConflictsIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buildUrl, endpoints } from '@/config';

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

  // Fetch overview data
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.teams));
      return response.json();
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache
    queryFn: async () => {
      console.log('Overview users query running - returning mock data');
      // Use same mock data as UsersManagement component
      const mockUsers = [
        {
          user_id: 1,
          user_name: 'john.smith',
          user_email: 'john.smith@company.com',
          user_slack: ['john.smith.slack'],
          user_pagerduty: ['john.smith@pagerduty'],
          is_active: true
        },
        {
          user_id: 2,
          user_name: 'sarah.lee',
          user_email: 'sarah.lee@company.com',
          user_slack: ['sarah.lee.slack'],
          user_pagerduty: null,
          is_active: true
        },
        {
          user_id: 3,
          user_name: 'mike.johnson',
          user_email: 'mike.johnson@company.com',
          user_slack: null,
          user_pagerduty: ['mike.johnson@pagerduty'],
          is_active: true
        },
        {
          user_id: 4,
          user_name: 'alice.wong',
          user_email: 'alice.wong@company.com',
          user_slack: ['alice.wong.slack', 'alice.backup.slack'],
          user_pagerduty: ['alice.wong@pagerduty'],
          is_active: false
        },
        {
          user_id: 5,
          user_name: 'david.chen',
          user_email: 'david.chen@company.com',
          user_slack: ['david.chen.slack'],
          user_pagerduty: ['david.chen@pagerduty', 'david.backup@pagerduty'],
          is_active: true
        }
      ];
      
      console.log('Overview users mock data:', mockUsers);
      console.log('Overview users length:', mockUsers.length);
      return mockUsers;
    },
  });

  const { data: pendingConflicts = [] } = useQuery({
    queryKey: ['admin', 'conflicts', 'overview'], // Different key for overview
    staleTime: 6 * 60 * 60 * 1000, // Cache for 6 hours
    gcTime: 6 * 60 * 60 * 1000,    // Keep in memory for 6 hours
    queryFn: async () => {
      // Use same detailed mock data as ConflictsManagement component
      const mockConflicts = [
        {
          id: 1,
          notificationId: 'CONF-2025-001',
          entityType: 'dag',
          conflictingTeams: ['PGM', 'Core'],
          conflictDetails: {
            existingOwner: 'PGM',
            requestedBy: 'sarah.lee@company.com',
            reason: 'DAG name already exists with different ownership'
          },
          status: 'pending',
          createdAt: new Date('2025-09-07')
        },
        {
          id: 2,
          notificationId: 'CONF-2025-002',
          entityType: 'table',
          conflictingTeams: ['CDM', 'Viewer Product'],
          conflictDetails: {
            existingOwner: 'CDM',
            requestedBy: 'mike.johnson@company.com',
            reason: 'Table schema conflicts with existing CDM table'
          },
          status: 'pending',
          createdAt: new Date('2025-09-08')
        },
        {
          id: 3,
          notificationId: 'CONF-2025-003',
          entityType: 'dag',
          conflictingTeams: ['IOT', 'Ad Serving'],
          conflictDetails: {
            existingOwner: 'IOT',
            requestedBy: 'alice.wong@company.com',
            reason: 'Pipeline name conflicts with existing Core DAG'
          },
          status: 'pending',
          createdAt: new Date('2025-09-09')
        }
      ];
      
      console.log('Overview conflicts mock data:', mockConflicts);
      console.log('Overview conflicts length:', mockConflicts.length);
      return mockConflicts;
    },
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/tenants'],
    queryFn: async () => {
      const response = await fetch(buildUrl(endpoints.tenants));
      return response.json();
    },
  });

  const pendingConflictsCount = pendingConflicts.filter((c: any) => c.status === 'pending').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        System Overview
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Quick summary of your SLA management system
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Teams"
            value={teams.length}
            icon={<TeamsIcon />}
            color={theme.palette.primary.main}
            subtitle="Across all tenants"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Users"
            value={users.length}
            icon={<UsersIcon />}
            color={theme.palette.success.main}
            subtitle="System-wide"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Tenants"
            value={tenants.length}
            icon={<TenantsIcon />}
            color={theme.palette.info.main}
            subtitle="Organizations"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
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
        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>
              <Typography variant="body2" color="text.secondary">
                System administration activities will appear here
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Health
              </Typography>
              <Typography variant="body2" color="text.secondary">
                All systems operational
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminOverview;