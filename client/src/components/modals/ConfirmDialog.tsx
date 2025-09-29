import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success';
}

const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  content,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'error',
}: ConfirmDialogProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  
  const handleConfirm = async () => {
    try {
      setIsConfirming(true);
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle>
        <Typography variant="h6" component="span" fontWeight={600}>
          {title}
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Typography variant="body1">
          {content}
        </Typography>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          color="inherit"
          disabled={isConfirming}
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color={confirmColor}
          disabled={isConfirming}
          startIcon={isConfirming && <CircularProgress size={20} color="inherit" />}
        >
          {isConfirming ? 'Processing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
