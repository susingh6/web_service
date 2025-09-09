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
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      // Mock data for now - replace with real API call
      return Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }));
    },
  });

  const { data: pendingConflicts = [] } = useQuery({
    queryKey: ['/api/admin/conflicts'],
    queryFn: async () => {
      // Mock data for now
      return [
        { id: 1, status: 'pending' },
        { id: 2, status: 'pending' },
        { id: 3, status: 'pending' }
      ];
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