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