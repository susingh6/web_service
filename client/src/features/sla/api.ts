import { Entity } from './types';
import { apiRequest } from '@/lib/queryClient';
import { endpoints, buildUrl } from '@/config';

export const teamsApi = {
  getAll: async () => {
    const res = await apiRequest('GET', buildUrl(endpoints.teams));
    return await res.json();
  },
};

export const entitiesApi = {
  getAll: async (params?: { teamId?: number; type?: string }) => {
    const queryParams: Record<string, string | number> = {};

    if (params?.teamId) {
      queryParams.teamId = params.teamId;
    }
    if (params?.type) {
      queryParams.type = params.type;
    }

    const res = await apiRequest('GET', buildUrl(endpoints.entities, queryParams));
    return await res.json();
  },
  getById: async (id: number) => {
    const res = await apiRequest('GET', buildUrl(`${endpoints.entities}/${id}`));
    return await res.json();
  },
  getByTeam: async (teamId: number) => {
    const res = await apiRequest('GET', buildUrl(endpoints.entities, { teamId }));
    return await res.json();
  },
  create: async (entity: any) => {
    const res = await apiRequest('POST', buildUrl(endpoints.entities), {
      body: JSON.stringify(entity),
      headers: { 'Content-Type': 'application/json' }
    });
    return await res.json();
  },
  update: async (id: number, entity: any) => {
    const res = await apiRequest('PUT', buildUrl(`${endpoints.entities}/${id}`), {
      body: JSON.stringify(entity),
      headers: { 'Content-Type': 'application/json' }
    });
    return await res.json();
  },
  delete: async (id: number) => {
    const res = await apiRequest('DELETE', buildUrl(`${endpoints.entities}/${id}`));
    return await res.json();
  },
};

export const dagsApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await apiRequest('GET', buildUrl(endpoints.dags));
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await apiRequest('GET', buildUrl(`${endpoints.entities}/${id}`));
    return await res.json();
  },
};

export const tablesApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await apiRequest('GET', buildUrl(endpoints.tables));
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await apiRequest('GET', buildUrl(`${endpoints.entities}/${id}`));
    return await res.json();
  },
};

export const dashboardApi = {
  getSummary: async () => {
    const res = await apiRequest('GET', buildUrl(endpoints.dashboard.summary));
    return await res.json();
  },
  getTeamPerformance: async (teamId: number) => {
    const res = await apiRequest('GET', buildUrl(`${endpoints.dashboard.teamPerformance}/${teamId}`));
    return await res.json();
  },
  getComplianceTrend: async (startDate: string, endDate: string, filter?: string) => {
    const params: Record<string, string> = { startDate, endDate };
    if (filter) {
      params.filter = filter;
    }
    const res = await apiRequest('GET', buildUrl(endpoints.dashboard.complianceTrend, params));
    return await res.json();
  }
};