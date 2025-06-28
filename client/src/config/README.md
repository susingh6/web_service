# Centralized API Configuration

This folder contains the centralized API configuration system for the SLA Monitoring Tool.

## Usage Examples

### Basic API Request with Config
```typescript
import { apiRequest } from '@/lib/queryClient';
import { buildUrl, endpoints } from '@/config/index';

// Simple GET request
const response = await apiRequest('GET', buildUrl(endpoints.teams));

// POST request with data
const response = await apiRequest('POST', buildUrl(endpoints.entities), entityData);

// Dynamic endpoint with parameters
const response = await apiRequest('GET', buildUrl(endpoints.entity.byTeam, teamId));
```

### Using the Centralized API Client
```typescript
import { apiClient } from '@/config/api';

// Get all teams
const teams = await apiClient.teams.getAll();

// Get entities by team
const entities = await apiClient.entities.getByTeam(teamId);

// Dashboard summary
const summary = await apiClient.dashboard.getSummary();
```

### Configuration Structure
- `dev.ts` - Development environment settings
- `staging.ts` - Staging environment settings  
- `prod.ts` - Production environment settings
- `index.ts` - Main configuration with buildUrl helper
- `api.ts` - Pre-built API client methods

## Environment Variables
Set `VITE_API_BASE_URL` to override the base URL in any environment.

## Migration from Direct URLs
Replace direct URL strings:
```typescript
// Before
const response = await fetch('/api/teams');

// After  
const response = await apiRequest('GET', buildUrl(endpoints.teams));
```