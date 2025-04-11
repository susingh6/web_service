import React, { ReactNode, useState } from 'react';
import { Button, Box, Stack } from '@mui/material';
import BaseModal, { BaseModalProps } from './base-modal';
import FormWrapper from './form-wrapper';
import { z } from 'zod';
import { FieldValues, SubmitHandler } from 'react-hook-form';
import { memo } from 'react';

interface FormModalProps<
  TFormValues extends FieldValues,
  Schema extends z.ZodType<any, any>
> extends Omit<BaseModalProps, 'children' | 'actions'> {
  /**
   * Form schema for validation
   */
  schema: Schema;
  
  /**
   * Default values for the form
   */
  defaultValues?: Partial<TFormValues>;
  
  /**
   * Function to call when the form is submitted
   */
  onSubmit: SubmitHandler<TFormValues>;
  
  /**
   * Form fields to render
   */
  children: ReactNode;
  
  /**
   * Text for the submit button
   */
  submitText?: string;
  
  /**
   * Text for the cancel button
   */
  cancelText?: string;
  
  /**
   * Server error message to display
   */
  serverError?: string | null;
  
  /**
   * Whether the form is submitting
   */
  isSubmitting?: boolean;
  
  /**
   * Additional actions to render in the footer
   */
  additionalActions?: ReactNode;
  
  /**
   * Submit button color
   */
  submitColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
}

/**
 * A modal component specifically designed for forms with standardized validation
 */
function FormModalComponent<
  TFormValues extends FieldValues,
  Schema extends z.ZodType<any, any>
>({
  open,
  onClose,
  title,
  schema,
  defaultValues,
  onSubmit,
  children,
  submitText = 'Save',
  cancelText = 'Cancel',
  serverError,
  isSubmitting = false,
  isLoading = false,
  additionalActions,
  submitColor = 'primary',
  ...rest
}: FormModalProps<TFormValues, Schema>) {
  // Handle form submission with loading state
  const handleSubmit: SubmitHandler<TFormValues> = async (data) => {
    try {
      await onSubmit(data);
    } catch (error) {
      // Error handling is managed by the parent component
      console.error('Form submission error:', error);
    }
  };
  
  // Render form actions (buttons)
  const renderActions = () => (
    <Stack direction="row" spacing={2} alignItems="center">
      {additionalActions}
      <Box sx={{ flex: 1 }} />
      <Button
        onClick={onClose}
        variant="outlined"
        color="inherit"
        disabled={isSubmitting || isLoading}
      >
        {cancelText}
      </Button>
      <Button
        type="submit"
        form="modal-form" // Connect to the form by id
        variant="contained"
        color={submitColor}
        disabled={isSubmitting || isLoading}
      >
        {submitText}
      </Button>
    </Stack>
  );
  
  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={title}
      actions={renderActions()}
      isLoading={isLoading}
      {...rest}
    >
      <FormWrapper
        schema={schema}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        isLoading={isSubmitting}
        serverError={serverError}
        formProps={{ id: 'modal-form' }}
      >
        {children}
      </FormWrapper>
    </BaseModal>
  );
}

// Use memo to prevent unnecessary re-renders
const FormModal = memo(FormModalComponent) as typeof FormModalComponent;

export default FormModal;