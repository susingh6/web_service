import { Entity } from '@shared/schema';
import { resolveEntityIdentifier } from '@shared/entity-utils';
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
    return await apiRequest(method, url, data);
  }
  
  // In development: Try FastAPI first, fallback to Express if unavailable
  if (isDevelopment) {
    const isFastAPIAvailable = await checkFastAPIAvailable();
    
    if (isFastAPIAvailable) {
      return await apiRequest(method, url, data);
    } else {
      return await expressApiRequest(method, url, data);
    }
  }
  
  // Default fallback (should not reach here)
  console.warn('Unknown environment, defaulting to FastAPI');
  return await apiRequest(method, url, data);
}

const typeEndpointMap: Record<Entity['type'], {
  delete: (entityName: string) => string;
  deleteFallback?: (entityName: string) => string;
  expressDelete: (entityName: string, teamName?: string) => string;
}> = {
  table: {
    delete: endpoints.tablesDelete,
    deleteFallback: endpoints.tablesDeleteFallback,
    expressDelete: (entityName: string, teamName?: string) => `/api/entities/by-name/table/${encodeURIComponent(entityName)}${teamName ? `?teamName=${encodeURIComponent(teamName)}` : ''}`,
  },
  dag: {
    delete: endpoints.dagsDelete,
    deleteFallback: endpoints.dagsDeleteFallback,
    expressDelete: (entityName: string, teamName?: string) => `/api/entities/by-name/dag/${encodeURIComponent(entityName)}${teamName ? `?teamName=${encodeURIComponent(teamName)}` : ''}`,
  },
};

export const teamsApi = {
  getAll: async (teamName?: string) => {
    let url = endpoints.teams;
    if (teamName) {
      url += `?teamName=${encodeURIComponent(teamName)}`;
    }
    const res = await environmentAwareApiRequest('GET', url);
    return await res.json();
  }
};

export const tenantsApi = {
  getAll: async (activeOnly?: boolean) => {
    let url = endpoints.tenants;
    if (activeOnly) {
      url += `?active_only=true`;
    }
    const res = await environmentAwareApiRequest('GET', url);
    return await res.json();
  }
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
    // In development, prefer Express for team lists to stay consistent with Express delete fallback
    const res = isDevelopment
      ? await expressApiRequest('GET', endpoints.entity.byTeam(teamId))
      : await environmentAwareApiRequest('GET', endpoints.entity.byTeam(teamId));
    const entities = await res.json();
    return entities.map(normalizeEntity);
  },
  getByType: async (type: string) => {
    const res = await environmentAwareApiRequest('GET', `${endpoints.entities}?type=${encodeURIComponent(type)}`);
    const entities = await res.json();
    return entities.map(normalizeEntity);
  },
  create: async (entityData: any) => {
    try {
      const res = await environmentAwareApiRequest('POST', endpoints.entities, entityData);
      if (res.ok) {
        const entity = await res.json();
        return normalizeEntity(entity);
      }
      return res;
    } catch (err: any) {
      // If FastAPI path is missing in dev, fall back to Express route
      const res = await expressApiRequest('POST', '/api/entities', entityData);
      const entity = await res.json();
      return normalizeEntity(entity);
    }
  },
  bulkCreate: async (entities: any[]) => {
    if (!Array.isArray(entities) || entities.length === 0) {
      throw new Error('bulkCreate requires a non-empty array');
    }
    // Prefer FastAPI bulk if available and consistent types; otherwise fall back to Express transactional bulk
    const allType = entities[0]?.type;
    const sameType = entities.every(e => e.type === allType);
    if ((isProduction || isStaging) && sameType) {
      const bulkEndpoint = allType === 'table' ? (endpoints as any).tablesBulk : (endpoints as any).dagsBulk;
      if (typeof bulkEndpoint === 'string' || typeof bulkEndpoint === 'function') {
        const url = typeof bulkEndpoint === 'function' ? bulkEndpoint() : bulkEndpoint;
        const res = await environmentAwareApiRequest('POST', url, entities);
        const data = await res.json();
        return Array.isArray(data) ? data.map(normalizeEntity) : data;
      }
    }
    // Express transactional bulk (all-or-nothing)
    const res = await expressApiRequest('POST', '/api/entities/bulk', entities);
    const data = await res.json();
    return Array.isArray(data) ? data.map(normalizeEntity) : data;
  },
  update: async (payload: { id: number; updates: any }) => {
    const res = await environmentAwareApiRequest('PUT', endpoints.entity.byId(payload.id), payload.updates);
    if (res.ok) {
      const entity = await res.json();
      return normalizeEntity(entity);
    }
    return res;
  },
  updateEntity: async ({ type, entityName, entity, updates }: { 
    type: Entity['type']; 
    entityName?: string; 
    entity?: any; 
    updates: any; 
  }) => {
    
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
    
    // Use type-specific endpoints with FastAPI first, then Express by-name route
    const primaryEndpoint = type === 'table' ? 
      endpoints.tablesUpdate(resolvedEntityName) : 
      endpoints.dagsUpdate(resolvedEntityName);
    // Include teamName when available to disambiguate lookups (matches delete behavior)
    const inferredTeamName = (entity && (entity.team_name || entity.teamName)) || (updates && (updates.team_name || updates.teamName));
    const expressByName = `/api/entities/by-name/${encodeURIComponent(type)}/${encodeURIComponent(resolvedEntityName)}${inferredTeamName ? `?teamName=${encodeURIComponent(inferredTeamName)}` : ''}`;

    try {
      const res = await environmentAwareApiRequest('PATCH', primaryEndpoint, updates);
      
      if (!res.ok) {
        throw new Error(`FastAPI returned ${res.status}`);
      }
      
      const result = await res.json();
      return normalizeEntity(result);
    } catch (error) {
      
      // Fall back to Express by-name PATCH
      const res = await environmentAwareApiRequest('PATCH', expressByName, updates);
      if (!res.ok) {
        throw new Error(`Express by-name returned ${res.status}`);
      }
      const result = await res.json();
      return normalizeEntity(result);
    }
  },
  readEntityByName: async ({ type, entityName, entity, teamName }: { 
    type: Entity['type']; 
    entityName?: string; 
    entity?: any; 
    teamName?: string;
  }) => {
    
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
      
      resolvedEntityName = resolveEntityIdentifier(entity, { fallback: entity.name ?? undefined });
    }
    
    if (!resolvedEntityName) {
      throw new Error(`Cannot determine entity name for ${type} read`);
    }
    
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

    try {
      const res = await environmentAwareApiRequest('GET', primaryUrl);
      
      if (!res.ok) {
        throw new Error(`FastAPI returned ${res.status}`);
      }
      
      const result = await res.json();
      return normalizeEntity(result);
    } catch (error) {
      
      if (fallbackUrl) {
        const res = await environmentAwareApiRequest('GET', fallbackUrl);
        
        if (!res.ok) {
          throw new Error(`Express fallback returned ${res.status}`);
        }
        
        const result = await res.json();
        return normalizeEntity(result);
      } else {
        throw error; // No fallback available, re-throw the original error
      }
    }
  },
  deleteEntityByName: async ({ type, entityName, teamName }: { type: Entity['type']; entityName: string; teamName?: string; }) => {
    const map = typeEndpointMap[type];

    // Prefer our Express by-name route before legacy Express fallbacks
    const urlsToTry = [
      map.delete(entityName),
      map.expressDelete(entityName, teamName),
      map.deleteFallback ? map.deleteFallback(entityName) : undefined,
    ].filter(Boolean) as string[];

    
    for (const url of urlsToTry) {
      try {
        const response = await environmentAwareApiRequest('DELETE', url);
        
        // Treat 204 as success, 404 as already gone, keep trying on 200s from legacy endpoints
        if (response.status === 204 || response.status === 404) {
          return true;
        }
      } catch (_error) {
        
        // Try next fallback
      }
    }

    throw new Error(`Entity ${entityName} not found or failed to delete`);
  },
  deleteEntity: async ({ type, entityName, entity, teamName }: { type: Entity['type']; entityName?: string; entity?: any; teamName?: string }) => {
    
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
      
      resolvedEntityName = resolveEntityIdentifier(entity, { fallback: entity.entity_name || entity.name || undefined });
    }
    
    if (!resolvedEntityName) {
      throw new Error(`Cannot determine entity name for ${type} deletion`);
    }
    
    // Use type-specific endpoints with FastAPI/Express fallback pattern
    const primaryEndpoint = type === 'table' ? 
      endpoints.tablesDelete(resolvedEntityName) : 
      endpoints.dagsDelete(resolvedEntityName);
    
    const fallbackEndpoint = type === 'table' ? 
      endpoints.tablesDeleteFallback?.(resolvedEntityName) : 
      endpoints.dagsDeleteFallback?.(resolvedEntityName);

    const expressDelete = typeEndpointMap[type].expressDelete(resolvedEntityName, teamName || entity?.team_name || undefined);

    try {
      const res = await environmentAwareApiRequest('DELETE', primaryEndpoint);
      return res.ok;
    } catch (error) {
      
      if (fallbackEndpoint) {
        try {
          const res = await environmentAwareApiRequest('DELETE', fallbackEndpoint);
          if (res.ok) return true;
        } catch (fallbackError) {
          
        }
      }

      const expressRes = await expressApiRequest('DELETE', expressDelete);
      return expressRes.ok;
    }
  },
  // Keep legacy delete for backward compatibility but deprecated
  delete: async (entityName: string, entityType: Entity['type']) => {
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
    
    const res = await environmentAwareApiRequest('GET', url);
    const jsonData = await res.json();
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

export async function entityRequest(
  method: string,
  entityType: Entity['type'],
  operation: 'create' | 'bulk',
  data?: unknown
): Promise<Response> {
  let primaryEndpoint: string;
  let fallbackEndpoint: string | undefined;

  if (entityType === 'table') {
    primaryEndpoint = operation === 'bulk' ? endpoints.tablesBulk : endpoints.tables;
    fallbackEndpoint = operation === 'bulk' ? endpoints.tablesBulkFallback : endpoints.tablesFallback;
  } else {
    primaryEndpoint = operation === 'bulk' ? endpoints.dagsBulk : endpoints.dags;
    fallbackEndpoint = operation === 'bulk' ? endpoints.dagsBulkFallback : endpoints.dagsFallback;
  }

  if (isProduction || isStaging) {
    return apiRequest(method, primaryEndpoint, data);
  }

  if (isDevelopment) {
    try {
      const response = await apiRequest(method, primaryEndpoint, data);
      if (!response.ok && (response.status === 404 || response.status >= 500) && fallbackEndpoint) {
        throw new Error(`FastAPI endpoint returned ${response.status}`);
      }
      return response;
    } catch (error) {
      if (!fallbackEndpoint) {
        throw error;
      }
      return expressApiRequest(method, fallbackEndpoint, data);
    }
  }

  return apiRequest(method, primaryEndpoint, data);
}