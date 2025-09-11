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
    
    if (!res.ok) {
      console.error('🌐 API UPDATE ERROR:', { status: res.status, statusText: res.statusText });
      throw new Error(`Failed to update entity: ${res.status} ${res.statusText}`);
    }
    
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