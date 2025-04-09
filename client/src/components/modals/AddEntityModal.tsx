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

const validationSchema = yup.object({
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

const AddEntityModal = ({ open, onClose, teams }: AddEntityModalProps) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<EntityType>('table');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
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
    },
  });

  const handleTypeChange = (_event: React.SyntheticEvent, newType: EntityType) => {
    setEntityType(newType);
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
                placeholder={entityType === 'table' ? 'e.g., customer_master' : 'e.g., daily_etl_process'}
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
                placeholder={`Brief description of this ${entityType}`}
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
