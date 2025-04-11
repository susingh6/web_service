import React, { useState } from 'react';
import { Button, CircularProgress, Box, Typography } from '@mui/material';
import BaseModal from './base-modal';
import { memo } from 'react';

export interface ConfirmDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  
  /**
   * Function to close the dialog
   */
  onClose: () => void;
  
  /**
   * Function to call when the user confirms
   */
  onConfirm: () => void | Promise<void>;
  
  /**
   * Dialog title
   */
  title: string;
  
  /**
   * Dialog content/message
   */
  content: string | React.ReactNode;
  
  /**
   * Text for the confirm button
   */
  confirmText?: string;
  
  /**
   * Text for the cancel button
   */
  cancelText?: string;
  
  /**
   * Color for the confirm button
   */
  confirmColor?: 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

/**
 * A reusable confirmation dialog component
 */
function ConfirmDialogComponent({
  open,
  onClose,
  onConfirm,
  title,
  content,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'error',
}: ConfirmDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  
  const handleConfirm = async () => {
    try {
      setIsConfirming(true);
      await onConfirm();
      onClose();
    } finally {
      setIsConfirming(false);
    }
  };
  
  const renderActions = () => (
    <>
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
        startIcon={isConfirming ? <CircularProgress size={16} color="inherit" /> : null}
      >
        {isConfirming ? 'Processing...' : confirmText}
      </Button>
    </>
  );
  
  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={title}
      actions={renderActions()}
      maxWidth="xs"
    >
      {typeof content === 'string' ? (
        <Typography variant="body1">{content}</Typography>
      ) : (
        content
      )}
    </BaseModal>
  );
}

// Memoize the component to prevent unnecessary re-renders
const ConfirmDialog = memo(ConfirmDialogComponent);

export default ConfirmDialog;