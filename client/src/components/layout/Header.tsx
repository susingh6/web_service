import { useState } from 'react';
import { AppBar, Toolbar, Typography, IconButton, Badge, Avatar, Menu, MenuItem, Box, useTheme, CircularProgress, Chip } from '@mui/material';
import { Notifications as NotificationsIcon, AccountCircle, ArrowDropDown, Person as PersonIcon, Warning as WarningIcon, Info as InfoIcon, Build as BuildIcon, Computer as ComputerIcon } from '@mui/icons-material';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { AccountInfo } from '@azure/msal-browser';
import { useQuery } from '@tanstack/react-query';
import { buildUrl } from '@/config';

interface Alert {
  id: number;
  title: string;
  message: string;
  alertType: 'info' | 'warning' | 'maintenance' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  dateKey: string;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AlertTypeIcons = {
  info: InfoIcon,
  warning: WarningIcon,
  maintenance: BuildIcon,
  system: ComputerIcon,
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'error';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'info';
    default: return 'default';
  }
};

const getAlertTypeColor = (type: string) => {
  switch (type) {
    case 'warning': return 'warning';
    case 'maintenance': return 'info';
    case 'system': return 'error';
    case 'info': return 'success';
    default: return 'default';
  }
};

const formatTimeAgo = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

const Header = () => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);

  // Fetch active alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery<Alert[]>({
    queryKey: ['notifications', 'alerts'],
    queryFn: async () => {
      const response = await fetch(buildUrl('/api/v1/alerts'), {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('Failed to fetch alerts');
      const data = await response.json();
      
      // Filter only active alerts that haven't expired
      const now = new Date();
      return data.filter((alert: Alert) => 
        alert.isActive && 
        (!alert.expiresAt || new Date(alert.expiresAt) > now)
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Count of active alerts for badge
  const alertCount = alerts.length;
  
  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };
  
  const handleNotificationsOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchor(event.currentTarget);
  };
  
  const handleNotificationsClose = () => {
    setNotificationsAnchor(null);
  };
  
  const handleAdminClick = () => {
    setLocation('/admin');
    handleUserMenuClose();
  };

  const handleProfileClick = () => {
    setLocation('/profile');
    handleUserMenuClose();
  };

  const handleLogout = () => {
    handleUserMenuClose();
    logout();
  };
  
  // Get current auth method outside the display name function to avoid useAuth hook re-rendering issues
  const { authMethod } = useAuth();
  
  // Get user display name
  const getUserDisplayName = () => {
    if (!user) return 'User';
    
    // For Azure AD user
    if (authMethod === 'azure') {
      // Azure user has the name in different property
      const azureUser = user as any;
      return azureUser.name || azureUser.username || 'User';
    } 
    
    // For local user
    const localUser = user as any; // Type as any to bypass TS errors
    return localUser.displayName || localUser.username || 'User';
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user) return '?';
    
    // Get name based on auth method
    const displayName = getUserDisplayName();
    if (displayName === 'User') return '?';
    
    const names = displayName.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return names[0].substring(0, 2).toUpperCase();
  };
  
  return (
    <AppBar position="sticky" color="primary" elevation={4}>
      <Toolbar>
        <Box display="flex" alignItems="center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" color="white">
            <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2 0v10h9c-.5-5.05-4.76-9-10-9zm0 12v8c5.24-.1 9.5-4.05 10-9h-10z"></path>
          </svg>
          <Typography
            variant="h6"
            component="h1"
            sx={{
              ml: 1,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
            }}
          >
            SLA Dashboard
          </Typography>
        </Box>
        
        <Box sx={{ flexGrow: 1 }} />
        
        <Box display="flex" alignItems="center">
          <IconButton 
            color="inherit" 
            sx={{ mr: 2 }}
            onClick={handleNotificationsOpen}
            aria-label="notifications"
            data-testid="button-notifications"
          >
            <Badge badgeContent={alertCount > 0 ? alertCount : undefined} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          
          <Box 
            display="flex" 
            alignItems="center" 
            sx={{ cursor: 'pointer' }} 
            onClick={handleUserMenuOpen}
            aria-label="user menu"
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: theme.palette.primary.dark,
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {getUserInitials()}
            </Avatar>
            <Typography
              variant="body1"
              sx={{
                ml: 1,
                fontWeight: 500,
                display: { xs: 'none', md: 'block' },
              }}
            >
              {getUserDisplayName()}
            </Typography>
            <ArrowDropDown />
          </Box>
        </Box>
        
        {/* User Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleUserMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={handleAdminClick}>
            <Box display="flex" alignItems="center">
              <Typography variant="body2" color="primary" fontWeight={600}>
                Admin
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleProfileClick}>
            <Box display="flex" alignItems="center" gap={1}>
              <PersonIcon fontSize="small" />
              <Typography variant="body2">
                Profile
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleLogout}>Logout</MenuItem>
        </Menu>
        
        {/* Notifications Menu */}
        <Menu
          anchorEl={notificationsAnchor}
          open={Boolean(notificationsAnchor)}
          onClose={handleNotificationsClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          sx={{ maxWidth: 380, maxHeight: 400 }}
          data-testid="menu-notifications"
        >
          {alertsLoading ? (
            <MenuItem>
              <Box display="flex" alignItems="center" gap={1} sx={{ py: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body2">Loading notifications...</Typography>
              </Box>
            </MenuItem>
          ) : alerts.length === 0 ? (
            <MenuItem onClick={handleNotificationsClose}>
              <Box sx={{ py: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  No active notifications
                </Typography>
              </Box>
            </MenuItem>
          ) : (
            alerts.map((alert) => {
              const IconComponent = AlertTypeIcons[alert.alertType];
              return (
                <MenuItem 
                  key={alert.id} 
                  onClick={handleNotificationsClose}
                  data-testid={`notification-${alert.id}`}
                  sx={{ maxWidth: 'none', whiteSpace: 'normal' }}
                >
                  <Box sx={{ width: '100%' }}>
                    <Box display="flex" alignItems="flex-start" gap={1} mb={0.5}>
                      <IconComponent 
                        fontSize="small" 
                        color={getAlertTypeColor(alert.alertType) as any}
                        sx={{ mt: 0.25, flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {alert.title}
                        </Typography>
                        <Box display="flex" align="center" gap={1} mb={0.5}>
                          <Chip 
                            label={alert.alertType}
                            size="small"
                            color={getAlertTypeColor(alert.alertType) as any}
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                          <Chip 
                            label={alert.severity}
                            size="small"
                            color={getSeverityColor(alert.severity) as any}
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        </Box>
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 3 }}>
                      {alert.message}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      color="text.secondary" 
                      sx={{ display: 'block', mt: 0.5, ml: 3 }}
                    >
                      {formatTimeAgo(new Date(alert.createdAt))}
                    </Typography>
                  </Box>
                </MenuItem>
              );
            })
          )}
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
