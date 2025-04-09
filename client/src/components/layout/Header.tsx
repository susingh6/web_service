import { useState } from 'react';
import { AppBar, Toolbar, Typography, IconButton, Badge, Avatar, Menu, MenuItem, Box, useTheme } from '@mui/material';
import { Notifications as NotificationsIcon, AccountCircle, ArrowDropDown } from '@mui/icons-material';
import { useAuth } from '@/hooks/use-auth';
import { AccountInfo } from '@azure/msal-browser';

const Header = () => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  
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
    <AppBar position="sticky" color="primary" elevation={4} sx={{ width: '100vw', maxWidth: '100vw', boxSizing: 'border-box' }}>
      <Toolbar sx={{ width: '100%', maxWidth: '100%', padding: { xs: '0 8px', sm: '0 16px' } }}>
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
            SLA Monitoring Dashboard
          </Typography>
        </Box>
        
        <Box sx={{ flexGrow: 1 }} />
        
        <Box display="flex" alignItems="center">
          <IconButton 
            color="inherit" 
            sx={{ mr: 2 }}
            onClick={handleNotificationsOpen}
            aria-label="notifications"
          >
            <Badge badgeContent={3} color="error">
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
          <MenuItem onClick={handleUserMenuClose}>Profile</MenuItem>
          <MenuItem onClick={handleUserMenuClose}>Settings</MenuItem>
          <MenuItem onClick={handleLogout}>Logout</MenuItem>
        </Menu>
        
        {/* Notifications Menu */}
        <Menu
          anchorEl={notificationsAnchor}
          open={Boolean(notificationsAnchor)}
          onClose={handleNotificationsClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          sx={{ maxWidth: 320 }}
        >
          <MenuItem onClick={handleNotificationsClose}>
            <Box>
              <Typography variant="subtitle2">Critical SLA breach</Typography>
              <Typography variant="body2" color="text.secondary">
                sales_transactions table is below threshold
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleNotificationsClose}>
            <Box>
              <Typography variant="subtitle2">Warning alert</Typography>
              <Typography variant="body2" color="text.secondary">
                product_inventory has degraded performance
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={handleNotificationsClose}>
            <Box>
              <Typography variant="subtitle2">New team added</Typography>
              <Typography variant="body2" color="text.secondary">
                You've been added to Product Analytics team
              </Typography>
            </Box>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
