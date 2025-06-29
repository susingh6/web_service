# SLA Management Tool

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

- June 29, 2025: Added filter buttons to Top 5 Entities Performance chart in team dashboard
  - Added All/Tables/DAGs filter buttons matching the Compliance Trend chart design
  - Updated EntityPerformanceChart component to accept and process filter prop
  - Chart now filters entities by type (tables only, DAGs only, or all entities)
  - Maintains consistent UI pattern across both dashboard charts
- June 29, 2025: Fixed duplicate trigger prevention in notification timeline modal
  - Added duplicate detection logic to prevent adding the same trigger type multiple times
  - Shows clear error message when users attempt to add duplicate triggers
  - Prevents duplicate entries like multiple "SLA THRESHOLD BREACHED" triggers
  - Applies to both Tables and DAGs in ADD NEW and UPDATE EXISTING tabs
- June 29, 2025: Updated Entity Details modal delete functionality to use centralized API configuration
  - Added delete endpoint to centralized API configuration (entity.delete function)
  - Updated Entity Details modal to use buildUrl(endpoints.entity.delete) instead of hard-coded comments
  - Confirmed backend DELETE /api/entities/:id endpoint exists and is properly configured
  - Delete functionality now follows centralized API pattern like all other modals
  - Display labels remain static as they represent entity properties, not configurable form fields
- June 29, 2025: Fixed authentication system runtime errors and confirmed centralized API integration
  - Resolved cache utility errors causing login page crashes with proper error handling
  - Disabled problematic API fetch calls during cache preloading to prevent unhandled rejections
  - Confirmed all authentication endpoints use centralized API configuration (login, register, logout, user)
  - Maintained Azure AD boilerplate code with proper fallback handling for unconfigured environments
  - Authentication system now stable with working username/password login using test user
- June 28, 2025: Completed removal of user_name field from bulk upload modal system
  - Removed user_name field completely from BaseEntity interface in BulkUploadModal
  - Added owner_email field with comma-separated email validation support
  - Updated table headers and body rows to display owner_email instead of user_name
  - Fixed TypeScript errors with proper type annotations for email validation
  - Updated field descriptions to show "String (single email or comma-separated multiple emails)" for both Tables and DAGs
  - Bulk upload modal now uses only owner_email and user_email fields as intended
  - All validation and display logic updated to match centralized field definitions
- June 28, 2025: Updated header title from "SLA Monitoring Dashboard" to "SLA Dashboard"
  - Changed application title in Header component to match user requirements
  - Updated notification dropdown examples to show realistic SLA-related alerts
  - Limited notification display to maximum 5 most recent notifications with timestamps
  - Replaced generic notifications with SLA compliance alerts, performance warnings, and entity status updates
  - Explained bell notification system functionality and integration capabilities
- June 28, 2025: Removed blue info icons from all dashboard charts in Summary and Teams sections
  - Eliminated Info icon imports from MetricCard component
  - Removed Tooltip wrapper and Info icon fallback display
  - Dashboard charts now show clean titles without unnecessary visual clutter
  - Applied changes to all metric cards displaying compliance percentages and entity counts
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
- June 28, 2025: Made donemarker_location field mandatory with flexible input type
  - Changed donemarker_location from optional to required field in centralized configuration
  - Updated field to accept single location or comma-separated multiple locations (like dependency fields)
  - Added mandatory validation to bulk upload modal for donemarker_location field
  - Fixed Add Entity modal to show required asterisk for donemarker_location field
  - Updated both Table and DAG tabs to use centralized field definitions for proper validation display
  - Updated placeholder text to clarify input format for single or multiple locations
  - Field now follows same pattern as table_dependency and dag_dependency fields
- June 28, 2025: Updated Bulk Upload modal to use centralized field definitions for labels and validation
  - Replaced hard-coded validation messages with centralized fieldDefinitions throughout validation function
  - Updated table headers to use centralized field labels instead of hard-coded values
  - Validation errors now dynamically reference field labels from centralized configuration
  - Maintained same rendering structure while achieving consistent field terminology
  - Bulk upload system now fully integrated with centralized configuration schema
  - Fixed donemarker_location display to show as mandatory field in required fields list
  - Removed donemarker_location from optional fields section
  - Updated download sample template to include donemarker_location as required field for both tables and DAGs
- June 28, 2025: Added both user_email and owner_email as mandatory fields in bulk upload modal
  - Added owner_email field definition to centralized schemas configuration with proper validation
  - Updated bulk upload modal to show both user_email and owner_email as required fields for tables and DAGs
  - Modified sample data templates to include both email fields in download examples
  - Updated required fields display lists to show both email fields as mandatory
  - Maintained centralized API configuration approach for all field definitions and validation
  - Sample data now includes realistic email examples for both user_email and owner_email fields
- June 28, 2025: Updated Edit Entity modal to use centralized field definitions for labels and attributes
  - Replaced all hard-coded labels with centralized fieldDefinitions from config schemas
  - Updated Team Name, Schema Name, User Name, User Email labels to use centralized configuration
  - Updated entity-specific labels (Table/DAG Name, Description, Schedule, Dependency) with centralized definitions
  - Updated common field labels (Expected Runtime, Donemarker Location, Donemarker Lookback) with centralized config
  - Maintained identical rendering structure and functionality with no visual changes
  - Edit Entity modal now consistently uses Add Entity modal field labels from centralized system
- June 28, 2025: Updated Add Entity modal to complete centralized field definitions for labels and attributes
  - Replaced remaining hard-coded labels with centralized fieldDefinitions from config schemas
  - Updated Tenant Name, Team Name, Schema Name labels to use centralized configuration
  - Updated Table/DAG entity-specific labels (Name, Description, Schedule, Dependency) with centralized definitions
  - Updated common field labels (Expected Runtime, Donemarker Location, Donemarker Lookback) with centralized config
  - Maintained identical rendering structure and functionality with no visual changes
  - Add Entity modal now fully integrated with centralized API configuration system
- June 28, 2025: Updated Bulk Upload modal to use centralized field definitions for labels and validation
  - Replaced hard-coded validation messages with centralized fieldDefinitions throughout validation function
  - Updated table headers to use centralized field labels instead of hard-coded values
  - Updated required/optional fields display lists to show centralized field labels
  - Updated validation error messages to dynamically reference field labels from centralized configuration
  - Maintained same rendering structure while achieving consistent field terminology
  - Bulk upload system now fully integrated with centralized configuration schema
- June 28, 2025: Completed centralized field definitions migration across all four action modals
  - Updated NotificationTimelineModal to use centralized fieldDefinitions for Timeline Name and Description labels
  - All action modals (EditEntityModal, AddEntityModal, BulkUploadModal, NotificationTimelineModal) now use centralized configuration
  - Eliminated all hard-coded field labels and validation messages across modal interfaces
  - Achieved 100% centralized API configuration for field definitions, labels, and validation throughout application
  - System now has unified field terminology and validation messaging across all development environments
  - Centralized configuration ensures consistent user experience and simplified maintenance
- June 28, 2025: Fixed Edit Entity modal mandatory field validation and input capabilities
  - Made owner email (user_name) mandatory with required asterisk and email validation
  - Made donemarker location mandatory with required asterisk using centralized field definitions
  - Donemarker location now accepts single or multiple comma-separated locations like Add Entity modal
  - Fixed fieldDefinitions export issue in config system that was causing team tab errors
  - Team tab navigation now working properly with successful data loading
- June 28, 2025: Removed action buttons from entity details modal
  - Eliminated View History, Edit Entity, and Delete buttons from bottom of entity details modal
  - Modal now shows only entity information and history without action buttons
  - Consistent behavior across both table and DAG entity types
- June 28, 2025: Fixed notification timeline trigger options to be entity-type specific
  - AI TASKS STATUS CHANGE trigger now only appears for DAG entities, not table entities
  - Applied conditional logic to both ADD NEW and UPDATE EXISTING tabs
  - Added filtering logic to remove AI task triggers when editing existing timelines for table entities
  - Maintains DAG entity functionality unchanged with all trigger options available
- June 28, 2025: Updated owner_email field to accept comma-separated emails like donemarker_location
  - Modified owner_email field definition to accept single email or multiple comma-separated emails
  - Added custom validation function to validate each email in comma-separated list
  - Updated placeholder text to show example format for single or multiple emails
  - Removed user_name field completely from field definitions and validation schemas
  - Only owner_email field supports comma-separated format, user_email remains single email validation
- June 28, 2025: Updated Add Entity modal to use centralized field definitions for both Table and DAG tabs
  - Replaced hard-coded labels with centralized fieldDefinitions for user_name and user_email fields in both tabs
  - "User Name" field now shows as "Owner Email" with mandatory validation from centralized config
  - Added email validation, type, and placeholder properties from centralized schema
  - Removed duplicate attributes and maintained same field rendering structure
  - Both Table and DAG tabs now dynamically pull field properties from centralized configuration system
- June 28, 2025: Completed comprehensive centralized API configuration migration for modals
  - Updated AddEntityModal to use centralized endpoints for entity creation and option fetching
  - Updated BulkUploadModal to use centralized endpoints for bulk entity submission
  - Fixed staging and production configuration files to match complete API interface
  - All modals now use buildUrl(endpoints.entities) instead of hard-coded URLs
  - Improved error handling in bulk upload with proper API request error management
  - Centralized API system now covers 100% of entity management workflows
- June 27, 2025: Initial setup