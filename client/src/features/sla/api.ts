import { apiRequest } from '@/lib/queryClient';
import { 
  Entity, 
  Team, 
  EntityHistory, 
  Issue, 
  DashboardSummaryResponse, 
  CreateEntityPayload,
  UpdateEntityPayload
} from './types';

// API endpoints for teams
export const teamsApi = {
  getAll: async (): Promise<Team[]> => {
    const res = await apiRequest('GET', '/api/teams');
    return res.json();
  },
  
  getById: async (id: number): Promise<Team> => {
    const res = await apiRequest('GET', `/api/teams/${id}`);
    return res.json();
  },
  
  create: async (team: { name: string; description?: string }): Promise<Team> => {
    const res = await apiRequest('POST', '/api/teams', team);
    return res.json();
  }
};

// API endpoints for entities
export const entitiesApi = {
  getAll: async (params: { teamId?: number; type?: string } = {}): Promise<Entity[]> => {
    const queryParams = new URLSearchParams();
    
    if (params.teamId) {
      queryParams.append('teamId', params.teamId.toString());
    }
    
    if (params.type) {
      queryParams.append('type', params.type);
    }
    
    const url = `/api/entities${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const res = await apiRequest('GET', url);
    return res.json();
  },
  
  getById: async (id: number): Promise<Entity> => {
    const res = await apiRequest('GET', `/api/entities/${id}`);
    return res.json();
  },
  
  create: async (entity: CreateEntityPayload): Promise<Entity> => {
    const res = await apiRequest('POST', '/api/entities', entity);
    return res.json();
  },
  
  update: async ({ id, updates }: UpdateEntityPayload): Promise<Entity> => {
    const res = await apiRequest('PUT', `/api/entities/${id}`, updates);
    return res.json();
  },
  
  delete: async (id: number): Promise<void> => {
    await apiRequest('DELETE', `/api/entities/${id}`);
  },
  
  getHistory: async (id: number): Promise<EntityHistory[]> => {
    const res = await apiRequest('GET', `/api/entities/${id}/history`);
    return res.json();
  },
  
  addHistory: async (id: number, history: { date: Date; slaValue: number; status: string }): Promise<EntityHistory> => {
    const res = await apiRequest('POST', `/api/entities/${id}/history`, history);
    return res.json();
  },
  
  getIssues: async (id: number): Promise<Issue[]> => {
    const res = await apiRequest('GET', `/api/entities/${id}/issues`);
    return res.json();
  },
  
  addIssue: async (id: number, issue: { type: string; description: string; severity: string }): Promise<Issue> => {
    const res = await apiRequest('POST', `/api/entities/${id}/issues`, issue);
    return res.json();
  },
  
  resolveIssue: async (issueId: number): Promise<Issue> => {
    const res = await apiRequest('PUT', `/api/issues/${issueId}/resolve`, {});
    return res.json();
  }
};

// API endpoints for dashboard data
export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummaryResponse> => {
    const res = await apiRequest('GET', '/api/dashboard/summary');
    return res.json();
  }
};
