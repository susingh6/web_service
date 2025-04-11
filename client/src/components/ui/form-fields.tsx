import React, { ReactNode } from 'react';
import { useFormContext, Controller, Path, FieldValues } from 'react-hook-form';
import {
  TextField,
  TextFieldProps,
  FormControl,
  InputLabel,
  Select as MuiSelect,
  MenuItem,
  FormHelperText,
  SelectProps as MuiSelectProps,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Switch,
  SwitchProps,
  Typography,
  Box,
  Divider,
  Autocomplete,
  Chip,
  Paper,
  Stack,
} from '@mui/material';

/**
 * Base props for all form field components
 */
interface BaseFieldProps {
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Common props for all controlled form fields
 */
export interface ControlledFieldProps<T extends FieldValues> extends BaseFieldProps {
  name: Path<T>;
}

/**
 * Props for FormTextField component
 */
export interface FormTextFieldProps<T extends FieldValues> extends ControlledFieldProps<T> {
  type?: TextFieldProps['type'];
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  variant?: TextFieldProps['variant'];
  size?: TextFieldProps['size'];
  InputProps?: TextFieldProps['InputProps'];
  inputProps?: TextFieldProps['inputProps'];
}

/**
 * A controlled text field component for use with react-hook-form
 */
export function FormTextField<T extends FieldValues>({
  name,
  label,
  helperText,
  required = false,
  disabled = false,
  fullWidth = true,
  type = 'text',
  multiline = false,
  rows,
  placeholder,
  variant = 'outlined',
  size = 'medium',
  InputProps,
  inputProps,
  className,
}: FormTextFieldProps<T>) {
  const { control, formState } = useFormContext<T>();
  const error = formState.errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          label={label}
          type={type}
          multiline={multiline}
          rows={rows}
          required={required}
          disabled={disabled}
          fullWidth={fullWidth}
          placeholder={placeholder}
          variant={variant}
          size={size}
          InputProps={InputProps}
          inputProps={inputProps}
          className={className}
          error={!!error}
          helperText={error ? (error.message as string) : helperText}
        />
      )}
    />
  );
}

/**
 * Option type for select fields
 */
interface SelectOption {
  value: string | number;
  label: string;
}

/**
 * Props for FormSelect component
 */
export interface FormSelectProps<T extends FieldValues> extends ControlledFieldProps<T> {
  options: SelectOption[];
  placeholder?: string;
  variant?: MuiSelectProps['variant'];
  size?: MuiSelectProps['size'];
  multiple?: boolean;
}

/**
 * A controlled select field component for use with react-hook-form
 */
export function FormSelect<T extends FieldValues>({
  name,
  label,
  helperText,
  required = false,
  disabled = false,
  fullWidth = true,
  options,
  placeholder,
  variant = 'outlined',
  size = 'medium',
  multiple = false,
  className,
}: FormSelectProps<T>) {
  const { control, formState } = useFormContext<T>();
  const error = formState.errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControl 
          fullWidth={fullWidth} 
          error={!!error} 
          required={required}
          variant={variant}
          size={size}
          disabled={disabled}
          className={className}
        >
          {label && <InputLabel>{label}</InputLabel>}
          
          <MuiSelect
            {...field}
            label={label}
            multiple={multiple}
            displayEmpty={!!placeholder}
            renderValue={(selected) => {
              if (!selected) {
                return <Typography color="text.secondary">{placeholder}</Typography>;
              }
              
              if (multiple && Array.isArray(selected)) {
                return (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value: string | number) => {
                      const option = options.find(opt => opt.value === value);
                      return (
                        <Chip 
                          key={value.toString()} 
                          label={option ? option.label : String(value)} 
                          size="small"
                        />
                      );
                    })}
                  </Box>
                );
              }
              
              const option = options.find(opt => opt.value === selected);
              return option ? option.label : selected;
            }}
          >
            {placeholder && (
              <MenuItem value="" disabled>
                <Typography color="text.secondary">{placeholder}</Typography>
              </MenuItem>
            )}
            
            {options.map((option) => (
              <MenuItem 
                key={String(option.value)} 
                value={option.value}
              >
                {option.label}
              </MenuItem>
            ))}
          </MuiSelect>
          
          {(error || helperText) && (
            <FormHelperText>
              {error ? (error.message as string) : helperText}
            </FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
}

/**
 * Props for FormCheckbox component
 */
export interface FormCheckboxProps<T extends FieldValues> extends ControlledFieldProps<T> {
  /**
   * Position of the label relative to the checkbox
   */
  labelPlacement?: 'end' | 'start' | 'top' | 'bottom';
}

/**
 * A controlled checkbox component for use with react-hook-form
 */
export function FormCheckbox<T extends FieldValues>({
  name,
  label,
  helperText,
  required = false,
  disabled = false,
  labelPlacement = 'end',
  className,
}: FormCheckboxProps<T>) {
  const { control, formState } = useFormContext<T>();
  const error = formState.errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControl
          required={required}
          error={!!error}
          disabled={disabled}
          className={className}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={!!field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                inputRef={field.ref}
                name={field.name}
                onBlur={field.onBlur}
              />
            }
            label={label || ''}
            labelPlacement={labelPlacement}
          />
          
          {(error || helperText) && (
            <FormHelperText>
              {error ? (error.message as string) : helperText}
            </FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
}

/**
 * Props for FormSwitch component
 */
export interface FormSwitchProps<T extends FieldValues> extends ControlledFieldProps<T> {
  /**
   * Position of the label relative to the switch
   */
  labelPlacement?: 'end' | 'start' | 'top' | 'bottom';
  
  /**
   * Custom props for the Switch component
   */
  switchProps?: Partial<SwitchProps>;
}

/**
 * A controlled switch component for use with react-hook-form
 */
export function FormSwitch<T extends FieldValues>({
  name,
  label,
  helperText,
  required = false,
  disabled = false,
  labelPlacement = 'end',
  switchProps,
  className,
}: FormSwitchProps<T>) {
  const { control, formState } = useFormContext<T>();
  const error = formState.errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControl
          required={required}
          error={!!error}
          disabled={disabled}
          className={className}
        >
          <FormControlLabel
            control={
              <Switch
                checked={!!field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                inputRef={field.ref}
                name={field.name}
                onBlur={field.onBlur}
                {...switchProps}
              />
            }
            label={label || ''}
            labelPlacement={labelPlacement}
          />
          
          {(error || helperText) && (
            <FormHelperText>
              {error ? (error.message as string) : helperText}
            </FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
}

/**
 * Props for FormAutocomplete component
 */
export interface FormAutocompleteProps<T extends FieldValues> extends ControlledFieldProps<T> {
  /**
   * Options for the autocomplete
   */
  options: SelectOption[];
  
  /**
   * Whether multiple values can be selected
   */
  multiple?: boolean;
  
  /**
   * Whether to allow creating new options
   */
  freeSolo?: boolean;
  
  /**
   * Placeholder text
   */
  placeholder?: string;
  
  /**
   * Variant of the input
   */
  variant?: TextFieldProps['variant'];
  
  /**
   * Size of the input
   */
  size?: TextFieldProps['size'];
}

/**
 * A controlled autocomplete component for use with react-hook-form
 */
export function FormAutocomplete<T extends FieldValues>({
  name,
  label,
  helperText,
  required = false,
  disabled = false,
  fullWidth = true,
  options,
  multiple = false,
  freeSolo = false,
  placeholder,
  variant = 'outlined',
  size = 'medium',
  className,
}: FormAutocompleteProps<T>) {
  const { control, formState } = useFormContext<T>();
  const error = formState.errors[name];
  
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, value, ref, ...field } }) => (
        <Autocomplete
          {...field}
          multiple={multiple}
          freeSolo={freeSolo}
          options={options.map(option => option.value)}
          getOptionLabel={(option) => {
            // Value can be a string/number directly from freeSolo or an option from the list
            if (option === null) return '';
            
            const optionItem = options.find(item => item.value === option);
            return optionItem ? optionItem.label : option.toString();
          }}
          value={value === undefined ? (multiple ? [] : null) : value}
          onChange={(_, newValue) => {
            onChange(newValue);
          }}
          disabled={disabled}
          fullWidth={fullWidth}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              placeholder={placeholder}
              variant={variant}
              size={size}
              required={required}
              error={!!error}
              helperText={error ? (error.message as string) : helperText}
              inputRef={ref}
            />
          )}
          renderTags={(values, getTagProps) =>
            values.map((value, index) => {
              const optionItem = options.find(item => item.value === value);
              const label = optionItem ? optionItem.label : value.toString();
              return (
                <Chip
                  variant="filled"
                  label={label}
                  size="small"
                  {...getTagProps({ index })}
                />
              );
            })
          }
          className={className}
        />
      )}
    />
  );
}

/**
 * Props for FormSection component
 */
interface FormSectionProps {
  /**
   * Section title
   */
  title: string;
  
  /**
   * Section description
   */
  description?: string;
  
  /**
   * Section content
   */
  children: ReactNode;
  
  /**
   * Whether to show a divider
   */
  divider?: boolean;
  
  /**
   * CSS class name
   */
  className?: string;
}

/**
 * A section component for grouping form fields
 */
export function FormSection({
  title,
  description,
  children,
  divider = true,
  className,
}: FormSectionProps) {
  return (
    <Box 
      component={Paper} 
      variant="outlined" 
      sx={{ p: 3, mb: 3 }}
      className={className}
    >
      <Typography 
        variant="h6" 
        fontWeight={500} 
        color="primary" 
        gutterBottom
      >
        {title}
      </Typography>
      
      {description && (
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ mb: 2 }}
        >
          {description}
        </Typography>
      )}
      
      {divider && <Divider sx={{ my: 2 }} />}
      
      <Stack spacing={2.5} mt={2}>
        {children}
      </Stack>
    </Box>
  );
}