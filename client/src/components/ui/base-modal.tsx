import React, { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogActions, CircularProgress } from '@mui/material';
import { memo } from 'react';

export interface BaseModalProps {
  /**
   * Whether the modal is open
   */
  open: boolean;
  
  /**
   * Function to close the modal
   */
  onClose: () => void;
  
  /**
   * Modal title
   */
  title: ReactNode;
  
  /**
   * Modal content
   */
  children: ReactNode;
  
  /**
   * Modal footer/actions
   */
  actions?: ReactNode;
  
  /**
   * Whether the modal is in a loading state
   */
  isLoading?: boolean;
  
  /**
   * Maximum width of the modal
   */
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  
  /**
   * Whether the modal should take up the full width
   */
  fullWidth?: boolean;
  
  /**
   * Additional props to pass to the Dialog component
   */
  dialogProps?: Record<string, any>;

  /**
   * Custom styles for the dialog paper
   */
  paperStyles?: Record<string, any>;
}

/**
 * Base Modal component that serves as a foundation for all modals in the application
 */
function BaseModalComponent({
  open,
  onClose,
  title,
  children,
  actions,
  isLoading = false,
  maxWidth = 'sm',
  fullWidth = true,
  dialogProps = {},
  paperStyles = { borderRadius: 2 },
}: BaseModalProps) {
  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      PaperProps={{
        sx: paperStyles,
        elevation: 3,
      }}
      {...dialogProps}
    >
      {/* Modal Title */}
      {title && (
        <DialogTitle sx={{ pt: 2.5, pb: 2 }}>
          {typeof title === 'string' ? (
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{title}</span>
              {isLoading && <CircularProgress size={20} />}
            </div>
          ) : (
            title
          )}
        </DialogTitle>
      )}
      
      {/* Modal Content */}
      <DialogContent sx={{ px: 3, py: 2 }}>
        {/* Display a loading overlay if needed */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
            <CircularProgress />
          </div>
        )}
        
        {/* Render children */}
        {children}
      </DialogContent>
      
      {/* Modal Actions */}
      {actions && (
        <DialogActions sx={{ px: 3, py: 2.5 }}>
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
}

// Memoize the component to prevent unnecessary re-renders
const BaseModal = memo(BaseModalComponent);

export default BaseModal;