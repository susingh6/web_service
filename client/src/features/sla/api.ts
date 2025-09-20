import { Entity } from '@shared/schema';
import { endpoints, isDevelopment, isStaging, isProduction } from '@/config';
import { apiRequest } from '@/lib/queryClient';

// Check if FastAPI is available (for development fallback only)
async function checkFastAPIAvailable(): Promise<boolean> {
  try {
    // Try FastAPI health endpoint with short timeout
    const response = await fetch('/api/v1/health', { 
      method: 'GET',
      signal: AbortSignal.timeout(1000) // 1 second timeout
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Normalize entity field names (camelCase ↔ snake_case)
function normalizeEntity(entity: any): Entity {
  return {
    ...entity,
    is_active: entity.is_active ?? entity.isActive,
    is_entity_owner: entity.is_entity_owner ?? entity.isEntityOwner,
    // Ensure camelCase fields for UI compatibility
    isActive: entity.isActive ?? entity.is_active,
    isEntityOwner: entity.isEntityOwner ?? entity.is_entity_owner,
  };
}

// Express fallback request function (development only)
async function expressApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add session headers if available (for continuity with Express sessions)
  const sessionId = localStorage.getItem('fastapi_session_id');
  const userData = localStorage.getItem('fastapi_user');
  
  if (sessionId && userData) {
    try {
      const user = JSON.parse(userData);
      headers["X-Session-ID"] = sessionId;
      headers["X-User-ID"] = String(user.user_id || '');
      headers["X-User-Email"] = user.email || '';
      headers["X-Session-Type"] = user.type || 'client_credentials';
      headers["X-User-Roles"] = Array.isArray(user.roles) ? user.roles.join(',') : (user.roles || '');
      headers["X-User-Name"] = user.name || '';
    } catch (error) {
      console.warn('Failed to parse user data for headers:', error);
      headers["X-Session-ID"] = sessionId;
    }
  }
  
  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // Important for Express session cookies
  });

  if (!response.ok) {
    const text = (await response.text()) || response.statusText;
    
    // Try to parse as JSON to extract a specific error message
    try {
      const errorData = JSON.parse(text);
      if (errorData && typeof errorData.message === 'string') {
        throw new Error(errorData.message);
      }
    } catch (parseError) {
      // If JSON parsing fails, fall back to original behavior
    }
    
    throw new Error(`${response.status}: ${text}`);
  }
  
  return response;
}

// Environment-aware API request function
async function environmentAwareApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // In production/staging: Always use FastAPI with proper RBAC
  if (isProduction || isStaging) {
    console.log(`[${isProduction ? 'PRODUCTION' : 'STAGING'}] Using FastAPI with RBAC enforcement`);
    return await apiRequest(method, url, data);
  }
  
  // In development: Try FastAPI first, fallback to Express if unavailable
  if (isDevelopment) {
    const isFastAPIAvailable = await checkFastAPIAvailable();
    
    if (isFastAPIAvailable) {
      console.log('[DEVELOPMENT] Using FastAPI');
      return await apiRequest(method, url, data);
    } else {
      console.log('[DEVELOPMENT] FastAPI unavailable, falling back to Express');
      return await expressApiRequest(method, url, data);
    }
  }
  
  // Default fallback (should not reach here)
  console.warn('Unknown environment, defaulting to FastAPI');
  return await apiRequest(method, url, data);
}

// Entity-specific request function with type-aware fallback support
export async function entityRequest(
  method: string,
  entityType: 'table' | 'dag',
  operation: 'create' | 'bulk',
  data?: unknown | undefined,
): Promise<Response> {
  // Select primary and fallback endpoints based on entity type and operation
  let primaryEndpoint: string;
  let fallbackEndpoint: string | undefined;
  
  if (entityType === 'table') {
    primaryEndpoint = operation === 'bulk' ? endpoints.tablesBulk : endpoints.tables;
    fallbackEndpoint = operation === 'bulk' ? endpoints.tablesBulkFallback : endpoints.tablesFallback;
  } else {
    primaryEndpoint = operation === 'bulk' ? endpoints.dagsBulk : endpoints.dags;
    fallbackEndpoint = operation === 'bulk' ? endpoints.dagsBulkFallback : endpoints.dagsFallback;
  }
  
  console.log(`[ENTITY_REQUEST] ${method} ${entityType} (${operation}) - Primary: ${primaryEndpoint}, Fallback: ${fallbackEndpoint || 'none'}`);
  
  // In production/staging: Always use FastAPI with proper RBAC
  if (isProduction || isStaging) {
    console.log(`[${isProduction ? 'PRODUCTION' : 'STAGING'}] Using FastAPI with RBAC enforcement`);
    return await apiRequest(method, primaryEndpoint, data);
  }
  
  // In development: Try FastAPI first, fallback to Express on failure
  if (isDevelopment) {
    try {
      console.log('[DEVELOPMENT] Trying FastAPI for entity operation');
      const response = await apiRequest(method, primaryEndpoint, data);
      
      // If response is 404 or 500+, try Express fallback
      if (!response.ok && (response.status === 404 || response.status >= 500)) {
        throw new Error(`FastAPI endpoint returned ${response.status}`);
      }
      
      return response;
    } catch (error) {
      if (!fallbackEndpoint) {
        throw new Error(`FastAPI failed and no Express fallback configured for ${entityType} ${operation} operation: ${error}`);
      }
      
      console.log(`[DEVELOPMENT] FastAPI failed (${error}), falling back to Express for entity operation`);
      return await expressApiRequest(method, fallbackEndpoint, data);
    }
  }
  
  // Default fallback (should not reach here)
  console.warn('Unknown environment, defaulting to FastAPI for entity operation');
  return await apiRequest(method, primaryEndpoint, data);
}

export const teamsApi = {
  getAll: async (teamName?: string) => {
    let url = endpoints.teams;
    if (teamName) {
      url += `?teamName=${encodeURIComponent(teamName)}`;
    }
    const res = await environmentAwareApiRequest('GET', url);
    return await res.json();
  },
};

export const tenantsApi = {
  getAll: async (activeOnly?: boolean) => {
    let url = endpoints.tenants;
    if (activeOnly) {
      url += `?active_only=true`;
    }
    const res = await environmentAwareApiRequest('GET', url);
    return await res.json();
  },
  create: async (tenantData: any) => {
    const res = await environmentAwareApiRequest('POST', endpoints.admin.tenants.create, tenantData);
    return await res.json();
  },
  update: async (tenantId: number, tenantData: any) => {
    const res = await environmentAwareApiRequest('PUT', endpoints.admin.tenants.update(tenantId), tenantData);
    return await res.json();
  },
  disable: async (tenantId: number) => {
    const res = await environmentAwareApiRequest('PUT', endpoints.admin.tenants.disable(tenantId));
    return await res.json();
  },
};

export const entitiesApi = {
  getAll: async (tenant?: string) => {
    let url = endpoints.entities;
    if (tenant) {
      url += `?tenant=${encodeURIComponent(tenant)}`;
    }
    const res = await environmentAwareApiRequest('GET', url);
    const entities = await res.json();
    return entities.map(normalizeEntity);
  },
  getById: async (id: number) => {
    const res = await environmentAwareApiRequest('GET', endpoints.entity.byId(id));
    return await res.json();
  },
  getByTeam: async (teamId: number) => {
    const res = await environmentAwareApiRequest('GET', endpoints.entity.byTeam(teamId));
    const entities = await res.json();
    return entities.map(normalizeEntity);
  },
  getByType: async (type: string) => {
    const res = await environmentAwareApiRequest('GET', `${endpoints.entities}?type=${encodeURIComponent(type)}`);
    const entities = await res.json();
    return entities.map(normalizeEntity);
  },
  create: async (entityData: any) => {
    const res = await environmentAwareApiRequest('POST', endpoints.entities, entityData);
    const entity = await res.json();
    return normalizeEntity(entity);
  },
  update: async (payload: { id: number; updates: any }) => {
    console.log('🌐 API UPDATE REQUEST START:', payload);
    
    const res = await environmentAwareApiRequest('PUT', endpoints.entity.byId(payload.id), payload.updates);
    
    console.log('🌐 API UPDATE RESPONSE:', { status: res.status, ok: res.ok, statusText: res.statusText });
    
    const result = await res.json();
    console.log('🌐 API UPDATE SUCCESS:', result);
    return normalizeEntity(result);
  },
  delete: async (id: number) => {
    const res = await environmentAwareApiRequest('DELETE', endpoints.entity.byId(id));
    return res.ok;
  },
};

export const dagsApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await environmentAwareApiRequest('GET', '/api/dags');
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await environmentAwareApiRequest('GET', endpoints.entity.byId(id));
    return await res.json();
  },
};

export const tablesApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await environmentAwareApiRequest('GET', '/api/tables');
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await environmentAwareApiRequest('GET', endpoints.entity.byId(id));
    return await res.json();
  },
};

export const dashboardApi = {
  getSummary: async (tenant?: string, startDate?: string, endDate?: string) => {
    let url = endpoints.dashboard.summary;
    const params = new URLSearchParams();
    
    if (tenant) {
      params.append('tenant', tenant);
    }
    if (startDate) {
      params.append('startDate', startDate);
    }
    if (endDate) {
      params.append('endDate', endDate);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    console.log('[DEBUG] dashboardApi.getSummary - calling URL:', url);
    const res = await environmentAwareApiRequest('GET', url);
    const jsonData = await res.json();
    console.log('[DEBUG] dashboardApi.getSummary - received data:', jsonData);
    return jsonData;
  },
  getTeamPerformance: async (teamId: number) => {
    const res = await environmentAwareApiRequest('GET', endpoints.dashboard.teamPerformance(teamId));
    return await res.json();
  },
  getComplianceTrend: async (startDate: string, endDate: string, filter?: string) => {
    let url = `${endpoints.dashboard.complianceTrend}?startDate=${startDate}&endDate=${endDate}`;
    if (filter) {
      url += `&filter=${filter}`;
    }
    const res = await environmentAwareApiRequest('GET', url);
    return await res.json();
  }
};

export const rollbackApi = {
  // 3-tier fallback: FastAPI → Express → Mock data (development only)
  getDeletedEntitiesByName: async (entityName: string) => {
    try {
      const res = await environmentAwareApiRequest('GET', endpoints.audit.getDeletedEntitiesByName(entityName));
      return await res.json();
    } catch (error) {
      if (isDevelopment) {
        console.warn('[DEVELOPMENT] Audit API unavailable, falling back to mock data');
        // Mock search - find entities that match the name
        const MOCK_DELETED_ENTITIES = [
          {
            id: '1',
            entity_name: 'user_analytics_pipeline',
            entity_type: 'dag',
            tenant_name: 'Data Engineering123',
            team_name: 'Analytics Team',
            deleted_date: '2025-09-15T10:30:00Z',
            deleted_by: 'john.doe@company.com',
            entity_id: 'dag_123',
            tenant_id: '1',
            team_id: '1'
          },
          {
            id: '2',
            entity_name: 'customer_data_table',
            entity_type: 'table',
            tenant_name: 'Marketing Ops',
            team_name: 'Customer Insights',
            deleted_date: '2025-09-14T15:45:00Z',
            deleted_by: 'jane.smith@company.com',
            entity_id: 'table_456',
            tenant_id: '2',
            team_id: '2'
          },
          {
            id: '3',
            entity_name: 'sales_reporting_dag',
            entity_type: 'dag',
            tenant_name: 'Sales Operations',
            team_name: 'Sales Analytics',
            deleted_date: '2025-09-13T09:15:00Z',
            deleted_by: 'mike.wilson@company.com',
            entity_id: 'dag_789',
            tenant_id: '3',
            team_id: '3'
          },
          {
            id: '4',
            entity_name: 'inventory_tracking_table',
            entity_type: 'table',
            tenant_name: 'Operations',
            team_name: 'Supply Chain',
            deleted_date: '2025-09-12T14:20:00Z',
            deleted_by: 'sarah.johnson@company.com',
            entity_id: 'table_101',
            tenant_id: '4',
            team_id: '4'
          }
        ];
        return MOCK_DELETED_ENTITIES.filter(entity => 
          entity.entity_name.toLowerCase().includes(entityName.toLowerCase())
        );
      }
      throw error;
    }
  },
  
  // 3-tier fallback: FastAPI → Express → Mock data (development only)
  getDeletedEntitiesByTeamTenant: async (tenantId: number, teamId: number) => {
    try {
      const res = await environmentAwareApiRequest('GET', endpoints.audit.getDeletedEntitiesByTeamTenant(tenantId, teamId));
      return await res.json();
    } catch (error) {
      if (isDevelopment) {
        console.warn('[DEVELOPMENT] Audit API unavailable, falling back to mock data');
        // Mock search - find entities for the selected team/tenant
        const MOCK_DELETED_ENTITIES = [
          {
            id: '1',
            entity_name: 'user_analytics_pipeline',
            entity_type: 'dag',
            tenant_name: 'Data Engineering123',
            team_name: 'Analytics Team',
            deleted_date: '2025-09-15T10:30:00Z',
            deleted_by: 'john.doe@company.com',
            entity_id: 'dag_123',
            tenant_id: '1',
            team_id: '1'
          },
          {
            id: '2',
            entity_name: 'customer_data_table',
            entity_type: 'table',
            tenant_name: 'Marketing Ops',
            team_name: 'Customer Insights',
            deleted_date: '2025-09-14T15:45:00Z',
            deleted_by: 'jane.smith@company.com',
            entity_id: 'table_456',
            tenant_id: '2',
            team_id: '2'
          },
          {
            id: '3',
            entity_name: 'sales_reporting_dag',
            entity_type: 'dag',
            tenant_name: 'Sales Operations',
            team_name: 'Sales Analytics',
            deleted_date: '2025-09-13T09:15:00Z',
            deleted_by: 'mike.wilson@company.com',
            entity_id: 'dag_789',
            tenant_id: '3',
            team_id: '3'
          },
          {
            id: '4',
            entity_name: 'inventory_tracking_table',
            entity_type: 'table',
            tenant_name: 'Operations',
            team_name: 'Supply Chain',
            deleted_date: '2025-09-12T14:20:00Z',
            deleted_by: 'sarah.johnson@company.com',
            entity_id: 'table_101',
            tenant_id: '4',
            team_id: '4'
          }
        ];
        return MOCK_DELETED_ENTITIES.filter(entity => 
          entity.tenant_id === tenantId.toString() && entity.team_id === teamId.toString()
        );
      }
      throw error;
    }
  },
  
  // 2-tier fallback: FastAPI → Express → NO mock fallback (write operation)
  performRollback: async (entityData: any) => {
    const res = await environmentAwareApiRequest('POST', endpoints.audit.performRollback, entityData);
    return await res.json();
  },
};