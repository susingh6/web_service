# FastAPI Service Requirements

This document outlines the required endpoints and filtering logic that the external FastAPI service must implement to ensure consistency with the Express fallback system.

## Critical Entity Filtering Requirements

### Team Dashboard vs Summary Dashboard

The key difference in entity counting logic:

- **Team Dashboard**: Counts ALL active entities (both entity owners and non-owners)
  - Filter: `WHERE is_active != false`
  - Includes both `is_entity_owner = true` AND `is_entity_owner = false` entities

- **Summary Dashboard**: Counts only active entity owners
  - Filter: `WHERE is_entity_owner = true AND is_active != false`
  - Only includes `is_entity_owner = true` entities

## Required FastAPI Endpoints

### 1. GET /api/v1/entities

**Purpose**: Retrieve entities with filtering support

**Parameters**:
- `teamId` (optional): Team ID for team-specific entities
- `tenant` (optional): Tenant name for tenant-specific entities
- `type` (optional): Entity type filter ('table' or 'dag')

**Filtering Logic**:

```python
# Team Dashboard requests (teamId provided)
if team_id:
    # Return ALL active entities for the team
    entities = db.query(Entity).filter(
        Entity.teamId == team_id,
        Entity.is_active != False  # Exclude inactive entities
    ).all()

# Summary Dashboard requests (tenant provided, no teamId)
elif tenant:
    # Return only active entity owners for the tenant
    entities = db.query(Entity).filter(
        Entity.tenant_name == tenant,
        Entity.is_entity_owner == True,
        Entity.is_active != False
    ).all()

# All entities (fallback)
else:
    entities = db.query(Entity).all()
```

### 2. GET /api/dashboard/summary

**Purpose**: Retrieve dashboard metrics and compliance trends

**Parameters**:
- `tenant` (required): Tenant name
- `team` (optional): Team name for team-specific dashboard
- `startDate` (optional): Start date for custom date range
- `endDate` (optional): End date for custom date range

**Filtering Logic**:

```python
def calculate_dashboard_metrics(tenant_name, team_name=None, start_date=None, end_date=None):
    base_query = db.query(Entity).filter(Entity.tenant_name == tenant_name)
    
    if team_name:
        # Team Dashboard: Include ALL active entities
        entities = base_query.filter(
            Entity.team_name == team_name,
            Entity.is_active != False
        )
    else:
        # Summary Dashboard: Include only active entity owners
        entities = base_query.filter(
            Entity.is_entity_owner == True,
            Entity.is_active != False
        )
    
    if start_date and end_date:
        entities = entities.filter(
            Entity.lastRefreshed >= start_date,
            Entity.lastRefreshed <= end_date
        )
    
    entities = entities.all()
    
    # Calculate metrics
    tables = [e for e in entities if e.type == 'table']
    dags = [e for e in entities if e.type == 'dag']
    
    return {
        "metrics": {
            "overallCompliance": calculate_avg_sla(entities),
            "tablesCompliance": calculate_avg_sla(tables),
            "dagsCompliance": calculate_avg_sla(dags),
            "entitiesCount": len(entities),
            "tablesCount": len(tables),
            "dagsCount": len(dags)
        },
        "complianceTrends": generate_compliance_trends(entities, tables, dags),
        "lastUpdated": datetime.utcnow().isoformat(),
        "cached": False,
        "scope": "team" if team_name else "tenant"
    }
```

### 3. Other Required Endpoints

The FastAPI service should also implement these endpoints with appropriate RBAC:

- `GET /api/v1/tenants` - List tenants
- `GET /api/v1/teams` - List teams
- `GET /api/v1/users` - List users
- `POST/PUT/DELETE /api/v1/entities/{id}` - Entity CRUD operations
- `GET /api/v1/entities/{id}/history` - Entity history
- `GET /api/v1/entities/{id}/tasks` - Entity tasks (for DAGs)

## Authentication & Authorization

The FastAPI service must handle:
- Session-based authentication (X-Session-ID header)
- Role-based access control (RBAC)
- Tenant/team-based data isolation

## Real-time Updates

When entities are created/updated/deleted, the FastAPI service should:
1. Update the database
2. Send WebSocket notifications to clients
3. Invalidate relevant caches

## Testing Requirements

To verify the FastAPI service works correctly:

1. **Entity Counting Test**:
   - Create 2 DAG entities for PGM team (1 owner, 1 non-owner, both active)
   - Team Dashboard should show "2 Entities Monitored"
   - Summary Dashboard should show "1 Entities Monitored"

2. **Entity Deletion Test**:
   - Delete an entity
   - Verify counts update immediately in real-time
   - Verify WebSocket notifications are sent

3. **Inactive Entity Test**:
   - Set an entity to `is_active = false`
   - Verify it's excluded from both Team and Summary dashboard counts

## Environment Variables

The FastAPI service should respect these environment variables:
- `FASTAPI_BASE_URL` - Base URL for the service (default: http://localhost:8080)
- `ENABLE_FASTAPI_INTEGRATION` - Whether to use FastAPI (default: false)

## Deployment Notes

- **Development**: Express fallback handles requests when FastAPI is unavailable
- **Production**: Express blocks fallback routes for security, FastAPI must be available
- **Staging**: Same as production

The client automatically detects FastAPI availability via `/api/v1/health` endpoint and falls back to Express in development only.
