import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskPriority } from './types';
import { apiRequest } from '@/lib/queryClient';
import { endpoints } from '@/config';
import { mockTaskService } from './mockService';

// Task service that uses entity name-based tasks API
export const useGetDagTasks = (entityName?: string) => {
  return useQuery({
    queryKey: ['tasks', entityName],
    queryFn: async () => {
      if (!entityName) return [];
      
      try {
        // Get all tasks from entity name-based endpoint
        const response = await apiRequest('GET', endpoints.entity.tasks(entityName));
        const allTasks = await response.json();
        
        // Transform to expected format with priority field
        return allTasks.map((task: any) => ({
          id: task.id,
          name: task.name,
          description: task.description,
          priority: task.task_type === 'AI' ? 'high' : 'normal',
          task_type: task.task_type
        }));
      } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
      }
    },
    enabled: !!entityName,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

interface UpdateTaskPriorityParams {
  taskId: number;
  priority: TaskPriority;
  entityName: string;
}

// Mutation to update task priority
export const useUpdateTaskPriority = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, priority, entityName }: UpdateTaskPriorityParams) => {
      try {
        // Try to update via API first
        const response = await apiRequest('PATCH', endpoints.tasks.updatePriority(taskId), { priority });
        return await response.json();
      } catch (error) {
        // Fall back to mock data if API fails or doesn't exist yet
        // Using mock update for task
        return mockTaskService.updateTaskPriority(taskId, priority);
      }
    },
    onSuccess: (updatedTask, variables) => {
      // Update the cache directly instead of invalidating to prevent UI flicker
      queryClient.setQueryData(['tasks', variables.entityName], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return oldTasks;
        
        return oldTasks.map(task => 
          task.id === variables.taskId 
            ? { ...task, priority: variables.priority, task_type: variables.priority === 'high' ? 'AI' : 'regular' }
            : task
        );
      });
    },
  });
};