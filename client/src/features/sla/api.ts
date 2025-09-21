import { Entity } from '@shared/schema';
import { endpoints, isDevelopment, isStaging, isProduction, buildUrlWithParams } from '@/config';
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
  updateEntity: async ({ type, entityName, entity, updates }: { 
    type: 'table' | 'dag'; 
    entityName?: string; 
    entity?: any; 
    updates: any; 
  }) => {
    console.log(`[UPDATE_ENTITY_DEBUG] Input parameters:`, { type, entityName, entity, updates });
    
    // Defensively resolve entity name with fallbacks
    let resolvedEntityName = entityName;
    if (!resolvedEntityName && entity) {
      console.log(`[UPDATE_ENTITY_DEBUG] Entity object:`, {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        dag_name: entity.dag_name,
        table_name: entity.table_name,
        entity_name: entity.entity_name
      });
      
      if (type === 'dag') {
        resolvedEntityName = entity.dag_name || entity.name || entity.entity_name;
      } else {
        resolvedEntityName = entity.table_name || entity.name || entity.entity_name;
      }
    }
    
    if (!resolvedEntityName) {
      throw new Error(`Cannot determine entity name for ${type} update`);
    }
    
    console.log(`[UPDATE_ENTITY] Updating ${type}: "${resolvedEntityName}"`);
    
    // Use type-specific endpoints with FastAPI/Express fallback pattern
    const primaryEndpoint = type === 'table' ? 
      endpoints.tablesUpdate(resolvedEntityName) : 
      endpoints.dagsUpdate(resolvedEntityName);
    
    const fallbackEndpoint = type === 'table' ? 
      endpoints.tablesUpdateFallback?.(resolvedEntityName) : 
      endpoints.dagsUpdateFallback?.(resolvedEntityName);

    console.log(`[UPDATE_ENTITY] Primary URL: ${primaryEndpoint}, Fallback URL: ${fallbackEndpoint}`);

    try {
      console.log('[UPDATE_ENTITY] Trying FastAPI for entity update');
      const res = await environmentAwareApiRequest('PATCH', primaryEndpoint, updates);
      console.log(`[UPDATE_ENTITY] FastAPI response: ${res.status}`);
      
      if (!res.ok) {
        throw new Error(`FastAPI returned ${res.status}`);
      }
      
      const result = await res.json();
      console.log('🌐 UPDATE_ENTITY SUCCESS:', result);
      return normalizeEntity(result);
    } catch (error) {
      console.log(`[UPDATE_ENTITY] FastAPI failed (${error}), falling back to Express`);
      
      if (fallbackEndpoint) {
        const res = await environmentAwareApiRequest('PATCH', fallbackEndpoint, updates);
        console.log(`[UPDATE_ENTITY] Express fallback response: ${res.status}`);
        
        if (!res.ok) {
          throw new Error(`Express fallback returned ${res.status}`);
        }
        
        const result = await res.json();
        console.log('🌐 UPDATE_ENTITY FALLBACK SUCCESS:', result);
        return normalizeEntity(result);
      } else {
        throw error; // No fallback available, re-throw the original error
      }
    }
  },
  readEntityByName: async ({ type, entityName, entity, teamName }: { 
    type: 'table' | 'dag'; 
    entityName?: string; 
    entity?: any; 
    teamName?: string;
  }) => {
    console.log(`[READ_ENTITY_DEBUG] Input parameters:`, { type, entityName, entity, teamName });
    
    // Defensively resolve entity name with fallbacks
    let resolvedEntityName = entityName;
    if (!resolvedEntityName && entity) {
      console.log(`[READ_ENTITY_DEBUG] Entity object:`, {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        dag_name: entity.dag_name,
        table_name: entity.table_name
      });
      
      if (type === 'dag') {
        resolvedEntityName = entity.dag_name || entity.name;
      } else {
        resolvedEntityName = entity.table_name || entity.name;
      }
    }
    
    if (!resolvedEntityName) {
      throw new Error(`Cannot determine entity name for ${type} read`);
    }
    
    console.log(`[READ_ENTITY] Reading ${type}: "${resolvedEntityName}"`);
    
    // Use type-specific endpoints with FastAPI/Express fallback pattern
    const primaryEndpoint = type === 'table' ? 
      endpoints.tablesGet(resolvedEntityName) : 
      endpoints.dagsGet(resolvedEntityName);
    
    const fallbackEndpoint = type === 'table' ? 
      endpoints.tablesGetFallback?.(resolvedEntityName) : 
      endpoints.dagsGetFallback?.(resolvedEntityName);

    // Build query params if team is specified
    const queryParams = teamName ? { team: teamName } : undefined;
    const primaryUrl = buildUrlWithParams(primaryEndpoint, queryParams);
    const fallbackUrl = fallbackEndpoint ? buildUrlWithParams(fallbackEndpoint, queryParams) : undefined;

    console.log(`[READ_ENTITY] Primary URL: ${primaryUrl}, Fallback URL: ${fallbackUrl}`);

    try {
      console.log('[READ_ENTITY] Trying FastAPI for entity read');
      const res = await environmentAwareApiRequest('GET', primaryUrl);
      console.log(`[READ_ENTITY] FastAPI response: ${res.status}`);
      
      if (!res.ok) {
        throw new Error(`FastAPI returned ${res.status}`);
      }
      
      const result = await res.json();
      console.log('🌐 READ_ENTITY SUCCESS:', result);
      return normalizeEntity(result);
    } catch (error) {
      console.log(`[READ_ENTITY] FastAPI failed (${error}), falling back to Express`);
      
      if (fallbackUrl) {
        const res = await environmentAwareApiRequest('GET', fallbackUrl);
        console.log(`[READ_ENTITY] Express fallback response: ${res.status}`);
        
        if (!res.ok) {
          throw new Error(`Express fallback returned ${res.status}`);
        }
        
        const result = await res.json();
        console.log('🌐 READ_ENTITY FALLBACK SUCCESS:', result);
        return normalizeEntity(result);
      } else {
        throw error; // No fallback available, re-throw the original error
      }
    }
  },
  deleteEntity: async ({ type, entityName, entity }: { type: 'table' | 'dag', entityName?: string, entity?: any }) => {
    console.log(`[DELETE_ENTITY_DEBUG] Input parameters:`, { type, entityName, entity });
    
    // Defensively resolve entity name with fallbacks
    let resolvedEntityName = entityName;
    if (!resolvedEntityName && entity) {
      console.log(`[DELETE_ENTITY_DEBUG] Entity object:`, {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        dag_name: entity.dag_name,
        table_name: entity.table_name,
        entity_name: entity.entity_name
      });
      
      if (type === 'dag') {
        resolvedEntityName = entity.dag_name || entity.name || entity.entity_name;
      } else {
        resolvedEntityName = entity.table_name || entity.name || entity.entity_name;
      }
    }
    
    if (!resolvedEntityName) {
      throw new Error(`Cannot determine entity name for ${type} deletion`);
    }
    
    console.log(`[DELETE_ENTITY] Deleting ${type}: "${resolvedEntityName}"`);
    
    // Use type-specific endpoints with FastAPI/Express fallback pattern
    const primaryEndpoint = type === 'table' ? 
      endpoints.tablesDelete(resolvedEntityName) : 
      endpoints.dagsDelete(resolvedEntityName);
    
    const fallbackEndpoint = type === 'table' ? 
      endpoints.tablesDeleteFallback?.(resolvedEntityName) : 
      endpoints.dagsDeleteFallback?.(resolvedEntityName);

    console.log(`[DELETE_ENTITY] Primary URL: ${primaryEndpoint}, Fallback URL: ${fallbackEndpoint}`);

    try {
      console.log('[DELETE_ENTITY] Trying FastAPI for entity deletion');
      const res = await environmentAwareApiRequest('DELETE', primaryEndpoint);
      console.log(`[DELETE_ENTITY] FastAPI response: ${res.status}`);
      return res.ok;
    } catch (error) {
      console.log(`[DELETE_ENTITY] FastAPI failed (${error}), falling back to Express`);
      
      if (fallbackEndpoint) {
        const res = await environmentAwareApiRequest('DELETE', fallbackEndpoint);
        console.log(`[DELETE_ENTITY] Express fallback response: ${res.status}`);
        return res.ok;
      } else {
        throw error; // No fallback available, re-throw the original error
      }
    }
  },
  // Keep legacy delete for backward compatibility but deprecated
  delete: async (entityName: string, entityType: 'table' | 'dag') => {
    console.warn('[DEPRECATED] Use deleteEntity instead of delete');
    return entitiesApi.deleteEntity({ type: entityType, entityName });
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
  // FastAPI only (no Express/mock fallback). Surfaces clear error if unavailable.
  getDeletedEntitiesByName: async (entityName: string) => {
    const res = await apiRequest('GET', endpoints.audit.getDeletedEntitiesByName(entityName));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `FastAPI returned ${res.status}`);
    }
    return await res.json();
  },
  
  // FastAPI only (no Express/mock fallback). Surfaces clear error if unavailable.
  getDeletedEntitiesByTeamTenant: async (tenantId: number, teamId: number) => {
    const res = await apiRequest('GET', endpoints.audit.getDeletedEntitiesByTeamTenant(tenantId, teamId));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `FastAPI returned ${res.status}`);
    }
    return await res.json();
  },
  
  // 2-tier fallback: FastAPI → Express → NO mock fallback (write operation)
  performRollback: async (entityData: any) => {
    const res = await environmentAwareApiRequest('POST', endpoints.audit.performRollback, entityData);
    return await res.json();
  },
};