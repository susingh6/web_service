import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import {
  TextField,
  Checkbox,
  FormControlLabel,
  FormControl,
  FormHelperText,
  Select,
  MenuItem,
  InputLabel,
  Switch,
  Autocomplete,
  FormGroup,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { memo } from 'react';

// ----- Text Field -----
interface FormTextFieldProps {
  name: string;
  label: string;
  placeholder?: string;
  helperText?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  multiline?: boolean;
  rows?: number;
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
}

export const FormTextField = memo(function FormTextField({
  name,
  label,
  placeholder,
  helperText,
  type = 'text',
  required = false,
  disabled = false,
  fullWidth = true,
  multiline = false,
  rows = 1,
  variant = 'outlined',
  size = 'small',
}: FormTextFieldProps) {
  const { control, formState: { errors } } = useFormContext();
  const error = errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          label={label}
          placeholder={placeholder}
          helperText={error ? String(error.message) : helperText}
          error={!!error}
          type={type}
          required={required}
          disabled={disabled}
          fullWidth={fullWidth}
          multiline={multiline}
          rows={rows}
          variant={variant}
          size={size}
        />
      )}
    />
  );
});

// ----- Checkbox Field -----
interface FormCheckboxProps {
  name: string;
  label: string;
  helperText?: string;
  disabled?: boolean;
}

export const FormCheckbox = memo(function FormCheckbox({
  name,
  label,
  helperText,
  disabled = false,
}: FormCheckboxProps) {
  const { control, formState: { errors } } = useFormContext();
  const error = errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value, ref } }) => (
        <FormControl error={!!error} disabled={disabled}>
          <FormControlLabel
            control={
              <Checkbox
                onChange={onChange}
                checked={!!value}
                inputRef={ref}
              />
            }
            label={label}
          />
          {(error || helperText) && (
            <FormHelperText>{error ? String(error.message) : helperText}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
});

// ----- Switch Field -----
interface FormSwitchProps {
  name: string;
  label: string;
  helperText?: string;
  disabled?: boolean;
}

export const FormSwitch = memo(function FormSwitch({
  name,
  label,
  helperText,
  disabled = false,
}: FormSwitchProps) {
  const { control, formState: { errors } } = useFormContext();
  const error = errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value, ref } }) => (
        <FormControl error={!!error} disabled={disabled}>
          <FormControlLabel
            control={
              <Switch
                onChange={onChange}
                checked={!!value}
                inputRef={ref}
              />
            }
            label={label}
          />
          {(error || helperText) && (
            <FormHelperText>{error ? String(error.message) : helperText}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
});

// ----- Select Field -----
interface FormSelectProps {
  name: string;
  label: string;
  options: { value: string | number; label: string }[];
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
}

export const FormSelect = memo(function FormSelect({
  name,
  label,
  options,
  helperText,
  required = false,
  disabled = false,
  fullWidth = true,
  variant = 'outlined',
  size = 'small',
}: FormSelectProps) {
  const { control, formState: { errors } } = useFormContext();
  const error = errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControl
          error={!!error}
          required={required}
          disabled={disabled}
          fullWidth={fullWidth}
          variant={variant}
          size={size}
        >
          <InputLabel id={`${name}-label`}>{label}</InputLabel>
          <Select
            {...field}
            labelId={`${name}-label`}
            label={label}
          >
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          {(error || helperText) && (
            <FormHelperText>{error ? String(error.message) : helperText}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
});

// ----- Autocomplete Field -----
interface FormAutocompleteProps {
  name: string;
  label: string;
  options: { value: string | number; label: string }[];
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  multiple?: boolean;
  disableClearable?: boolean;
  size?: 'small' | 'medium';
}

export const FormAutocomplete = memo(function FormAutocomplete({
  name,
  label,
  options,
  helperText,
  required = false,
  disabled = false,
  fullWidth = true,
  multiple = false,
  disableClearable = false,
  size = 'small',
}: FormAutocompleteProps) {
  const { control, formState: { errors } } = useFormContext();
  const error = errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value, ref, ...field } }) => (
        <FormControl 
          error={!!error} 
          required={required} 
          disabled={disabled}
          fullWidth={fullWidth}
        >
          <Autocomplete
            {...field}
            value={value}
            onChange={(_, newValue) => {
              onChange(newValue);
            }}
            options={options}
            getOptionLabel={(option) => {
              // Handle both string values and object values
              if (typeof option === 'string') {
                return option;
              }
              const foundOption = options.find(o => o.value === option.value);
              return foundOption ? foundOption.label : '';
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={label}
                error={!!error}
                inputRef={ref}
                required={required}
                size={size}
              />
            )}
            disableClearable={disableClearable}
            multiple={multiple}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={typeof option === 'string' ? option : option.label}
                  {...getTagProps({ index })}
                  key={index}
                />
              ))
            }
          />
          {(error || helperText) && (
            <FormHelperText>{error ? String(error.message) : helperText}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
});

// ----- Form Section -----
interface FormSectionProps {
  title?: string;
  children: React.ReactNode;
  spacing?: number;
}

export const FormSection = memo(function FormSection({
  title,
  children,
  spacing = 2,
}: FormSectionProps) {
  return (
    <Box mb={3}>
      {title && (
        <Typography variant="subtitle1" fontWeight={500} mb={1}>
          {title}
        </Typography>
      )}
      <FormGroup sx={{ gap: spacing }}>
        {children}
      </FormGroup>
    </Box>
  );
});