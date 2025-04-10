import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

type EntityType = 'table' | 'dag';

interface AddEntityModalProps {
  open: boolean;
  onClose: () => void;
  teams: { id: number; name: string }[];
}

// Common schema fields shared between both forms
const baseSchema = yup.object().shape({
  tenant_name: yup.string().required('Tenant name is required'),
  team_name: yup.string().required('Team name is required'),
  notification_preference: yup.string().optional(),
  user_name: yup.string().required('User name is required'),
  user_email: yup.string().email('Must be a valid email').required('User email is required'),
  is_active: yup.boolean().default(true),
});

// Schema for Tables
const tableSchema = baseSchema.shape({
  schema_name: yup.string().required('Schema name is required'),
  table_name: yup.string().required('Table name is required'),
  table_description: yup.string().optional(),
  table_schedule: yup.string().required('Table schedule is required'),
  expected_runtime_minutes: yup.number().positive('Must be positive').required('Expected runtime is required'),
  table_dependency: yup.string().optional(),
  marker_location: yup.string().optional(),
  marker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
});

// Schema for DAGs
const dagSchema = baseSchema.shape({
  dag_name: yup.string().required('DAG name is required'),
  dag_description: yup.string().optional(),
  dag_schedule: yup.string().required('DAG schedule is required'),
  expected_runtime_minutes: yup.number().positive('Must be positive').required('Expected runtime is required'),
  dag_dependency: yup.string().optional(),
  dag_donemarker_location: yup.string().optional(),
  donemarker_lookback: yup.number().min(0, 'Must be non-negative').optional(),
});

const AddEntityModal = ({ open, onClose, teams }: AddEntityModalProps) => {
  const [entityType, setEntityType] = useState<EntityType>('table');
  
  // Use the appropriate schema based on entity type
  const schema = entityType === 'table' ? tableSchema : dagSchema;
  
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      tenant_name: 'Data Engineering',
      team_name: 'PGM',
      notification_preference: 'email',
      is_active: true,
    },
  });

  const handleChangeEntityType = (_event: React.SyntheticEvent, newValue: EntityType) => {
    if (newValue !== null) {
      setEntityType(newValue);
      reset(); // Reset form when switching entity types
    }
  };

  const onSubmit = async (data: any) => {
    console.log('Form data:', data);
    // Process form submission (API call would happen here)
    
    // Close the modal after successful submission
    onClose();
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Entity</DialogTitle>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <ToggleButtonGroup
              exclusive
              value={entityType}
              onChange={handleChangeEntityType}
              aria-label="entity type"
              fullWidth
            >
              <ToggleButton value="table" aria-label="table entity">
                Table
              </ToggleButton>
              <ToggleButton value="dag" aria-label="dag entity">
                DAG
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Fields marked with an asterisk (*) are mandatory
          </Typography>

          {entityType === 'table' ? (
            /* TABLE FIELDS */
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
                name="schema_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Schema Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.schema_name}
                    helperText={errors.schema_name?.message}
                    placeholder="e.g., public, sales, marketing"
                  />
                )}
              />
              
              <Controller
                name="table_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.table_name}
                    helperText={errors.table_name?.message}
                    placeholder="e.g., customer_master, orders, products"
                  />
                )}
              />
              
              <Controller
                name="table_description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Description"
                    fullWidth
                    margin="normal"
                    multiline
                    rows={3}
                    error={!!errors.table_description}
                    helperText={errors.table_description?.message}
                    placeholder="Brief description of this table"
                  />
                )}
              />
              
              <Controller
                name="table_schedule"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Schedule"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.table_schedule}
                    helperText={errors.table_schedule?.message}
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
                name="table_dependency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Table Dependency"
                    fullWidth
                    margin="normal"
                    error={!!errors.table_dependency}
                    helperText={errors.table_dependency?.message || "Comma-separated list of table names"}
                    placeholder="schema.table1,schema.table2,schema.table3"
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
                name="marker_location"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Marker Location"
                    fullWidth
                    margin="normal"
                    error={!!errors.marker_location}
                    helperText={errors.marker_location?.message}
                    placeholder="s3://bucket/path or hdfs://path"
                  />
                )}
              />
              
              <Controller
                name="marker_lookback"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Marker Lookback"
                    type="number"
                    fullWidth
                    margin="normal"
                    error={!!errors.marker_lookback}
                    helperText={errors.marker_lookback?.message || "Default is 0"}
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