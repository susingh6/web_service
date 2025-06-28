import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskPriority } from './types';
import { apiRequest } from '@/lib/queryClient';
import { endpoints } from '@/config';
import { mockTaskService } from './mockService';

// Task service that uses API or mock data
export const useGetDagTasks = (dagId?: number) => {
  return useQuery({
    queryKey: ['tasks', dagId],
    queryFn: async () => {
      if (!dagId) return [];
      
      try {
        // Try to get from API first
        const response = await apiRequest('GET', endpoints.tasks.byDag(dagId));
        return await response.json();
      } catch (error) {
        // Fall back to mock data if API fails or doesn't exist yet
        console.log('Using mock tasks data for DAG:', dagId);
        return mockTaskService.getDagTasks(dagId);
      }
    },
    enabled: !!dagId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

interface UpdateTaskPriorityParams {
  taskId: number;
  priority: TaskPriority;
  dagId: number;
}

// Mutation to update task priority
export const useUpdateTaskPriority = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, priority, dagId }: UpdateTaskPriorityParams) => {
      try {
        // Try to update via API first
        const response = await apiRequest('PATCH', endpoints.tasks.updatePriority(taskId), { priority });
        return await response.json();
      } catch (error) {
        // Fall back to mock data if API fails or doesn't exist yet
        console.log('Using mock update for task:', taskId);
        return mockTaskService.updateTaskPriority(taskId, priority);
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate tasks query to refetch data
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.dagId] });
    },
  });
};