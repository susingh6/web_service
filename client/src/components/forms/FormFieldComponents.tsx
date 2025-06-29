/**
 * Centralized form field components to eliminate duplicate rendering patterns
 * across AddEntityModal, EditEntityModal, and other forms
 */

import React from 'react';
import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  TextField,
  Autocomplete,
  CircularProgress,
  FormControlLabel,
  Switch
} from '@mui/material';
import { fieldDefinitions } from '@/config/schemas';

interface FormFieldProps {
  name: string;
  control: Control<any>;
  errors: FieldErrors;
  required?: boolean;
  disabled?: boolean;
}

interface AutocompleteFieldProps extends FormFieldProps {
  options: string[];
  loading?: boolean;
  onFetchOptions?: () => void;
}

/**
 * Standardized text field component with centralized field definitions
 */
export const StandardTextField: React.FC<FormFieldProps> = ({
  name,
  control,
  errors,
  required,
  disabled
}) => {
  const fieldDef = fieldDefinitions[name as keyof typeof fieldDefinitions];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          label={fieldDef?.label + (required ? " *" : "")}
          type={fieldDef?.type || 'text'}
          placeholder={fieldDef?.placeholder}
          fullWidth
          margin="normal"
          required={required}
          disabled={disabled}
          error={!!errors[name]}
          helperText={errors[name]?.message}
          inputProps={fieldDef?.type === 'number' ? { min: 0 } : undefined}
        />
      )}
    />
  );
};

/**
 * Standardized autocomplete field component with loading states
 */
export const StandardAutocompleteField: React.FC<AutocompleteFieldProps> = ({
  name,
  control,
  errors,
  options,
  loading = false,
  onFetchOptions,
  required,
  disabled
}) => {
  const fieldDef = fieldDefinitions[name as keyof typeof fieldDefinitions];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value, onBlur } }) => (
        <Autocomplete
          value={value || ''}
          onChange={(_, newValue) => onChange(newValue)}
          onInputChange={(_, newInputValue, reason) => {
            if (reason === 'input' && newInputValue.trim() !== '' && onFetchOptions) {
              // Trigger options fetch only when needed
            }
          }}
          freeSolo
          options={options}
          loading={loading}
          disabled={disabled}
          renderInput={(params) => (
            <TextField
              {...params}
              label={fieldDef?.label + (required ? " *" : "")}
              required={required}
              fullWidth
              margin="normal"
              error={!!errors[name]}
              helperText={errors[name]?.message}
              onBlur={onBlur}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress color="inherit" size={20} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      )}
    />
  );
};

/**
 * Standardized switch field component
 */
export const StandardSwitchField: React.FC<FormFieldProps & { label?: string }> = ({
  name,
  control,
  label = "Active",
  disabled
}) => {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(field.value)}
              onChange={field.onChange}
              color="primary"
              disabled={disabled}
            />
          }
          label={label}
          sx={{ mt: 2 }}
        />
      )}
    />
  );
};