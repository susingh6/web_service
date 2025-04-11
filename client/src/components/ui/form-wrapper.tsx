import React, { ReactNode } from 'react';
import { useForm, FormProvider, SubmitHandler, FieldValues, UseFormProps, SubmitErrorHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertTitle, Box, CircularProgress, Paper } from '@mui/material';

interface FormWrapperProps<
  TFormValues extends FieldValues,
  Schema extends z.ZodType<any, any>
> {
  /**
   * Zod schema for form validation
   */
  schema: Schema;
  
  /**
   * Default values for the form
   */
  defaultValues?: UseFormProps<TFormValues>['defaultValues'];
  
  /**
   * Function to call when form is submitted successfully
   */
  onSubmit: SubmitHandler<TFormValues>;
  
  /**
   * Function to call when form submission has errors
   */
  onError?: SubmitErrorHandler<TFormValues>;
  
  /**
   * Form fields to render
   */
  children: ReactNode;
  
  /**
   * Whether the form is loading/submitting
   */
  isLoading?: boolean;
  
  /**
   * Server-side error message
   */
  serverError?: string | null;
  
  /**
   * Props to pass to the form element
   */
  formProps?: React.FormHTMLAttributes<HTMLFormElement>;
  
  /**
   * Whether to display a loading indicator
   */
  showLoadingIndicator?: boolean;
  
  /**
   * Additional class names
   */
  className?: string;
}

/**
 * A standardized form wrapper component that handles validation with Zod
 * and form state with react-hook-form
 */
function FormWrapper<
  TFormValues extends FieldValues,
  Schema extends z.ZodType<any, any>
>({
  schema,
  defaultValues,
  onSubmit,
  onError,
  children,
  isLoading = false,
  serverError,
  formProps = {},
  showLoadingIndicator = true,
  className,
}: FormWrapperProps<TFormValues, Schema>) {
  // Initialize the form with schema validation
  const methods = useForm<TFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur', // Validate on blur for better UX
  });
  
  return (
    <FormProvider {...methods}>
      <Box
        component="form"
        noValidate
        onSubmit={methods.handleSubmit(onSubmit, onError)}
        className={className}
        sx={{ position: 'relative' }}
        {...formProps}
      >
        {/* Show loading overlay when submitting */}
        {isLoading && showLoadingIndicator && (
          <Box
            sx={{
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              inset: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              zIndex: 10,
              borderRadius: 'inherit',
            }}
          >
            <CircularProgress />
          </Box>
        )}
        
        {/* Display server error if present */}
        {serverError && (
          <Alert 
            severity="error" 
            sx={{ mb: 3 }}
          >
            <AlertTitle>Error</AlertTitle>
            {serverError}
          </Alert>
        )}
        
        {/* Render form fields */}
        {children}
      </Box>
    </FormProvider>
  );
}

export default FormWrapper;