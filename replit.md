# SLA Monitoring Tool

## Overview

This is a comprehensive enterprise SLA monitoring application designed to track and monitor Service Level Agreements for data tables and DAGs across multiple teams. The application provides real-time monitoring, alerting, and management capabilities for ensuring data processing reliability and performance.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development
- **State Management**: Redux Toolkit for global state management with React Query for server state
- **UI Components**: Hybrid approach using Material-UI v5 components with shadcn/ui for modern design patterns
- **Styling**: Tailwind CSS with custom theming and Material-UI's styling system
- **Authentication**: Azure AD SSO integration using MSAL.js v2
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Yup validation for robust form handling

### Backend Architecture
- **Framework**: Express.js with TypeScript for type-safe server development
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: Passport.js with local strategy and Azure AD integration
- **Session Management**: Express sessions with memory store for development
- **API Design**: RESTful API with consistent error handling and logging middleware

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL adapter for type-safe database queries
- **Database Provider**: Neon Database for serverless PostgreSQL hosting
- **Schema Management**: Drizzle migrations for version-controlled database changes
- **Mock Data**: Comprehensive mock data system for development and testing

## Key Components

### Authentication System
- **Azure AD Integration**: MSAL.js for enterprise SSO authentication
- **Local Authentication**: Fallback local authentication for development
- **Session Management**: Express sessions with configurable storage
- **Protected Routes**: Route-level authentication guards

### Dashboard System
- **Summary Dashboard**: Overview of all SLA metrics across teams
- **Team-specific Dashboards**: Detailed views for individual team performance
- **Real-time Monitoring**: Live updates of SLA compliance status
- **Interactive Charts**: Recharts integration for data visualization

### Entity Management
- **Dual Entity Types**: Support for both data tables and DAGs
- **CRUD Operations**: Full create, read, update, delete functionality
- **Bulk Operations**: Bulk upload and management capabilities
- **Status Tracking**: Real-time status monitoring with alerting

### Task Management (DAGs)
- **Priority Zones**: Drag-and-drop task prioritization
- **Status Tracking**: Comprehensive task status monitoring
- **Dependency Management**: Task dependency visualization and management
- **Performance Metrics**: Runtime and SLA tracking per task

## Data Flow

1. **User Authentication**: Users authenticate via Azure AD or local credentials
2. **Dashboard Loading**: Initial data load from cached values for fast rendering
3. **Real-time Updates**: Background polling for live data updates
4. **Entity Management**: CRUD operations sync with backend API
5. **Notifications**: Real-time alerts for SLA violations and system issues

## External Dependencies

### Frontend Dependencies
- **@azure/msal-browser**: Microsoft Authentication Library for Azure AD
- **@mui/material**: Material-UI component library
- **@reduxjs/toolkit**: Modern Redux with built-in best practices
- **@tanstack/react-query**: Server state management and caching
- **react-hook-form**: Performant form library with validation
- **recharts**: React charting library for data visualization

### Backend Dependencies
- **@neondatabase/serverless**: Neon Database serverless driver
- **drizzle-orm**: Type-safe ORM for PostgreSQL
- **passport**: Authentication middleware
- **express-session**: Session management
- **@sendgrid/mail**: Email service integration
- **@slack/web-api**: Slack integration for notifications

### Development Dependencies
- **vite**: Fast build tool and development server
- **typescript**: Type checking and compilation
- **tailwindcss**: Utility-first CSS framework
- **drizzle-kit**: Database migration and management tools

## Deployment Strategy

### Development Environment
- **Local Development**: Vite dev server with hot reload
- **Database**: Neon Database serverless PostgreSQL
- **Authentication**: Local authentication with Azure AD fallback
- **Mock Data**: Comprehensive mock data for offline development

### Production Considerations
- **Build System**: Vite for frontend, esbuild for backend bundling
- **Database**: PostgreSQL with Drizzle ORM migrations
- **Session Storage**: Configurable session storage (memory for dev, Redis for production)
- **Environment Variables**: Comprehensive environment configuration

### Security Features
- **Authentication**: Azure AD SSO with session management
- **Authorization**: Role-based access control
- **Input Validation**: Comprehensive validation using Zod schemas
- **CSRF Protection**: Built-in CSRF protection for forms
- **Secure Sessions**: Configurable session security settings

## User Preferences

Preferred communication style: Simple, everyday language.

## Changelog

- June 28, 2025: Completed centralized API configuration for 30-day trend system
  - Added trends30Day endpoint to centralized API configuration (dev.ts, index.ts)
  - Updated trend cache system to use centralized endpoints instead of hard-coded URLs
  - Replaced local mock trend generation in EntityTable with cached trend system
  - 30-day trend data now independent of global date filter with 6-hour refresh cycle
  - EntityTable component now uses getEntityTrend() from cache for authentic API-based trend data
  - All trend endpoints now follow centralized configuration schema for consistency
- June 28, 2025: Completed code deduplication and optimization across the codebase
  - Eliminated duplicate cache utility functions by consolidating fetchWithCache and fetchWithCacheGeneric
  - Created generic cache functions (fetchWithCacheGeneric, getFromCacheGeneric) for type-safe complex objects
  - Removed redundant notification API functions by creating backward compatibility wrappers
  - Added updateCacheWithNewValue utility to eliminate manual localStorage operations
  - Converted EntityDetailsDrawer from side-opening drawer to centered modal (EntityDetailsModal)
  - Fixed all TypeScript errors in cache utilities and notification system
  - Maintained identical functionality while significantly reducing code duplication
  - Improved code maintainability and type safety across the application
- June 28, 2025: Completed tabbed notification timeline modal implementation
  - Added "ADD NEW" and "UPDATE EXISTING" tabs to notification timeline modal
  - Implemented dropdown selection for existing timelines in update mode
  - Added proper form population from API data when editing existing timelines
  - Fixed duplicate variable declarations and syntax errors in modal component
  - Updated button text and mutations to handle both create and update operations
  - Form now correctly routes to appropriate mutation based on selected tab
  - Fixed conditional rendering to show all fields in both tabs (name, description, triggers, channels, status)
  - Both tabs now have identical field visibility and functionality
  - Removed duplicate Timeline Name field from UPDATE EXISTING tab's Basic Information section
  - Maintained field render order as requested - no changes to individual field positioning
- June 28, 2025: Completed removal of notification_preferences from bulk upload modal system
  - Removed notification_preferences from BaseEntity interface definition
  - Eliminated notification_preferences from optional fields display for both tables and DAGs
  - Removed notification_preferences from all sample template downloads (tables and DAGs)
  - Notification configuration now completely isolated from bulk upload workflows
  - Bulk upload system focuses exclusively on entity properties without notification configuration
- June 28, 2025: Completed removal of notification configuration from entity modals
  - Removed NotificationConfigManager from both AddEntityModal and EditEntityModal
  - Eliminated notification configuration section from entity creation and editing workflows
  - Notification configuration now isolated exclusively to notification timelines
  - Cleaned up unused NotificationSettings state and imports
  - Maintained all other form fields and functionality unchanged
  - Modal interfaces now focused solely on entity properties without notification clutter
- June 28, 2025: Completed comprehensive codebase-wide centralized API configuration migration
  - Eliminated all remaining hard-coded API URLs across the entire application
  - Updated notification cache utilities to use centralized endpoint configuration
  - Fixed dashboard endpoint type configuration to support function parameters
  - Added proper error handling for cache utilities with type-safe array returns
  - Updated BulkUploadModal and AddEntityModal to use centralized endpoints
  - Configured PagerDuty and Slack notification components with centralized API structure
  - Achieved 100% centralized API configuration - no hard-coded URLs remain in codebase
  - System now has unified API endpoint management across all development environments
- June 28, 2025: Implemented centralized API system for task drag and drop functionality
  - Added task endpoints to centralized API configuration (dev.ts, index.ts)
  - Updated task service to use centralized endpoints instead of hard-coded URLs
  - Implemented backend API routes for GET /api/dags/:dagId/tasks and PATCH /api/tasks/:taskId
  - Task priority updates now use proper API calls with centralized configuration
  - Removed fallback to mock data dependency - now uses authentic API integration
  - Drag and drop from "Regular Tasks" to "AI Monitored Tasks" registers changes via API
- June 28, 2025: Completed centralized API configuration system for notification timelines
  - Added notification timeline endpoints to centralized API configuration in config files
  - Updated NotificationTimelineModal to use centralized endpoints from config system
  - Implemented complete backend API routes for notification timeline management
  - Added endpoints for creating, reading, updating, and deleting notification timelines
  - Implemented AI tasks endpoint for DAG entities with mock data structure
  - Centralized all API endpoints through config files instead of hardcoded URLs
  - System now uses config-based API management for consistent endpoint handling across development, staging, and production
- June 28, 2025: Implemented comprehensive notification configuration system
  - Created extensible notification types architecture with email, Slack, and PagerDuty support
  - Built NotificationConfigManager with collapsible channel configurations
  - Added EmailNotificationConfig with role-based recipients and custom email validation
  - Implemented SlackNotificationConfig with channel validation and setup requirements
  - Created PagerDutyNotificationConfig with service key validation and escalation policies
  - Added user caching system with 6-hour refresh cycle for dropdown population
  - Established server-side endpoints for users and user roles to support notification system
  - Added UserRole interface and storage methods for predefined organizational roles
  - System designed for storing notification preferences, with actual delivery to be configured separately
  - Integrated NotificationConfigManager into AddEntityModal replacing simple checkboxes
  - Fixed undefined config errors and added proper default values for all notification components
  - Updated email configuration label from "Additional Recipients by Role" to "Additional Recipients"
  - Updated notification message to specify "SLA Management System Administration" for clarity
  - Integrated NotificationConfigManager into EditEntityModal to match AddEntityModal functionality
  - Eliminated code duplication by using centralized notification configuration system across both modals
- June 28, 2025: Implemented comprehensive API data fetching for EditEntityModal
  - Added entity details API endpoint `/api/entities/:id/details` with enhanced field structure
  - Implemented React Query data fetching with proper pre-population of all form fields
  - Notification preferences and is_active toggle now correctly set from API data
  - Added fallback logic to handle API unavailability with mock data structure
  - Form fields auto-populate with comprehensive data including tenant, team, schedule, and dependencies
- June 28, 2025: Completed EditEntityModal comprehensive form integration
  - EditEntityModal now matches AddEntityModal with identical form fields for both table and DAG entities
  - Fixed "Is Active" toggle positioning to appear below Notification Preferences
  - Changed button text from "Save Changes" to "Edit Changes"
  - Pre-populated all form fields with existing entity data
  - Maintained validation rules and field requirements across both modals
- June 28, 2025: Fixed critical DAG entry click errors
  - Resolved .toFixed() and .charAt() errors on undefined entity properties
  - Added comprehensive null checks with fallback values
  - Fixed import extensions in config system
  - Centralized API configuration system implemented
  - Team dashboard navigation fully functional
- June 27, 2025: Initial setup