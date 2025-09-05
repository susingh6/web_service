import { Entity } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { endpoints } from '@/config';

export const teamsApi = {
  getAll: async (teamName?: string) => {
    let url = endpoints.teams;
    if (teamName) {
      url += `?teamName=${encodeURIComponent(teamName)}`;
    }
    const res = await apiRequest('GET', url);
    return await res.json();
  },
};

export const entitiesApi = {
  getAll: async (tenant?: string) => {
    let url = endpoints.entities;
    if (tenant) {
      url += `?tenant=${encodeURIComponent(tenant)}`;
    }
    const res = await apiRequest('GET', url);
    return await res.json();
  },
  getById: async (id: number) => {
    const res = await apiRequest('GET', endpoints.entity.byId(id));
    return await res.json();
  },
  getByTeam: async (teamId: number) => {
    const res = await apiRequest('GET', endpoints.entity.byTeam(teamId));
    return await res.json();
  },
  getByType: async (type: string) => {
    const res = await apiRequest('GET', `${endpoints.entities}?type=${encodeURIComponent(type)}`);
    return await res.json();
  },
  create: async (entityData: any) => {
    const res = await apiRequest('POST', endpoints.entities, entityData);
    return await res.json();
  },
  update: async (payload: { id: number; updates: any }) => {
    const res = await apiRequest('PUT', endpoints.entity.byId(payload.id), payload.updates);
    return await res.json();
  },
  delete: async (id: number) => {
    const res = await apiRequest('DELETE', endpoints.entity.byId(id));
    return res.ok;
  },
};

export const dagsApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await apiRequest('GET', '/api/dags');
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await apiRequest('GET', endpoints.entity.byId(id));
    return await res.json();
  },
};

export const tablesApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await apiRequest('GET', '/api/tables');
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await apiRequest('GET', endpoints.entity.byId(id));
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
    
    const res = await apiRequest('GET', url);
    return await res.json();
  },
  getTeamPerformance: async (teamId: number) => {
    const res = await apiRequest('GET', endpoints.dashboard.teamPerformance(teamId));
    return await res.json();
  },
  getComplianceTrend: async (startDate: string, endDate: string, filter?: string) => {
    let url = `${endpoints.dashboard.complianceTrend}?startDate=${startDate}&endDate=${endDate}`;
    if (filter) {
      url += `&filter=${filter}`;
    }
    const res = await apiRequest('GET', url);
    return await res.json();
  }
};