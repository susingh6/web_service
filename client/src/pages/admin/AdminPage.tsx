import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Chip,
  useTheme,
  Button,
  IconButton
} from '@mui/material';
import {
  Groups as TeamsIcon,
  Business as TenantsIcon,
  Warning as ConflictsIcon,
  People as UsersIcon,
  Security as RolesIcon,
  Dashboard as OverviewIcon,
  ArrowBack as ArrowBackIcon,
  Home as HomeIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buildUrl, endpoints } from '@/config';
import { ConflictNotification } from '@shared/schema';
import { useLocation } from 'wouter';

// Admin page sections
import AdminOverview from './sections/AdminOverview';
import TeamsManagement from './sections/TeamsManagement';
import TenantsManagement from './sections/TenantsManagement';
import ConflictsManagement from './sections/ConflictsManagement';
import UsersManagement from './sections/UsersManagement';
import RolesManagement from './sections/RolesManagement';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `admin-tab-${index}`,
    'aria-controls': `admin-tabpanel-${index}`,
  };
}

const AdminPage = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [location, setLocation] = useLocation();

  // All statistics are now displayed in System Overview section only

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const tabsConfig = [
    {
      label: 'Overview',
      icon: <OverviewIcon />,
      component: <AdminOverview />
    },
    {
      label: 'Teams',
      icon: <TeamsIcon />,
      component: <TeamsManagement />
    },
    {
      label: 'Tenants',
      icon: <TenantsIcon />,
      component: <TenantsManagement />
    },
    {
      label: 'Conflicts',
      icon: <ConflictsIcon />,
      component: <ConflictsManagement />
    },
    {
      label: 'Users',
      icon: <UsersIcon />,
      component: <UsersManagement />
    },
    {
      label: 'Roles',
      icon: <RolesIcon />,
      component: <RolesManagement />
    }
  ];

  return (
    <Box sx={{ width: '100%', px: 2, py: 4 }}>
      <Box sx={{ width: '80%', mx: 'auto', maxWidth: '1400px' }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => setLocation('/')}
            variant="outlined"
            size="small"
          >
            Back to Dashboard
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            onClick={() => setLocation('/')}
            sx={{ color: theme.palette.primary.main }}
            size="small"
          >
            <HomeIcon />
          </IconButton>
        </Box>
        
        <Typography variant="h3" component="h1" gutterBottom>
          Admin Panel
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage teams, tenants, users, and resolve ownership conflicts
        </Typography>
      </Box>

      <Card elevation={2}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              px: 2,
              '& .MuiTab-root': {
                minHeight: 72,
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 500,
              }
            }}
          >
            {tabsConfig.map((tab, index) => (
              <Tab
                key={index}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {tab.icon}
                    {tab.label}
                  </Box>
                }
                {...a11yProps(index)}
              />
            ))}
          </Tabs>
        </Box>

        <CardContent sx={{ p: 0 }}>
          {tabsConfig.map((tab, index) => (
            <TabPanel key={index} value={activeTab} index={index}>
              {tab.component}
            </TabPanel>
          ))}
        </CardContent>
      </Card>
      </Box>
    </Box>
  );
};

export default AdminPage;