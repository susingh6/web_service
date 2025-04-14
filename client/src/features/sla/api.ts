import { Entity } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export const teamsApi = {
  getAll: async () => {
    const res = await apiRequest('GET', '/api/teams');
    return await res.json();
  },
};

export const entitiesApi = {
  getAll: async () => {
    const res = await apiRequest('GET', '/api/entities');
    return await res.json();
  },
  getById: async (id: number) => {
    const res = await apiRequest('GET', `/api/entities/${id}`);
    return await res.json();
  },
  getByTeam: async (teamId: number) => {
    const res = await apiRequest('GET', `/api/entities?teamId=${teamId}`);
    return await res.json();
  },
};

export const dagsApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await apiRequest('GET', '/api/dags');
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await apiRequest('GET', `/api/entities/${id}`);
    return await res.json();
  },
};

export const tablesApi = {
  getAll: async (): Promise<Entity[]> => {
    const res = await apiRequest('GET', '/api/tables');
    return await res.json();
  },
  getById: async (id: number): Promise<Entity> => {
    const res = await apiRequest('GET', `/api/entities/${id}`);
    return await res.json();
  },
};

export const dashboardApi = {
  getSummary: async () => {
    const res = await apiRequest('GET', '/api/dashboard/summary');
    return await res.json();
  },
  getTeamPerformance: async (teamId: number) => {
    const res = await apiRequest('GET', `/api/dashboard/team/${teamId}`);
    return await res.json();
  },
  getComplianceTrend: async (startDate: string, endDate: string, filter?: string) => {
    let url = `/api/dashboard/compliance-trend?startDate=${startDate}&endDate=${endDate}`;
    if (filter) {
      url += `&filter=${filter}`;
    }
    const res = await apiRequest('GET', url);
    return await res.json();
  }
};