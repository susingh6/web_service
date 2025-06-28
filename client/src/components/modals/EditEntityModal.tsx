import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Typography,
  Box,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  SelectChangeEvent,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { validateTenant, validateTeam, validateDag } from '@/lib/validationUtils';
import { fetchWithCache, getFromCache } from '@/lib/cacheUtils';
import { useAppDispatch } from '@/lib/store';
import { fieldDefinitions, tableSchema, dagSchema } from '@/config/schemas';
import { updateEntity } from '@/features/sla/slices/entitiesSlice';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Entity } from '@shared/schema';
import { endpoints, buildUrl } from '@/config';
import { useQuery } from '@tanstack/react-query';

type EntityType = 'table' | 'dag';

interface EditEntityModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
}

const EditEntityModal = ({ open, onClose, entity, teams }: EditEntityModalProps) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [currentTab, setCurrentTab] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<any[]>([]);

  const entityType: EntityType = entity?.type === 'dag' ? 'dag' : 'table';
  const currentSchema = entityType === 'table' ? tableSchema : dagSchema;

  // Fetch entity details for pre-population
  const { data: entityDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['entity-details', entity?.id],
    queryFn: async () => {
      if (!entity?.id) return null;
      const response = await fetch(buildUrl(endpoints.entity.details(entity.id)));
      if (!response.ok) throw new Error('Failed to fetch entity details');
      return response.json();
    },
    enabled: !!entity?.id && open,
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: yupResolver(currentSchema),
    defaultValues: {
      tenant_name: '',
      team_name: '',
      user_email: '',
      owner_email: '',
      notification_preferences: [],
      is_active: true,
      donemarker_location: '',
      donemarker_lookback: 0,
      expected_runtime_minutes: 60,
      ...(entityType === 'table' ? {
        table_name: '',
        table_description: '',
        table_schedule: '',
        table_dependency: '',
      } : {
        dag_name: '',
        dag_description: '',
        dag_schedule: '',
        dag_dependency: '',
      }),
    },
  });

  // Pre-populate form with entity data
  useEffect(() => {
    if (entity && entityDetails) {
      const formData = {
        tenant_name: entityDetails.tenant_name || entity.tenant || '',
        team_name: entityDetails.team_name || entity.team || '',
        user_email: entityDetails.user_email || entity.user_email || '',
        owner_email: entityDetails.owner_email || entity.owner_email || '',
        notification_preferences: entityDetails.notification_preferences || [],
        is_active: entityDetails.is_active !== undefined ? entityDetails.is_active : entity.is_active !== undefined ? entity.is_active : true,
        donemarker_location: entityDetails.donemarker_location || entity.donemarker_location || '',
        donemarker_lookback: entityDetails.donemarker_lookback || entity.donemarker_lookback || 0,
        expected_runtime_minutes: entityDetails.expected_runtime_minutes || entity.expected_runtime_minutes || 60,
      };

      if (entityType === 'table') {
        Object.assign(formData, {
          table_name: entityDetails.table_name || entity.name || '',
          table_description: entityDetails.table_description || entity.description || '',
          table_schedule: entityDetails.table_schedule || entity.schedule || '',
          table_dependency: entityDetails.table_dependency || entity.dependency || '',
        });
      } else {
        Object.assign(formData, {
          dag_name: entityDetails.dag_name || entity.name || '',
          dag_description: entityDetails.dag_description || entity.description || '',
          dag_schedule: entityDetails.dag_schedule || entity.schedule || '',
          dag_dependency: entityDetails.dag_dependency || entity.dependency || '',
        });
      }

      reset(formData);
      setNotificationSettings(entityDetails.notification_preferences || []);
    }
  }, [entity, entityDetails, entityType, reset]);

  const onSubmit = async (data: any) => {
    if (!entity) return;
    
    setIsLoading(true);
    try {
      const response = await apiRequest('PUT', buildUrl(endpoints.entity.byId(entity.id)), data);
      
      if (response.ok) {
        const updatedEntity = await response.json();
        dispatch(updateEntity(updatedEntity));
        
        toast({
          title: "Success",
          description: `${entityType === 'table' ? 'Table' : 'DAG'} updated successfully`,
        });
        
        queryClient.invalidateQueries({ queryKey: ['entities'] });
        queryClient.invalidateQueries({ queryKey: ['entity-details', entity.id] });
        onClose();
      } else {
        throw new Error('Failed to update entity');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to update ${entityType}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  if (!entity) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '600px' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">
          Edit {entityType === 'table' ? 'Table' : 'DAG'}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {isLoadingDetails ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
            <CircularProgress />
          </Box>
        ) : (
          <Box component="form" onSubmit={handleSubmit(onSubmit)}>
            <Tabs value={currentTab} onChange={handleTabChange} sx={{ mb: 3 }}>
              <Tab label="Basic Information" />
              <Tab label="Advanced Settings" />
            </Tabs>

            {currentTab === 0 && (
              <Box>
                {/* Common Fields */}
                <Controller
                  name="tenant_name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.tenant_name.label + " *"}
                      fullWidth
                      margin="normal"
                      required
                      placeholder={fieldDefinitions.tenant_name.placeholder}
                      error={!!errors.tenant_name}
                      helperText={errors.tenant_name?.message}
                    />
                  )}
                />

                <Controller
                  name="team_name"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth margin="normal" required error={!!errors.team_name}>
                      <InputLabel>{fieldDefinitions.team_name.label} *</InputLabel>
                      <Select
                        {...field}
                        label={fieldDefinitions.team_name.label + " *"}
                      >
                        {teams.map((team) => (
                          <MenuItem key={team.id} value={team.name}>
                            {team.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />

                {/* Entity-specific fields */}
                {entityType === 'table' ? (
                  <>
                    <Controller
                      name="table_name"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={fieldDefinitions.table_name.label + " *"}
                          fullWidth
                          margin="normal"
                          required
                          placeholder={fieldDefinitions.table_name.placeholder}
                          error={!!errors.table_name}
                          helperText={errors.table_name?.message}
                        />
                      )}
                    />

                    <Controller
                      name="table_description"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={fieldDefinitions.table_description.label}
                          fullWidth
                          margin="normal"
                          multiline
                          rows={2}
                          placeholder={fieldDefinitions.table_description.placeholder}
                          error={!!errors.table_description}
                          helperText={errors.table_description?.message}
                        />
                      )}
                    />

                    <Controller
                      name="table_schedule"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={fieldDefinitions.table_schedule.label + " *"}
                          fullWidth
                          margin="normal"
                          required
                          placeholder={fieldDefinitions.table_schedule.placeholder}
                          error={!!errors.table_schedule}
                          helperText={errors.table_schedule?.message}
                        />
                      )}
                    />

                    <Controller
                      name="table_dependency"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={fieldDefinitions.table_dependency.label}
                          fullWidth
                          margin="normal"
                          placeholder={fieldDefinitions.table_dependency.placeholder}
                          error={!!errors.table_dependency}
                          helperText={errors.table_dependency?.message}
                        />
                      )}
                    />
                  </>
                ) : (
                  <>
                    <Controller
                      name="dag_name"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={fieldDefinitions.dag_name.label + " *"}
                          fullWidth
                          margin="normal"
                          required
                          placeholder={fieldDefinitions.dag_name.placeholder}
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
                          label={fieldDefinitions.dag_description.label}
                          fullWidth
                          margin="normal"
                          multiline
                          rows={2}
                          placeholder={fieldDefinitions.dag_description.placeholder}
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
                          label={fieldDefinitions.dag_schedule.label + " *"}
                          fullWidth
                          margin="normal"
                          required
                          placeholder={fieldDefinitions.dag_schedule.placeholder}
                          error={!!errors.dag_schedule}
                          helperText={errors.dag_schedule?.message}
                        />
                      )}
                    />

                    <Controller
                      name="dag_dependency"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label={fieldDefinitions.dag_dependency.label}
                          fullWidth
                          margin="normal"
                          placeholder={fieldDefinitions.dag_dependency.placeholder}
                          error={!!errors.dag_dependency}
                          helperText={errors.dag_dependency?.message}
                        />
                      )}
                    />
                  </>
                )}
              </Box>
            )}

            {currentTab === 1 && (
              <Box>
                <Controller
                  name="user_email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.user_email.label + " *"}
                      fullWidth
                      margin="normal"
                      required
                      type="email"
                      placeholder={fieldDefinitions.user_email.placeholder}
                      error={!!errors.user_email}
                      helperText={errors.user_email?.message}
                    />
                  )}
                />

                <Controller
                  name="owner_email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.owner_email.label + " *"}
                      fullWidth
                      margin="normal"
                      required
                      type="email"
                      placeholder={fieldDefinitions.owner_email.placeholder}
                      error={!!errors.owner_email}
                      helperText={errors.owner_email?.message}
                    />
                  )}
                />

                <Controller
                  name="expected_runtime_minutes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.expected_runtime_minutes.label + " *"}
                      fullWidth
                      margin="normal"
                      required
                      type="number"
                      placeholder={fieldDefinitions.expected_runtime_minutes.placeholder}
                      error={!!errors.expected_runtime_minutes}
                      helperText={errors.expected_runtime_minutes?.message}
                    />
                  )}
                />

                <Controller
                  name="donemarker_location"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.donemarker_location.label + " *"}
                      fullWidth
                      margin="normal"
                      required
                      placeholder={fieldDefinitions.donemarker_location.placeholder}
                      error={!!errors.donemarker_location}
                      helperText={errors.donemarker_location?.message}
                    />
                  )}
                />

                <Controller
                  name="donemarker_lookback"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={fieldDefinitions.donemarker_lookback.label}
                      fullWidth
                      margin="normal"
                      type="number"
                      placeholder={fieldDefinitions.donemarker_lookback.placeholder}
                      error={!!errors.donemarker_lookback}
                      helperText={errors.donemarker_lookback?.message}
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
                        />
                      }
                      label="Is Active"
                      sx={{ mt: 2 }}
                    />
                  )}
                />
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="secondary">
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          disabled={isLoading || isLoadingDetails}
        >
          {isLoading ? <CircularProgress size={20} /> : 'Edit Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditEntityModal;