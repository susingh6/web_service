import { useState, useMemo, useDeferredValue } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Alert,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  Notifications as NotificationsIcon,
  Campaign as CampaignIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Build as BuildIcon,
  Computer as ComputerIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useForm, Controller } from 'react-hook-form';
import { buildUrl, endpoints } from '@/config';

interface Alert {
  id: number;
  title: string;
  message: string;
  alertType: 'info' | 'warning' | 'maintenance' | 'system';
  severity: 'low' | 'medium' | 'high';
  dateKey: string;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminBroadcastMessage {
  id: number;
  message: string;
  dateKey: string;
  deliveryType: 'immediate' | 'login_triggered';
  isActive: boolean;
  createdByUserId: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AlertFormData {
  title: string;
  message: string;
  alertType: 'system' | 'maintenance' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  expiresInHours: number;
}

interface AdminMessageFormData {
  message: string;
  deliveryType: 'immediate' | 'login_triggered';
  expiresInDays: number;
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

const NotificationsManagement = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // React Hook Form for alerts
  const alertForm = useForm<AlertFormData>({
    defaultValues: {
      title: '',
      message: '',
      alertType: 'info',
      severity: 'low',
      expiresInHours: 24,
    }
  });

  // React Hook Form for admin messages
  const messageForm = useForm<AdminMessageFormData>({
    defaultValues: {
      message: '',
      deliveryType: 'login_triggered',
      expiresInDays: 7,
    }
  });

  // Fetch alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery<Alert[]>({
    queryKey: ['admin', 'alerts'],
    queryFn: async () => {
      const response = await fetch(buildUrl('/api/v1/alerts'), {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('Failed to fetch alerts');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch admin broadcast messages
  const { data: adminMessages = [], isLoading: messagesLoading } = useQuery<AdminBroadcastMessage[]>({
    queryKey: ['admin', 'broadcast-messages'],
    queryFn: async () => {
      const response = await fetch(buildUrl('/api/v1/admin/broadcast-messages'), {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('Failed to fetch admin messages');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create alert mutation
  const createAlertMutation = useMutation({
    mutationFn: async (data: AlertFormData) => {
      const expiresAtDate = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
      const alertData = {
        title: data.title,
        message: data.message,
        alertType: data.alertType,
        severity: data.severity,
        dateKey: new Date().toISOString().split('T')[0],
        isActive: true,
        expiresAt: expiresAtDate.toISOString(),
      };

      console.log('Creating alert with data:', alertData);

      const response = await fetch(buildUrl('/api/v1/alerts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': localStorage.getItem('fastapi_session_id') || '',
        },
        body: JSON.stringify(alertData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Alert creation failed:', errorData);
        throw new Error(`Failed to create alert: ${JSON.stringify(errorData)}`);
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both admin panel and header notification caches
      queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'alerts'] });
      toast({ title: 'Success', description: 'Alert created successfully' });
      setAlertDialogOpen(false);
      alertForm.reset();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create alert', variant: 'destructive' });
    }
  });

  // Create admin message mutation
  const createMessageMutation = useMutation({
    mutationFn: async (data: AdminMessageFormData) => {
      const messageData = {
        message: data.message,
        dateKey: new Date().toISOString().split('T')[0],
        deliveryType: data.deliveryType,
        isActive: true,
        createdByUserId: 1, // Will be replaced with actual user ID from session
        expiresAt: new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await fetch(buildUrl('/api/v1/admin/broadcast-messages'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': localStorage.getItem('fastapi_session_id') || '',
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) throw new Error('Failed to create admin message');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'broadcast-messages'] });
      toast({ title: 'Success', description: 'Admin message created successfully' });
      setMessageDialogOpen(false);
      messageForm.reset();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create admin message', variant: 'destructive' });
    }
  });

  // Deactivate alert mutation
  const deactivateAlertMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await fetch(buildUrl(`/api/v1/alerts/${alertId}`), {
        method: 'DELETE',
        headers: {
          'X-Session-ID': localStorage.getItem('fastapi_session_id') || '',
        },
      });
      if (!response.ok) throw new Error('Failed to deactivate alert');
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both admin panel and header notification caches
      queryClient.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'alerts'] });
      toast({ title: 'Success', description: 'Alert deactivated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to deactivate alert', variant: 'destructive' });
    }
  });

  // Deactivate admin message mutation
  const deactivateMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const response = await fetch(buildUrl(`/api/v1/admin/broadcast-messages/${messageId}`), {
        method: 'DELETE',
        headers: {
          'X-Session-ID': localStorage.getItem('fastapi_session_id') || '',
        },
      });
      if (!response.ok) throw new Error('Failed to deactivate admin message');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'broadcast-messages'] });
      toast({ title: 'Success', description: 'Admin message deactivated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to deactivate admin message', variant: 'destructive' });
    }
  });

  // Filter alerts based on search
  const filteredAlerts = useMemo(() => {
    if (!deferredSearchQuery.trim()) return alerts;
    const query = deferredSearchQuery.toLowerCase();
    return alerts.filter(alert => 
      alert.title.toLowerCase().includes(query) ||
      alert.message.toLowerCase().includes(query) ||
      alert.alertType.toLowerCase().includes(query)
    );
  }, [alerts, deferredSearchQuery]);

  // Filter admin messages based on search
  const filteredMessages = useMemo(() => {
    if (!deferredSearchQuery.trim()) return adminMessages;
    const query = deferredSearchQuery.toLowerCase();
    return adminMessages.filter(message => 
      message.message.toLowerCase().includes(query) ||
      message.deliveryType.toLowerCase().includes(query)
    );
  }, [adminMessages, deferredSearchQuery]);

  const handleCreateAlert = (data: AlertFormData) => {
    createAlertMutation.mutate(data);
  };

  const handleCreateMessage = (data: AdminMessageFormData) => {
    createMessageMutation.mutate(data);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NotificationsIcon color="primary" />
              Notifications Management
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setAlertDialogOpen(true)}
                data-testid="button-create-alert"
              >
                Create Alert
              </Button>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<CampaignIcon />}
                onClick={() => setMessageDialogOpen(true)}
                data-testid="button-create-broadcast"
              >
                Create Broadcast
              </Button>
            </Box>
          </Box>

          {/* Search Bar */}
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              data-testid="input-search-notifications"
            />
          </Box>

          {/* Tabs */}
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
            <Tab label={`System Alerts (${filteredAlerts.length})`} data-testid="tab-system-alerts" />
            <Tab label={`Admin Messages (${filteredMessages.length})`} data-testid="tab-admin-messages" />
          </Tabs>

          {/* System Alerts Tab */}
          {activeTab === 0 && (
            <Box>
              <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Severity</TableCell>
                      <TableCell>Message</TableCell>
                      <TableCell>Expires</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredAlerts
                      .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      .map((alert) => {
                        const IconComponent = AlertTypeIcons[alert.alertType];
                        return (
                          <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <IconComponent fontSize="small" />
                                {alert.title}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={alert.alertType} 
                                color={getAlertTypeColor(alert.alertType) as any}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={alert.severity} 
                                color={getSeverityColor(alert.severity) as any}
                                size="small"
                              />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 300 }}>
                              <Typography variant="body2" noWrap>
                                {alert.message}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {alert.expiresAt ? new Date(alert.expiresAt).toLocaleString() : 'Never'}
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={alert.isActive ? 'Active' : 'Inactive'}
                                color={alert.isActive ? 'success' : 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              {alert.isActive && (
                                <IconButton
                                  size="small"
                                  onClick={() => deactivateAlertMutation.mutate(alert.id)}
                                  disabled={deactivateAlertMutation.isPending}
                                  data-testid={`button-deactivate-alert-${alert.id}`}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filteredAlerts.length}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
              />
            </Box>
          )}

          {/* Admin Messages Tab */}
          {activeTab === 1 && (
            <Box>
              <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Message</TableCell>
                      <TableCell>Delivery Type</TableCell>
                      <TableCell>Expires</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMessages
                      .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      .map((message) => (
                        <TableRow key={message.id} data-testid={`row-message-${message.id}`}>
                          <TableCell sx={{ maxWidth: 400 }}>
                            <Typography variant="body2">
                              {message.message}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={message.deliveryType === 'immediate' ? 'Immediate' : 'Login Triggered'}
                              color={message.deliveryType === 'immediate' ? 'warning' : 'info'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            {message.expiresAt ? new Date(message.expiresAt).toLocaleString() : 'Never'}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={message.isActive ? 'Active' : 'Inactive'}
                              color={message.isActive ? 'success' : 'default'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            {new Date(message.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {message.isActive && (
                              <IconButton
                                size="small"
                                onClick={() => deactivateMessageMutation.mutate(message.id)}
                                disabled={deactivateMessageMutation.isPending}
                                data-testid={`button-deactivate-message-${message.id}`}
                              >
                                <DeleteIcon />
                              </IconButton>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filteredMessages.length}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Create Alert Dialog */}
      <Dialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create System Alert</DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Alert severity="info">
              System alerts are displayed to all users via the notification bell icon.
            </Alert>
            
            <Controller
              name="title"
              control={alertForm.control}
              rules={{ required: 'Title is required' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Alert Title"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  data-testid="input-alert-title"
                />
              )}
            />

            <Controller
              name="message"
              control={alertForm.control}
              rules={{ required: 'Message is required' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Alert Message"
                  multiline
                  rows={3}
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  data-testid="input-alert-message"
                />
              )}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Controller
                name="alertType"
                control={alertForm.control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Alert Type</InputLabel>
                    <Select {...field} label="Alert Type" data-testid="select-alert-type">
                      <MenuItem value="info">Info</MenuItem>
                      <MenuItem value="warning">Warning</MenuItem>
                      <MenuItem value="maintenance">Maintenance</MenuItem>
                      <MenuItem value="system">System</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />

              <Controller
                name="severity"
                control={alertForm.control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Severity</InputLabel>
                    <Select {...field} label="Severity" data-testid="select-alert-severity">
                      <MenuItem value="low">Low</MenuItem>
                      <MenuItem value="medium">Medium</MenuItem>
                      <MenuItem value="high">High</MenuItem>
                      <MenuItem value="critical">Critical</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Box>

            <Controller
              name="expiresInHours"
              control={alertForm.control}
              rules={{ required: 'Expiration time is required', min: { value: 1, message: 'Must be at least 1 hour' } }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Expires in (hours)"
                  type="number"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  data-testid="input-alert-expires"
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlertDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={alertForm.handleSubmit(handleCreateAlert)}
            variant="contained"
            disabled={createAlertMutation.isPending}
            data-testid="button-save-alert"
          >
            Create Alert
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Admin Message Dialog */}
      <Dialog open={messageDialogOpen} onClose={() => setMessageDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create Admin Broadcast Message</DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Alert severity="info">
              Admin broadcast messages appear as pop-ups to users with "Message from Admin" title.
            </Alert>
            
            <Controller
              name="message"
              control={messageForm.control}
              rules={{ required: 'Message is required' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Broadcast Message"
                  multiline
                  rows={4}
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  data-testid="input-broadcast-message"
                />
              )}
            />

            <Controller
              name="deliveryType"
              control={messageForm.control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Delivery Type</InputLabel>
                  <Select {...field} label="Delivery Type" data-testid="select-delivery-type">
                    <MenuItem value="immediate">Immediate (show to all currently logged-in users)</MenuItem>
                    <MenuItem value="login_triggered">Login Triggered (show when users log in)</MenuItem>
                  </Select>
                  <FormHelperText>
                    Immediate messages are shown right away to logged-in users. Login-triggered messages appear when users next log in.
                  </FormHelperText>
                </FormControl>
              )}
            />

            <Controller
              name="expiresInDays"
              control={messageForm.control}
              rules={{ required: 'Expiration time is required', min: { value: 1, message: 'Must be at least 1 day' } }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Expires in (days)"
                  type="number"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  data-testid="input-broadcast-expires"
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={messageForm.handleSubmit(handleCreateMessage)}
            variant="contained"
            disabled={createMessageMutation.isPending}
            data-testid="button-save-broadcast"
          >
            Create Message
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NotificationsManagement;