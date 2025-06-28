/**
 * Centralized API Schema Configuration
 * 
 * This file contains all API schemas, validation rules, form field definitions,
 * and data structures used throughout the application. When the backend API
 * changes (adds/removes fields, changes validation), only this file needs updating.
 */

import * as yup from 'yup';

// ========================================
// FIELD DEFINITIONS AND VALIDATION RULES
// ========================================

export const fieldDefinitions = {
  // Common fields across all entities
  tenant_name: {
    type: 'string',
    required: true,
    label: 'Tenant Name',
    placeholder: 'e.g., Ad Engineering, Data Engineering',
    validation: yup.string().required('Tenant name is required'),
    apiField: 'tenant_name'
  },
  
  team_name: {
    type: 'string',
    required: true,
    label: 'Team Name',
    placeholder: 'Select team from dropdown',
    validation: yup.string().required('Team name is required'),
    apiField: 'team_name'
  },
  
  user_name: {
    type: 'string',
    required: false,
    label: 'User Name',
    placeholder: 'Optional user name',
    validation: yup.string().optional(),
    apiField: 'user_name'
  },
  
  user_email: {
    type: 'email',
    required: true,
    label: 'User Email',
    placeholder: 'user@company.com',
    validation: yup.string()
      .required('User email is required')
      .matches(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Invalid email format'
      ),
    apiField: 'user_email'
  },
  
  is_active: {
    type: 'boolean',
    required: false,
    label: 'Active',
    defaultValue: true,
    validation: yup.boolean().default(true),
    apiField: 'is_active'
  },
  
  notification_preferences: {
    type: 'array',
    required: false,
    label: 'Notification Preferences',
    defaultValue: [],
    validation: yup.array().of(yup.string()).default([]),
    apiField: 'notification_preferences'
  },
  
  expected_runtime_minutes: {
    type: 'number',
    required: true,
    label: 'Expected Runtime (Minutes)',
    placeholder: '60',
    validation: yup.number()
      .required('Expected runtime is required')
      .positive('Must be positive')
      .min(1, 'Must be at least 1 minute')
      .max(1440, 'Must not exceed 1440 minutes (24 hours)'),
    apiField: 'expected_runtime_minutes'
  },
  
  donemarker_location: {
    type: 'string',
    required: false,
    label: 'Done Marker Location',
    placeholder: 'Optional location path',
    validation: yup.string().optional(),
    apiField: 'donemarker_location'
  },
  
  donemarker_lookback: {
    type: 'number',
    required: false,
    label: 'Done Marker Lookback',
    placeholder: '0',
    validation: yup.number().min(0, 'Must be non-negative').optional(),
    apiField: 'donemarker_lookback'
  },

  // Table-specific fields
  schema_name: {
    type: 'string',
    required: true,
    label: 'Schema Name',
    placeholder: 'e.g., analytics, staging',
    validation: yup.string().required('Schema name is required'),
    apiField: 'schema_name'
  },
  
  table_name: {
    type: 'string',
    required: true,
    label: 'Table Name',
    placeholder: 'e.g., user_events, daily_metrics',
    validation: yup.string().required('Table name is required'),
    apiField: 'table_name'
  },
  
  table_description: {
    type: 'string',
    required: false,
    label: 'Table Description',
    placeholder: 'Optional description of the table',
    validation: yup.string().optional(),
    apiField: 'table_description'
  },
  
  table_schedule: {
    type: 'string',
    required: true,
    label: 'Table Schedule',
    placeholder: '0 2 * * * (cron format)',
    validation: yup.string()
      .required('Table schedule is required')
      .matches(/^[\d*\/ ,\-]+$/, 'Invalid cron format'),
    apiField: 'table_schedule'
  },
  
  table_dependency: {
    type: 'string',
    required: false,
    label: 'Table Dependencies',
    placeholder: 'comma,separated,dependencies',
    validation: yup.string().optional(),
    apiField: 'table_dependency'
  },

  // DAG-specific fields
  dag_name: {
    type: 'string',
    required: true,
    label: 'DAG Name',
    placeholder: 'e.g., daily_analytics_pipeline',
    validation: yup.string().required('DAG name is required'),
    apiField: 'dag_name'
  },
  
  dag_description: {
    type: 'string',
    required: false,
    label: 'DAG Description',
    placeholder: 'Optional description of the DAG',
    validation: yup.string().optional(),
    apiField: 'dag_description'
  },
  
  dag_schedule: {
    type: 'string',
    required: true,
    label: 'DAG Schedule',
    placeholder: '0 2 * * * (cron format)',
    validation: yup.string()
      .required('DAG schedule is required')
      .matches(/^[\d*\/ ,\-]+$/, 'Invalid cron format'),
    apiField: 'dag_schedule'
  },
  
  dag_dependency: {
    type: 'string',
    required: false,
    label: 'DAG Dependencies',
    placeholder: 'comma,separated,dependencies',
    validation: yup.string().optional(),
    apiField: 'dag_dependency'
  },

  // Authentication fields
  username: {
    type: 'string',
    required: true,
    label: 'Username',
    placeholder: 'Enter username',
    validation: yup.string().required('Username is required'),
    apiField: 'username'
  },
  
  password: {
    type: 'password',
    required: true,
    label: 'Password',
    placeholder: 'Enter password',
    validation: yup.string().required('Password is required'),
    apiField: 'password'
  },
  
  email: {
    type: 'email',
    required: true,
    label: 'Email',
    placeholder: 'user@company.com',
    validation: yup.string()
      .required('Email is required')
      .email('Invalid email format'),
    apiField: 'email'
  },
  
  displayName: {
    type: 'string',
    required: false,
    label: 'Display Name',
    placeholder: 'Your display name',
    validation: yup.string().optional(),
    apiField: 'displayName'
  },
  
  team: {
    type: 'string',
    required: false,
    label: 'Team',
    placeholder: 'Your team',
    validation: yup.string().optional(),
    apiField: 'team'
  }
};

// ========================================
// SCHEMA BUILDERS
// ========================================

// Build base schema for common fields
const buildBaseSchema = () => {
  return yup.object().shape({
    tenant_name: fieldDefinitions.tenant_name.validation,
    team_name: fieldDefinitions.team_name.validation,
    notification_preferences: fieldDefinitions.notification_preferences.validation,
    user_name: fieldDefinitions.user_name.validation,
    user_email: fieldDefinitions.user_email.validation,
    is_active: fieldDefinitions.is_active.validation,
  });
};

// Build table schema
export const buildTableSchema = () => {
  return buildBaseSchema().shape({
    schema_name: fieldDefinitions.schema_name.validation,
    table_name: fieldDefinitions.table_name.validation,
    table_description: fieldDefinitions.table_description.validation,
    table_schedule: fieldDefinitions.table_schedule.validation,
    expected_runtime_minutes: fieldDefinitions.expected_runtime_minutes.validation,
    table_dependency: fieldDefinitions.table_dependency.validation,
    donemarker_location: fieldDefinitions.donemarker_location.validation,
    donemarker_lookback: fieldDefinitions.donemarker_lookback.validation,
  });
};

// Build DAG schema
export const buildDagSchema = () => {
  return buildBaseSchema().shape({
    dag_name: fieldDefinitions.dag_name.validation,
    dag_description: fieldDefinitions.dag_description.validation,
    dag_schedule: fieldDefinitions.dag_schedule.validation,
    expected_runtime_minutes: fieldDefinitions.expected_runtime_minutes.validation,
    dag_dependency: fieldDefinitions.dag_dependency.validation,
    donemarker_location: fieldDefinitions.donemarker_location.validation,
    donemarker_lookback: fieldDefinitions.donemarker_lookback.validation,
  });
};

// Build auth schemas
export const buildLoginSchema = () => {
  return yup.object().shape({
    username: fieldDefinitions.username.validation,
    password: fieldDefinitions.password.validation,
  });
};

export const buildRegisterSchema = () => {
  return yup.object().shape({
    username: fieldDefinitions.username.validation,
    password: fieldDefinitions.password.validation,
    email: fieldDefinitions.email.validation,
    displayName: fieldDefinitions.displayName.validation,
    team: fieldDefinitions.team.validation,
  });
};

// ========================================
// DEFAULT VALUES
// ========================================

export const defaultValues = {
  common: {
    tenant_name: 'Data Engineering',
    team_name: 'PGM',
    notification_preferences: [],
    user_name: '',
    user_email: '',
    is_active: true,
    expected_runtime_minutes: 60,
    donemarker_location: '',
    donemarker_lookback: 0,
  },
  
  table: {
    schema_name: '',
    table_name: '',
    table_description: '',
    table_schedule: '0 2 * * *',
    table_dependency: '',
  },
  
  dag: {
    dag_name: '',
    dag_description: '',
    dag_schedule: '0 2 * * *',
    dag_dependency: '',
  },
  
  auth: {
    login: {
      username: '',
      password: '',
    },
    register: {
      username: '',
      password: '',
      email: '',
      displayName: '',
      team: '',
    }
  }
};

// ========================================
// FORM FIELD CONFIGURATIONS
// ========================================

export const getFieldsForEntityType = (entityType: 'table' | 'dag') => {
  const commonFields = [
    'tenant_name',
    'team_name',
    'user_name', 
    'user_email',
    'expected_runtime_minutes',
    'donemarker_location',
    'donemarker_lookback',
    'notification_preferences',
    'is_active'
  ];
  
  if (entityType === 'table') {
    return [
      ...commonFields.slice(0, 4), // tenant_name, team_name, user_name, user_email
      'schema_name',
      'table_name',
      'table_description',
      'table_schedule',
      'table_dependency',
      ...commonFields.slice(4) // expected_runtime_minutes, donemarker_location, etc.
    ];
  } else {
    return [
      ...commonFields.slice(0, 4), // tenant_name, team_name, user_name, user_email
      'dag_name',
      'dag_description', 
      'dag_schedule',
      'dag_dependency',
      ...commonFields.slice(4) // expected_runtime_minutes, donemarker_location, etc.
    ];
  }
};

// ========================================
// API DATA MAPPING
// ========================================

export const mapFormDataToApi = (formData: any, entityType: 'table' | 'dag') => {
  const apiData: any = {};
  
  // Map all form fields to their API equivalents
  Object.keys(formData).forEach(fieldKey => {
    const fieldDef = fieldDefinitions[fieldKey as keyof typeof fieldDefinitions];
    if (fieldDef) {
      apiData[fieldDef.apiField] = formData[fieldKey];
    }
  });
  
  // Add entity type
  apiData.type = entityType;
  
  return apiData;
};

export const mapApiDataToForm = (apiData: any, entityType: 'table' | 'dag') => {
  const formData: any = {};
  
  // Map API fields back to form fields
  Object.entries(fieldDefinitions).forEach(([fieldKey, fieldDef]) => {
    if (apiData.hasOwnProperty(fieldDef.apiField)) {
      formData[fieldKey] = apiData[fieldDef.apiField];
    }
  });
  
  return formData;
};

// ========================================
// BULK UPLOAD SCHEMA CONFIGURATIONS
// ========================================

export const bulkUploadFields = {
  table: [
    'tenant_name',
    'team_name', 
    'schema_name',
    'table_name',
    'table_description',
    'table_schedule',
    'table_dependency',
    'expected_runtime_minutes',
    'user_name',
    'user_email',
    'donemarker_location',
    'donemarker_lookback'
  ],
  
  dag: [
    'tenant_name',
    'team_name',
    'dag_name', 
    'dag_description',
    'dag_schedule',
    'dag_dependency',
    'expected_runtime_minutes',
    'user_name',
    'user_email',
    'donemarker_location',
    'donemarker_lookback'
  ]
};

// ========================================
// EXPORT LEGACY SCHEMAS FOR BACKWARDS COMPATIBILITY
// ========================================

export const baseSchema = buildBaseSchema();
export const tableSchema = buildTableSchema();
export const dagSchema = buildDagSchema();
export const loginSchema = buildLoginSchema();
export const registerSchema = buildRegisterSchema();