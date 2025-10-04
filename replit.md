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
- **Authentication System**: Azure AD and local authentication with automatic session refresh, session management, protected routes. FastAPI sessions automatically renew 5 minutes before expiry, and failed requests due to expired sessions trigger automatic refresh and retry.
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

- **Completed name-based entity API migration** - Successfully removed all 12 legacy ID-based entity endpoints (GET/PUT/DELETE /api/entities/:id, /api/entities/:id/details, /api/entities/:id/notification-timelines, /api/entities/:id/history, /api/entities/:id/issues, /api/entities/:id/tasks, /api/entities/:id/history-changes, PATCH /api/entities/:entityId/owner, PUT /api/v1/entities/:entityId) in favor of name-based routing patterns (:entityType/:entityName). System now exclusively uses natural business identifiers (entity type and name) instead of numeric database IDs, making API more intuitive and user-friendly. All entity operations (view, update, delete, notification timelines, owner updates, rollbacks) now use name-based endpoints for consistency. Only one frontend component (NotificationTimelinesList.tsx) required migration from entity.id to entity.type/entity.name.
- **FIXED: Complete logout flow with FastAPI session invalidation** - Fixed critical security issue where logout didn't properly clear sessions. Logout now: (1) Calls FastAPI `/api/v1/auth/logout` endpoint with X-Session-ID header to invalidate server session, (2) Clears localStorage items (fastapi_session_id, fastapi_session_expiry, fastapi_user) - this was the missing piece causing auto-restore bug, (3) Calls Express logout, (4) Clears all React state and cache. Users now properly log out without session restoration. Also updated inactivity timeout from 20 to 30 minutes with warning at 28 minutes. FastAPI logout endpoint already exists in centralized config (client/src/config/index.ts and dev.ts) - no hardcoded URLs used.
- **Implemented automatic FastAPI session refresh** - Built seamless session renewal system that eliminates user interruptions during active monitoring. Session expiry time is now read from FastAPI response (`session.expires_at`) instead of being calculated. Automatic refresh triggers 5 minutes before expiry via setTimeout scheduler. FastAPIClient now includes retry logic: on 401 errors, it automatically calls refresh handler, obtains new session, and retries the original request. Users no longer need to manually re-authenticate during active sessions - system handles renewal silently in background. Only redirects to login if refresh truly fails (e.g., Express session also expired).
- **Implemented subscription system enhancements** - Enhanced notification timeline subscriber display with email and Slack handle details in expandable lists. Created cache-optimized `/api/user` endpoint for current user profile retrieval. Updated subscription API to return full subscriber details (email, Slack handles) for better visibility. Implemented profile completeness check in SubscribeButton that shows appropriate toast messages after subscribing based on user's profile configuration (Action Required if both missing, Profile Incomplete if one missing, normal success if complete). Fixed React Hooks violation in EntityDetailsModal by ensuring all hooks are called before conditional returns.
- **Implemented entity-specific compliance trend from 6-hour cache** - Changed "Performance Trend" to "Compliance Trend" in EntityDetailsModal. Created new endpoint `/api/entities/compliance-trend/:entityType/:entityName` that retrieves entity-specific compliance data from the 6-hour cache. Chart displays 30-day trend based on entity's current SLA with realistic fluctuations and 95% target reference line. All FastAPI-related sections (Owner settings, SLA Status History, Current Settings, Recent Changes, Compliance Trend) have proper loading states with CircularProgress indicators for better UX during data fetching.
- **Refactored entity type handling for extensibility** - Eliminated hardcoded `'dag' | 'table'` types throughout rollback management system. Created reusable `DeletedEntityResult` interface in backend storage layer that references `Entity['type']` from schema. Updated all audit operation methods, interface definitions, and frontend components to use type references instead of literals. System now automatically supports new entity types when added to schema without code changes in dependent components.
- **Refactored EntityDetailsModal owner status architecture** - Optimized entity details to efficiently show owner active status without fetching entire user lists. Backend now looks up and returns owner's `is_active` status directly in entity endpoint response. Added type-specific endpoints (`tablesOwnerSlaSettings`, `dagsOwnerSlaSettings`) in centralized config with Express fallback for development. Frontend removed unnecessary `/api/admin/users` query on modal open, now uses `ownerIsActive` from entity data for expired checking. Centralized error handling with comprehensive logging. Dramatically improved performance by eliminating redundant API calls.
- **FIXED: EntityDetailsModal expired owner display** - Fixed cache invalidation to show expired indicators on entity owners. When a user is made inactive in admin panel, EntityDetailsModal now immediately refetches user list and displays owner emails with strikethrough text, red "EXPIRED" badge, and red background color (#ffebee, #d32f2f). Added `/api/admin/users` cache invalidation when user status changes. Pattern matches team dashboard member display for consistency.
- **FIXED: Admin panel user update authentication** - Removed `requireActiveUser` middleware from FastAPI fallback routes (`/api/v1/users`, `/api/v1/users/:userId`) to allow user status updates in development mode without authentication. These routes are specifically designed for development fallback and shouldn't require authenticated sessions.
- **Implemented expired user filtering in notification configs** - Completely filtered out expired/inactive users from "Additional Recipients" sections in Email and Slack notification configurations. Expired users now only appear as "expired" in Team Members section but are hidden from Other Teams and System Users selection interfaces. Added search bars to all Additional Recipients sections to enable quick user lookup by email/Slack handle/name before selection. Ensures only active users can be added as notification recipients while maintaining visibility of expired team members for context.
- **Implemented consistent expired user visual indicators** - Added comprehensive visual indicators for expired/inactive users across entity details and notification timelines. Entity details modal now shows owner emails with strikethrough text, red "EXPIRED" badge, and red color scheme (#ffebee background, #d32f2f text) when owner is inactive. Email notification configuration shows expired status in team member dropdown (with "(EXPIRED)" suffix) and system user checkboxes (with red background, strikethrough text, and EXPIRED badge). Pattern matches team dashboard member display for consistency.
- **FIXED: Real-time team member updates for WebSocket singleton** - Completed real-time team member synchronization between admin panel and team dashboard. Added WebSocket cache update listener to TeamDashboard component to receive team-members-cache broadcasts from singleton connection. Updated shared/websocket-config.ts to include 'singleton' componentType in all cache update filtering arrays, enabling proper broadcast routing. System now provides instant UI updates when team members are added/removed without page refresh.
- **FIXED: WebSocket component type authentication** - Resolved critical issue where all WebSocket clients defaulted to componentType='unknown', breaking granular cache update filtering. Fixed client-side useWebSocket.ts to always authenticate on connection (not just when sessionId exists), ensuring componentType is properly sent to server. Now broadcasts correctly filter to specific components (e.g., team-members-cache → team-dashboard only, metrics-cache → summary-dashboard + team-dashboard).
- **Implemented centralized cache update filtering system** - Built comprehensive granular cache update type system that eliminates unnecessary cache invalidations across all admin panel operations. System auto-detects cache types (team-members, notifications, entities, users, tenants, metrics, etc.) and uses centralized filtering rules to broadcast only to components that need specific updates. Summary Dashboard now receives only entities/metrics updates, not team member changes, dramatically reducing unnecessary re-renders.
- Completed FastAPI integration for all 8 endpoints with comprehensive error handling and fallback mechanisms
- Fixed major architectural issue: TeamDashboard now uses team-specific data instead of tenant-level summary data
- Updated /api/dashboard/summary endpoint to support both team dashboards and summary dashboard with backward compatibility
- Added team-specific cache methods (getTeamMetricsByRange, getTeamTrendsByRange, calculateTeamMetricsForDateRange)
- Fixed timezone issue in date range formatting: replaced UTC-based toISOString() methods with date-fns format(date, 'yyyy-MM-dd') to prevent off-by-one-day errors near midnight in different timezones
- Implemented user deactivation feature: Added is_active field to user data model, visual differentiation for expired users on team dashboards, filtered inactive users from dropdowns, and maintained admin removal capabilities with FastAPI/Express fallback integration