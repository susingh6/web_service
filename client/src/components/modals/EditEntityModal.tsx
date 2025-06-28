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
  CircularProgress,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useAppDispatch } from '@/lib/store';
import { fieldDefinitions, tableSchema, dagSchema } from '@/config/schemas';
import { updateEntity } from '@/features/sla/slices/entitiesSlice';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Entity } from '@shared/schema';
import { endpoints, buildUrl } from '@/config';

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

  const entityType: EntityType = entity?.type === 'dag' ? 'dag' : 'table';

  // Create form with dynamic schema
  const currentSchema = entityType === 'table' ? tableSchema : dagSchema;
  
  const form = useForm({
    resolver: yupResolver(currentSchema),
    mode: 'onChange',
  });

  // Pre-populate form with entity data
  useEffect(() => {
    if (entity && open) {
      const baseFormData = {
        tenant_name: entity.tenant_name || '',
        team_name: entity.team_name || '',
        user_email: entity.user_email || '',
        owner_email: entity.ownerEmail || '',
        notification_preferences: entity.notification_preferences || [],
        is_active: entity.is_active !== undefined ? entity.is_active : true,
        donemarker_location: entity.donemarker_location || '',
        donemarker_lookback: entity.donemarker_lookback || 0,
        expected_runtime_minutes: entity.expected_runtime_minutes || 60,
      };

      if (entityType === 'table') {
        const tableFormData = {
          ...baseFormData,
          schema_name: entity.schema_name || '',
          table_name: entity.name || '',
          table_description: entity.description || '',
          table_schedule: entity.refreshFrequency || '',
          table_dependency: entity.table_dependency || '',
        };
        form.reset(tableFormData);
      } else {
        const dagFormData = {
          ...baseFormData,
          dag_name: entity.name || '',
          dag_description: entity.description || '',
          dag_schedule: entity.refreshFrequency || '',
          dag_dependency: Array.isArray(entity.dag_dependency) 
            ? entity.dag_dependency.join(', ') 
            : entity.dag_dependency || '',
        };
        form.reset(dagFormData);
      }
    }
  }, [entity, entityType, form, open]);

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

  const { control, handleSubmit, formState: { errors } } = currentForm;

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
                    name="schema_name"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label={fieldDefinitions.schema_name.label + " *"}
                        fullWidth
                        margin="normal"
                        required
                        placeholder={fieldDefinitions.schema_name.placeholder}
                        error={!!errors.schema_name}
                        helperText={errors.schema_name?.message}
                      />
                    )}
                  />

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
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="secondary">
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          disabled={isLoading}
        >
          {isLoading ? <CircularProgress size={20} /> : 'Edit Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditEntityModal;