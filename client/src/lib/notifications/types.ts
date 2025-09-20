/**
 * Centralized notification system types
 * Designed for easy extensibility when adding new notification channels
 */

export interface BaseNotificationConfig {
  enabled: boolean;
}

export interface EmailNotificationConfig extends BaseNotificationConfig {
  type: 'email';
  defaultRecipients: string[]; // Based on entity team
  roleBasedRecipients: string[]; // Selected roles
  customEmails: string[]; // Custom email addresses
}

export interface SlackNotificationConfig extends BaseNotificationConfig {
  type: 'slack';
  channelName: string;
  channelId?: string; // Optional for validation
  defaultRecipients?: string[]; // Selected Slack channels
  customChannels?: string[]; // Custom Slack channels
}

export interface PagerDutyNotificationConfig extends BaseNotificationConfig {
  type: 'pagerduty';
  serviceKey: string;
}

export type NotificationConfig = 
  | EmailNotificationConfig 
  | SlackNotificationConfig 
  | PagerDutyNotificationConfig;

export interface NotificationSettings {
  email?: EmailNotificationConfig;
  slack?: SlackNotificationConfig;
  pagerduty?: PagerDutyNotificationConfig;
}

// Role definitions for email recipients
export interface UserRole {
  id: string;
  name: string;
  description: string;
  emails: string[];
}

// User data for recipient selection
export interface SystemUser {
  id: number;
  username: string;
  email: string;
  displayName?: string;
  team?: string;
  roles: string[];
  user_slack?: string[]; // User's Slack handles
  user_pagerduty?: string[]; // User's PagerDuty contacts
}

// Notification channel metadata for extensibility
export interface NotificationChannel {
  type: string;
  name: string;
  description: string;
  icon: string;
  configComponent: string; // Component name for dynamic rendering
  validationRules: Record<string, any>;
}

// Available notification channels registry
export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  {
    type: 'email',
    name: 'Email',
    description: 'Send email notifications to team members and stakeholders',
    icon: 'Mail',
    configComponent: 'EmailNotificationConfig',
    validationRules: {
      customEmails: { required: false, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      roleBasedRecipients: { required: false },
    }
  },
  {
    type: 'slack',
    name: 'Slack',
    description: 'Send notifications to Slack channels',
    icon: 'MessageSquare',
    configComponent: 'SlackNotificationConfig',
    validationRules: {
      channelName: { required: true, pattern: /^#?[a-z0-9_-]+$/ },
    }
  },
  {
    type: 'pagerduty',
    name: 'PagerDuty',
    description: 'Create incidents and alerts in PagerDuty',
    icon: 'AlertTriangle',
    configComponent: 'PagerDutyNotificationConfig',
    validationRules: {
      serviceKey: { required: true, minLength: 10 },
    }
  }
];

// Validation utilities
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateSlackChannel = (channelName: string): boolean => {
  const slackChannelRegex = /^#?[a-z0-9_-]+$/;
  return slackChannelRegex.test(channelName);
};

export const validateNotificationConfig = (
  type: string, 
  config: any
): { isValid: boolean; errors: string[] } => {
  const channel = NOTIFICATION_CHANNELS.find(ch => ch.type === type);
  if (!channel) {
    return { isValid: false, errors: [`Unknown notification type: ${type}`] };
  }

  const errors: string[] = [];
  
  switch (type) {
    case 'email':
      if (config.customEmails) {
        config.customEmails.forEach((email: string) => {
          if (!validateEmail(email)) {
            errors.push(`Invalid email format: ${email}`);
          }
        });
      }
      break;
    
    case 'slack':
      if (!config.channelName || !validateSlackChannel(config.channelName)) {
        errors.push('Invalid Slack channel name format');
      }
      break;
    
    case 'pagerduty':
      if (!config.serviceKey || config.serviceKey.length < 10) {
        errors.push('PagerDuty service key is required and must be at least 10 characters');
      }
      break;
  }

  return { isValid: errors.length === 0, errors };
};