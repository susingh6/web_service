import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  CircularProgress,
  IconButton,
  Typography,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAppDispatch } from '@/lib/store';
import { updateEntity } from '@/features/sla/slices/entitiesSlice';
import { Entity, EntityStatus, RefreshFrequency } from '@/features/sla/types';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface EditEntityModalProps {
  open: boolean;
  onClose: () => void;
  entity: Entity | null;
  teams: { id: number; name: string }[];
}

const validationSchema = yup.object({
  name: yup.string().required('Entity name is required'),
  teamId: yup.number().required('Team is required'),
  description: yup.string(),
  slaTarget: yup
    .number()
    .min(0, 'SLA target must be at least 0')
    .max(100, 'SLA target cannot exceed 100')
    .required('SLA target is required'),
  status: yup.string().required('Status is required'),
  refreshFrequency: yup.string().required('Refresh frequency is required'),
  owner: yup.string(),
  ownerEmail: yup.string().email('Invalid email address'),
});

type FormValues = {
  name: string;
  teamId: number;
  description?: string;
  slaTarget: number;
  status: EntityStatus;
  refreshFrequency: RefreshFrequency;
  owner?: string;
  ownerEmail?: string;
};

const EditEntityModal = ({ open, onClose, entity, teams }: EditEntityModalProps) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      name: '',
      teamId: 0,
      description: '',
      slaTarget: 95,
      status: 'healthy',
      refreshFrequency: 'daily',
      owner: '',
      ownerEmail: '',
    },
  });
  
  // Reset form when entity changes
  useEffect(() => {
    if (entity) {
      reset({
        name: entity.name,
        teamId: entity.teamId,
        description: entity.description || '',
        slaTarget: entity.slaTarget,
        status: entity.status,
        refreshFrequency: entity.refreshFrequency,
        owner: entity.owner || '',
        ownerEmail: entity.ownerEmail || '',
      });
    }
  }, [entity, reset]);
  
  const onSubmit = async (data: FormValues) => {
    if (!entity) return;
    
    try {
      setIsSubmitting(true);
      
      await dispatch(
        updateEntity({
          id: entity.id,
          updates: data,
        })
      ).unwrap();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      
      toast({
        title: 'Success',
        description: `${entity.name} has been updated successfully.`,
        variant: 'default',
      });
      
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to update: ${error}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!entity) {
    return null;
  }
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
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
          Edit Entity
        </Typography>
        <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Entity Type: <strong>{entity.type.toUpperCase()}</strong>
            </Typography>
          </Box>
          
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
            name="status"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth margin="normal" error={!!errors.status}>
                <InputLabel id="status-label">Status</InputLabel>
                <Select
                  {...field}
                  labelId="status-label"
                  label="Status"
                >
                  <MenuItem value="healthy">Healthy</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </Select>
              </FormControl>
            )}
          />
          
          <Controller
            name="refreshFrequency"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth margin="normal" error={!!errors.refreshFrequency}>
                <InputLabel id="refresh-frequency-label">Refresh Frequency</InputLabel>
                <Select
                  {...field}
                  labelId="refresh-frequency-label"
                  label="Refresh Frequency"
                >
                  <MenuItem value="hourly">Hourly</MenuItem>
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                </Select>
              </FormControl>
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
              />
            )}
          />
        </DialogContent>
        
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            startIcon={isSubmitting && <CircularProgress size={20} color="inherit" />}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default EditEntityModal;
