import React, { useState } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  TextField, 
  Button,
  Box,
  Tabs,
  Tab,
  MenuItem,
  InputAdornment,
  CircularProgress,
  Typography,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  Select
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Close as CloseIcon } from '@mui/icons-material';
import { useToast } from '@/hooks/use-toast';

type EntityType = 'table' | 'dag';

interface AddEntityModalProps {
  open: boolean;
  onClose: () => void;
  teams: { id: number; name: string }[];
}

const tableSchema = yup.object({
  name: yup.string().required('Entity name is required'),
  teamId: yup.number().required('Team is required'),
  description: yup.string(),
  slaTarget: yup.number().required('SLA target is required').min(0).max(100),
  refreshFrequency: yup.string().required('Refresh frequency is required'),
  owner: yup.string(),
  ownerEmail: yup.string().email('Must be a valid email address'),
});

const dagSchema = yup.object({
  name: yup.string().required('Entity name is required'),
  teamId: yup.number().required('Team is required'),
  tenant_name: yup.string().required('Tenant name is required'),
  team_name: yup.string().required('Team name is required'),
  dag_name: yup.string().required('DAG name is required'),
  dag_description: yup.string(),
  dag_schedule: yup.string().required('DAG schedule is required'),
  expected_runtime_minutes: yup.number().required('Expected runtime is required').min(1),
  dag_donemarker_location: yup.string(),
  donemarker_lookback: yup.number().default(0),
  user_name: yup.string().required('User name is required'),
  user_email: yup.string().required('User email is required').email('Must be a valid email address'),
  is_active: yup.boolean().default(true),
  dag_dependency: yup.string(),
  notification_preference: yup.string()
});

const AddEntityModal = ({ open, onClose, teams }: AddEntityModalProps) => {
  const [entityType, setEntityType] = useState<EntityType>('table');
  const { toast } = useToast();
  
  const schema = entityType === 'table' ? tableSchema : dagSchema;
  
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      name: '',
      teamId: teams.length > 0 ? teams[0].id : 0,
      description: '',
      slaTarget: 99.9,
      refreshFrequency: 'daily',
      owner: '',
      ownerEmail: '',
      tenant_name: '',
      team_name: '',
      dag_name: '',
      dag_description: '',
      dag_schedule: '0 0 * * *',
      expected_runtime_minutes: 60,
      dag_donemarker_location: '',
      donemarker_lookback: 0,
      user_name: '',
      user_email: '',
      is_active: true,
      dag_dependency: '',
      notification_preference: 'email'
    }
  });
  
  const handleChangeEntityType = (_event: React.SyntheticEvent, newValue: EntityType) => {
    setEntityType(newValue);
  };
  
  const handleClose = () => {
    reset();
    onClose();
  };
  
  const onSubmit = async (data: any) => {
    try {
      // In a real app, you would send this data to your backend
      console.log('Form submitted:', data);
      console.log('Entity type:', entityType);
      
      toast({
        title: 'Entity added',
        description: `${data.name} has been added successfully.`,
      });
      
      handleClose();
    } catch (error: any) {
      toast({
        title: 'Error adding entity',
        description: error.message,
        variant: 'destructive',
      });
    }
  };
  
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ 
        borderBottom: '1px solid', 
        borderColor: 'divider',
        fontWeight: 600,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        Add New {entityType === 'table' ? 'Table' : 'DAG'}
        <Button 
          onClick={handleClose}
          sx={{ minWidth: 'auto', p: 0.5 }}
          color="inherit"
        >
          <CloseIcon />
        </Button>
      </DialogTitle>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={entityType}
          onChange={handleChangeEntityType}
          aria-label="entity type tabs"
          sx={{ px: 3 }}
        >
          <Tab value="table" label="Table" id="entity-type-tab-0" />
          <Tab value="dag" label="DAG" id="entity-type-tab-1" />
        </Tabs>
      </Box>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ mb: 2, fontStyle: 'italic' }}
          >
            Fields marked with an asterisk (*) are mandatory
          </Typography>

          {entityType === 'table' ? (
            /* TABLE FIELDS */
            <>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Entity Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    placeholder="e.g., customer_master"
                  />
                )}
              />
              
              <Controller
                name="teamId"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Team"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.teamId}
                    helperText={errors.teamId?.message}
                  >
                    {teams.map((team) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Description"
                    fullWidth
                    margin="normal"
                    multiline
                    rows={3}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                    placeholder="Brief description of this table"
                  />
                )}
              />
              
              <Controller
                name="slaTarget"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="SLA Target"
                    type="number"
                    fullWidth
                    margin="normal"
                    required
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                    inputProps={{
                      min: 0,
                      max: 100,
                      step: 0.1,
                    }}
                    error={!!errors.slaTarget}
                    helperText={errors.slaTarget?.message}
                  />
                )}
              />
              
              <Controller
                name="refreshFrequency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Refresh Frequency"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.refreshFrequency}
                    helperText={errors.refreshFrequency?.message}
                  >
                    <MenuItem value="hourly">Hourly</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </TextField>
                )}
              />
              
              <Controller
                name="owner"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Owner"
                    fullWidth
                    margin="normal"
                    error={!!errors.owner}
                    helperText={errors.owner?.message}
                    placeholder="Name of the responsible person"
                  />
                )}
              />
              
              <Controller
                name="ownerEmail"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Owner Email"
                    fullWidth
                    margin="normal"
                    error={!!errors.ownerEmail}
                    helperText={errors.ownerEmail?.message}
                    placeholder="email@company.com"
                  />
                )}
              />
            </>
          ) : (
            /* DAG FIELDS */
            <>
              <Controller
                name="tenant_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Tenant Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.tenant_name}
                    helperText={errors.tenant_name?.message}
                  >
                    <MenuItem value="Ad Engineering">Ad Engineering</MenuItem>
                    <MenuItem value="Data Engineering">Data Engineering</MenuItem>
                  </TextField>
                )}
              />
              
              <Controller
                name="team_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Team Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.team_name}
                    helperText={errors.team_name?.message}
                  >
                    <MenuItem value="PGM">PGM</MenuItem>
                    <MenuItem value="Core">Core</MenuItem>
                    <MenuItem value="Viewer Product">Viewer Product</MenuItem>
                    <MenuItem value="IOT">IOT</MenuItem>
                    <MenuItem value="CDM">CDM</MenuItem>
                  </TextField>
                )}
              />
              
              <Controller
                name="dag_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.dag_name}
                    helperText={errors.dag_name?.message}
                  />
                )}
              />
              
              <Controller
                name="dag_description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Description"
                    fullWidth
                    margin="normal"
                    multiline
                    rows={2}
                    error={!!errors.dag_description}
                    helperText={errors.dag_description?.message}
                  />
                )}
              />
              
              <Controller
                name="dag_schedule"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Schedule"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.dag_schedule}
                    helperText={errors.dag_schedule?.message}
                    placeholder="* * * * * (cron format)"
                  />
                )}
              />
              
              <Controller
                name="expected_runtime_minutes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Expected Runtime (minutes)"
                    type="number"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.expected_runtime_minutes}
                    helperText={errors.expected_runtime_minutes?.message}
                    inputProps={{ min: 1 }}
                  />
                )}
              />
              
              <Controller
                name="dag_dependency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="DAG Dependency"
                    fullWidth
                    margin="normal"
                    error={!!errors.dag_dependency}
                    helperText={errors.dag_dependency?.message || "Comma-separated list of DAG names"}
                    placeholder="dag1,dag2,dag3"
                  />
                )}
              />
              
              <Controller
                name="notification_preference"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Notification Preference"
                    fullWidth
                    margin="normal"
                    error={!!errors.notification_preference}
                    helperText={errors.notification_preference?.message}
                  >
                    <MenuItem value="email">Email</MenuItem>
                    <MenuItem value="slack">Slack</MenuItem>
                    <MenuItem value="pagerduty">Pagerduty</MenuItem>
                    <MenuItem value="none">None</MenuItem>
                  </TextField>
                )}
              />
              
              <Controller
                name="dag_donemarker_location"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Done Marker Location"
                    fullWidth
                    margin="normal"
                    error={!!errors.dag_donemarker_location}
                    helperText={errors.dag_donemarker_location?.message}
                    placeholder="s3://bucket/path or hdfs://path"
                  />
                )}
              />
              
              <Controller
                name="donemarker_lookback"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Done Marker Lookback"
                    type="number"
                    fullWidth
                    margin="normal"
                    error={!!errors.donemarker_lookback}
                    helperText={errors.donemarker_lookback?.message || "Default is 0"}
                    inputProps={{ min: 0 }}
                  />
                )}
              />
              
              <Controller
                name="user_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="User Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.user_name}
                    helperText={errors.user_name?.message}
                  />
                )}
              />
              
              <Controller
                name="user_email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="User Email"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.user_email}
                    helperText={errors.user_email?.message}
                    placeholder="user@example.com"
                  />
                )}
              />
              
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                        color="primary"
                      />
                    }
                    label="Active"
                    sx={{ mt: 2 }}
                  />
                )}
              />
            </>
          )}
        </DialogContent>
        
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            startIcon={isSubmitting && <CircularProgress size={20} color="inherit" />}
          >
            {isSubmitting ? 'Adding...' : 'Add Entity'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AddEntityModal;