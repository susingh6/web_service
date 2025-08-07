# SLA Management Tool

## Overview

This is a comprehensive enterprise SLA monitoring application designed to track and monitor Service Level Agreements for data tables and DAGs across multiple teams. The application provides real-time monitoring, alerting, and management capabilities for ensuring data processing reliability and performance. Its business vision is to provide a scalable, efficient, and user-friendly solution for organizations to maintain data integrity and operational excellence, thereby minimizing downtime and improving overall data ecosystem health.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **State Management**: Redux Toolkit for global state, React Query for server state
- **UI Components**: Hybrid approach using Material-UI v5 and shadcn/ui
- **Styling**: Tailwind CSS with custom theming and Material-UI's styling system
- **Authentication**: Azure AD SSO integration using MSAL.js v2
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Yup validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with local strategy and Azure AD integration
- **Session Management**: Express sessions
- **API Design**: RESTful API with consistent error handling and logging middleware

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL adapter
- **Database Provider**: Neon Database for serverless PostgreSQL hosting
- **Schema Management**: Drizzle migrations for version-controlled database changes
- **Mock Data**: Comprehensive mock data system for development and testing

### Key Components
- **Authentication System**: Azure AD SSO, local authentication, session management, and protected routes.
- **Dashboard System**: Summary and team-specific dashboards with real-time monitoring and interactive charts (Recharts).
- **Entity Management**: Support for data tables and DAGs with CRUD operations, bulk management, and status tracking.
- **Task Management (DAGs)**: Drag-and-drop task prioritization, status tracking, dependency management, and performance metrics.
- **Notification System**: Extensible architecture supporting email, Slack, and PagerDuty, with configurable triggers and channels.
- **Centralized API Configuration**: Unified API endpoint management across development, staging, and production environments for consistent behavior.
- **Server-side Caching**: Redis-based distributed caching with automatic fallback, distributed locking, and pub/sub for real-time updates.

### UI/UX Decisions
- **Consistent Styling**: Tailwind CSS and Material-UI ensure a modern and cohesive visual experience.
- **Intuitive Navigation**: Clear dashboard layouts and simplified authentication flow.
- **Informative Displays**: Interactive charts, detailed metric cards with tooltips, and structured tables for entity management.
- **Streamlined Workflows**: Modals for entity management, bulk uploads, and notification configurations are designed for efficiency.

## External Dependencies

### Frontend Dependencies
- `@azure/msal-browser`
- `@mui/material`
- `@reduxjs/toolkit`
- `@tanstack/react-query`
- `react-hook-form`
- `recharts`

### Backend Dependencies
- `@neondatabase/serverless`
- `drizzle-orm`
- `passport`
- `express-session`
- `@sendgrid/mail`
- `@slack/web-api`