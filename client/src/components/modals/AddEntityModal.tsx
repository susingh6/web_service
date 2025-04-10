import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Tab,
  Tabs,
  Box,
  CircularProgress,
  IconButton,
  Typography,
  InputAdornment,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAppDispatch } from '@/lib/store';
import { createEntity } from '@/features/sla/slices/entitiesSlice';
import { CreateEntityPayload, EntityType, RefreshFrequency } from '@/features/sla/types';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AddEntityModalProps {
  open: boolean;
  onClose: () => void;
  teams: { id: number; name: string }[];
}

const tableValidationSchema = yup.object({
  name: yup.string().required('Entity name is required'),
  teamId: yup.number().required('Team is required'),
  description: yup.string(),
  slaTarget: yup
    .number()
    .min(0, 'SLA target must be at least 0')
    .max(100, 'SLA target cannot exceed 100')
    .required('SLA target is required'),
  refreshFrequency: yup.string().required('Refresh frequency is required'),
  owner: yup.string(),
  ownerEmail: yup.string().email('Invalid email address'),
});

const dagValidationSchema = yup.object({
  name: yup.string().required('Entity name is required'),
  teamId: yup.number().required('Team is required'),
  description: yup.string(),
  slaTarget: yup
    .number()
    .min(0, 'SLA target must be at least 0')
    .max(100, 'SLA target cannot exceed 100')
    .required('SLA target is required'),
  refreshFrequency: yup.string().required('Refresh frequency is required'),

  // DAG-specific required fields
  tenant_name: yup.string().required('Tenant name is required'),
  team_name: yup.string().required('Team name is required'),
  dag_name: yup.string().required('DAG name is required'),
  dag_schedule: yup.string().required('DAG schedule is required'),
  expected_runtime_minutes: yup.number().required('Expected runtime is required').min(1, 'Must be at least 1 minute'),
  user_name: yup.string().required('User name is required'),
  user_email: yup.string().required('User email is required').email('Invalid email address'),
  
  // Optional DAG fields
  dag_description: yup.string(),
  dag_donemarker_location: yup.string(),
  dag_dependency: yup.mixed(),
  notify_preference_id: yup.mixed(),
  is_active: yup.boolean().default(true),
  donemarker_lookback: yup.number().default(0),
});

const AddEntityModal = ({ open, onClose, teams }: AddEntityModalProps) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<EntityType>('table');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use state to track which validation schema to use
  const [validationSchema, setValidationSchema] = useState(tableValidationSchema);
  
  // Setup form with the current validation schema
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
  } = useForm<CreateEntityPayload>({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      name: '',
      teamId: teams.length > 0 ? teams[0].id : 0,
      description: '',
      slaTarget: 95,
      status: 'healthy',
      refreshFrequency: 'daily',
      owner: '',
      ownerEmail: '',
      // DAG specific defaults
      tenant_name: '',
      team_name: teams.length > 0 ? teams[0].name : '',
      dag_name: '',
      dag_description: '',
      dag_schedule: '',
      expected_runtime_minutes: 60,
      is_active: true,
      donemarker_lookback: 0,
      user_name: '',
      user_email: '',
    },
  });

  const handleTypeChange = (_event: React.SyntheticEvent, newType: EntityType) => {
    setEntityType(newType);
    
    // Set the appropriate validation schema based on entity type
    setValidationSchema(newType === 'dag' ? dagValidationSchema : tableValidationSchema);
    
    // Reset the form with new validation schema and default values
    reset({
      name: '',
      teamId: teams.length > 0 ? teams[0].id : 0,
      description: '',
      slaTarget: 95,
      status: 'healthy',
      refreshFrequency: 'daily',
      owner: '',
      ownerEmail: '',
      // DAG specific defaults
      tenant_name: '',
      team_name: teams.length > 0 ? teams[0].name : '',
      dag_name: '',
      dag_description: '',
      dag_schedule: '',
      expected_runtime_minutes: 60,
      is_active: true,
      donemarker_lookback: 0,
      user_name: '',
      user_email: '',
    });
  };

  const onSubmit = async (data: CreateEntityPayload) => {
    try {
      setIsSubmitting(true);
      
      // Add the entity type to the data
      const entityData = {
        ...data,
        type: entityType,
      };
      
      await dispatch(createEntity(entityData)).unwrap();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      
      toast({
        title: 'Success',
        description: `${entityType === 'table' ? 'Table' : 'DAG'} has been added successfully.`,
        variant: 'default',
      });
      
      reset();
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to add ${entityType}: ${error}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" fontWeight={600} fontFamily="Inter, sans-serif">
          Add New Entity
        </Typography>
        <IconButton edge="end" color="inherit" onClick={handleClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <Box sx={{ px: 3, pt: 0, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={entityType} onChange={handleTypeChange}>
          <Tab 
            label="Table" 
            value="table" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
          <Tab 
            label="DAG" 
            value="dag" 
            sx={{ 
              fontWeight: 500, 
              textTransform: 'none',
              '&.Mui-selected': { fontWeight: 600 } 
            }} 
          />
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

          {/* Table form fields - shown only when Table is selected */}
          {entityType === 'table' ? (
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
            /* DAG-specific fields - shown only when DAG is selected */
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
                    placeholder="e.g., daily_etl_process"
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
                name="tenant_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Tenant Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.tenant_name}
                    helperText={errors.tenant_name?.message}
                  />
                )}
              />
              
              <Controller
                name="team_name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Team Name"
                    fullWidth
                    margin="normal"
                    required
                    error={!!errors.team_name}
                    helperText={errors.team_name?.message}
                  />
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
                        checked={field.value}
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
