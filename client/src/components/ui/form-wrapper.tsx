import React, { ReactNode } from 'react';
import {
  useForm,
  UseFormProps,
  UseFormReturn,
  FieldValues,
  SubmitHandler,
  FormProvider,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Box } from '@mui/material';
import { memo } from 'react';

interface FormWrapperProps<TFormValues extends FieldValues, Schema extends z.ZodType<any, any>> {
  /**
   * Zod schema for validation
   */
  schema: Schema;
  
  /**
   * Default values for the form
   */
  defaultValues?: UseFormProps<TFormValues>['defaultValues'];
  
  /**
   * Form submission handler
   */
  onSubmit: SubmitHandler<TFormValues>;
  
  /**
   * Children can be a render function that receives form methods
   */
  children: ((methods: UseFormReturn<TFormValues>) => ReactNode) | ReactNode;
  
  /**
   * Additional form props
   */
  formProps?: React.FormHTMLAttributes<HTMLFormElement>;
  
  /**
   * Loading state of the form
   */
  isLoading?: boolean;
  
  /**
   * Server-side error message
   */
  serverError?: string | null;
}

/**
 * A wrapper component that standardizes form handling with react-hook-form and zod validation
 */
function FormWrapperComponent<
  TFormValues extends FieldValues,
  Schema extends z.ZodType<any, any>
>({
  schema,
  defaultValues,
  onSubmit,
  children,
  formProps,
  isLoading = false,
  serverError,
}: FormWrapperProps<TFormValues, Schema>) {
  // Initialize form with zod resolver and default values
  const methods = useForm<TFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur', // Validate on blur for better UX
  });

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        {...formProps}
      >
        {/* Server error display */}
        {serverError && (
          <Box mb={3}>
            <Alert severity="error">{serverError}</Alert>
          </Box>
        )}
        
        {/* Children can be a render function that receives form methods */}
        {typeof children === 'function' ? children(methods) : children}
      </form>
    </FormProvider>
  );
}

// Use memo to prevent unnecessary re-renders
const FormWrapper = memo(
  FormWrapperComponent,
  (prevProps, nextProps) => {
    // Only re-render if any of these props change
    return (
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.serverError === nextProps.serverError &&
      prevProps.defaultValues === nextProps.defaultValues
    );
  }
) as typeof FormWrapperComponent;

export default FormWrapper;