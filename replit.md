# SLA Management Tool

## Overview

This enterprise SLA monitoring application tracks and monitors Service Level Agreements for data tables and Directed Acyclic Graphs (DAGs) across multiple teams. It provides real-time monitoring, alerting, and management capabilities to ensure data processing reliability and performance, addressing a critical need in enterprise data management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Framework**: React 18 with TypeScript
- **UI Components**: Hybrid Material-UI v5 and shadcn/ui
- **Styling**: Tailwind CSS with custom theming
- **Data Visualization**: Recharts for interactive charts
- **SLA Compliance Thresholds**: Configurable color thresholds for visual indication.

### Technical Implementations
- **Frontend State Management**: Redux Toolkit (global), React Query (server state)
- **Backend Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM (Neon Database for serverless)
- **Authentication**: Azure AD SSO (MSAL.js v2, Passport.js) with local fallback; automatic session refresh and retry for 401 errors.
- **API Design**: RESTful, consistent error handling, structured JSON logging with session context.
- **Caching System**: Redis-based distributed caching with automatic in-memory fallback, distributed locking, and pub/sub for real-time updates.
- **Routing**: Wouter
- **Forms**: React Hook Form with Yup validation

### Feature Specifications
- **Authentication**: Azure AD and local authentication, session management, protected routes.
- **Dashboards**: Summary and team-specific dashboards with real-time monitoring.
- **Entity Management**: CRUD operations for data tables and DAGs, bulk management, real-time status. Uses name-based routing for API operations.
- **Task Management (DAGs)**: Priority zones, status tracking, dependency management, performance metrics.
- **Notification Configuration**: Extensible system for email, Slack, PagerDuty, with type-specific triggers and channel configurations. Filters out inactive users from recipients. Tenant-aware team member fetching for proper multi-tenant isolation.
- **User Management**: Self-service profile page, user deactivation with visual indicators for inactive users across dashboards and configurations.
- **Standardized CRUD**: Unified optimistic update pattern, operation queuing, automatic reconciliation.
- **Scheduler Integration**: External scheduler can update entities every 10 minutes via POST /api/scheduler/entity-updates (authenticated with X-Scheduler-Token header). Updates cache with new entity data, sets lastRefreshed timestamp (triggers automatic NEW badge for 6 hours), broadcasts via WebSocket, and invalidates team caches.
- **Compliance Trend**: Entity-specific 30-day compliance trend with 95% target reference, based on cached data.
- **Extensible Entity Types**: Refactored entity type handling for easy addition of new entity types.
- **Real-time Updates**: WebSocket-based real-time updates for team members, notifications, and entities with granular cache update filtering.
- **Multi-Tenant Isolation**: Team members, notifications, and cache keys properly isolated by tenant to support teams with identical names across different tenants (e.g., PGM under Data Engineering vs PGM under Analytics). All CRUD operations (add, update, remove) on team members are tenant-aware via query parameters.

## External Dependencies

- **@azure/msal-browser**: Azure AD authentication
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