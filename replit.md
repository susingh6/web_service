# SLA Management Tool

## Overview

This is a comprehensive enterprise SLA monitoring application designed to track and monitor Service Level Agreements for data tables and DAGs across multiple teams. The application provides real-time monitoring, alerting, and management capabilities for ensuring data processing reliability and performance. Its business vision is to provide a robust solution for ensuring data processing reliability and performance, addressing a critical need in enterprise data management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **State Management**: Redux Toolkit for global state, React Query for server state
- **UI Components**: Hybrid Material-UI v5 and shadcn/ui
- **Styling**: Tailwind CSS with custom theming, Material-UI's styling system
- **Authentication**: Azure AD SSO integration using MSAL.js v2, local fallback
- **Routing**: Wouter
- **Forms**: React Hook Form with Yup validation
- **Data Visualization**: Recharts integration for interactive charts

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with local strategy and Azure AD integration
- **Session Management**: Express sessions
- **API Design**: RESTful API with consistent error handling and logging middleware
- **Structured Logging**: JSON formatted logging with session context enrichment for audit trails

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL adapter
- **Database Provider**: Neon Database for serverless PostgreSQL
- **Schema Management**: Drizzle migrations
- **Mock Data**: Comprehensive mock data system for development and testing

### Core Features
- **Authentication System**: Azure AD and local authentication, session management, protected routes.
- **Dashboard System**: Summary and team-specific dashboards, real-time monitoring, interactive charts.
- **Entity Management**: Support for data tables and DAGs, CRUD operations, bulk management, real-time status tracking.
- **Task Management (DAGs)**: Priority zones (drag-and-drop), status tracking, dependency management, performance metrics.
- **Notification Configuration**: Extensible system for email, Slack, and PagerDuty notifications, with type-specific triggers and channel configurations.
- **Centralized API Configuration**: All API endpoints managed through a centralized system for consistency across environments.
- **Caching System**: Redis-based distributed caching with automatic fallback to in-memory, distributed locking, pub/sub for real-time updates.
- **SLA Compliance Thresholds**: Configurable color thresholds for visual indication of SLA compliance.
- **Entity Ownership**: Role-based access control for entity modification and deletion.
- **Standardized CRUD Operations**: Unified optimistic update pattern with smart ID detection, operation queuing, and automatic reconciliation for consistent user experience across all data operations.
- **User Deactivation System**: Inactive users show as "expired" on team dashboards with visual differentiation (strikethrough, opacity, red status), are filtered out of dropdown lists (Add Member, Owner Update), but remain visible on dashboards for removal actions via FastAPI/Express fallback.
- **User Profile Management**: Complete self-service profile page accessible via header user menu, allowing users to update their own details (name, email, Slack/PagerDuty contacts) with real-time cache invalidation to sync admin panel views, session-based authentication, and robust validation.

## External Dependencies

- **@azure/msal-browser**: Microsoft Authentication Library for Azure AD
- **@mui/material**: Material-UI component library
- **@reduxjs/toolkit**: Redux state management
- **@tanstack/react-query**: Server state management
- **react-hook-form**: Form management
- **recharts**: Charting library
- **@neondatabase/serverless**: Neon Database driver
- **drizzle-orm**: ORM for PostgreSQL
- **passport**: Authentication middleware
- **express-session**: Session management
- **@sendgrid/mail**: Email service
- **@slack/web-api**: Slack integration
- **vite**: Frontend build tool
- **typescript**: Language
- **tailwindcss**: CSS framework
- **drizzle-kit**: Database migration tools

## Recent Changes

- **Implemented centralized cache update filtering system** - Built comprehensive granular cache update type system that eliminates unnecessary cache invalidations across all admin panel operations. System auto-detects cache types (team-members, notifications, entities, users, tenants, metrics, etc.) and uses centralized filtering rules to broadcast only to components that need specific updates. Summary Dashboard now receives only entities/metrics updates, not team member changes, dramatically reducing unnecessary re-renders.
- **FIXED: Real-time team member updates** - Resolved critical issue where team dashboard wouldn't update in real-time when members were added/removed via admin panel. Fixed WebSocket broadcasting logic that was in unused code path and corrected message format to match useWebSocket expectations.
- Completed FastAPI integration for all 8 endpoints with comprehensive error handling and fallback mechanisms
- Fixed major architectural issue: TeamDashboard now uses team-specific data instead of tenant-level summary data
- Updated /api/dashboard/summary endpoint to support both team dashboards and summary dashboard with backward compatibility
- Added team-specific cache methods (getTeamMetricsByRange, getTeamTrendsByRange, calculateTeamMetricsForDateRange)
- Fixed timezone issue in date range formatting: replaced UTC-based toISOString() methods with date-fns format(date, 'yyyy-MM-dd') to prevent off-by-one-day errors near midnight in different timezones
- Implemented user deactivation feature: Added is_active field to user data model, visual differentiation for expired users on team dashboards, filtered inactive users from dropdowns, and maintained admin removal capabilities with FastAPI/Express fallback integration