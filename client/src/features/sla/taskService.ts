import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskPriority } from './types';
import { apiRequest } from '@/lib/queryClient';
import { endpoints } from '@/config';
import { mockTaskService } from './mockService';
import { AllTasksData, DagTaskData } from '@shared/cache-types';

// Helper function to get cached all tasks data
const getCachedAllTasksData = (): AllTasksData | null => {
  try {
    const cached = localStorage.getItem('sla_cache_data');
    if (!cached) return null;
    
    const cacheData = JSON.parse(cached);
    return cacheData.allTasksData || null;
  } catch (error) {
    console.error('Error getting cached tasks data:', error);
    return null;
  }
};

// Task service that uses dag_name-based cross-referencing with cached data
export const useGetDagTasks = (dagName?: string, entityName?: string) => {
  return useQuery({
    queryKey: ['tasks', dagName || entityName],
    queryFn: async () => {
      if (!dagName && !entityName) return [];
      
      // Priority 1: Try to get from cached all tasks data using dag_name
      if (dagName) {
        const cachedAllTasks = getCachedAllTasksData();
        if (cachedAllTasks) {
          const dagTaskData = cachedAllTasks.dagTasks.find((dtd: DagTaskData) => dtd.dag_name === dagName);
          if (dagTaskData) {
            // Transform cached data to expected UI format
            return dagTaskData.tasks.map((task: any, index: number) => ({
              id: index + 1, // Generate ID from index since cached data may not have IDs
              name: task.task_name,
              description: `${task.task_type} task`,
              priority: task.priority === 'AI Monitored' ? 'high' : 'normal',
              task_type: task.task_type
            }));
          }
        }
      }
      
      // Priority 2: Fallback to API call using entityName (for backwards compatibility)
      if (entityName) {
        try {
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
          console.error('Error fetching tasks from API:', error);
        }
      }
      
      return [];
    },
    enabled: !!(dagName || entityName),
    staleTime: 1000 * 60 * 30, // 30 minutes for cached data
  });
};

interface UpdateTaskPriorityParams {
  taskId: number;
  priority: TaskPriority;
  entityName?: string;  // For fallback API compatibility  
  dagName?: string;     // For dag_name-based cross-referencing
}

// Helper function to invalidate task-related cache
const invalidateTaskCache = (queryClient: any, dagName?: string, entityName?: string) => {
  // Invalidate specific DAG tasks cache
  if (dagName) {
    queryClient.invalidateQueries({ queryKey: ['tasks', dagName] });
  }
  if (entityName) {
    queryClient.invalidateQueries({ queryKey: ['tasks', entityName] });
  }
  
  // Invalidate cached all tasks data from localStorage
  try {
    localStorage.removeItem('sla_cache_data');
    console.log('[Task Priority Update] Cache invalidated due to task priority change');
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
};

// Mutation to update task priority with both FastAPI and Express fallback
export const useUpdateTaskPriority = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, priority, entityName, dagName }: UpdateTaskPriorityParams) => {
      let lastError: Error | null = null;
      
      // Try FastAPI endpoint first
      try {
        const fastApiResponse = await apiRequest('PATCH', `/api/v1/tasks/${taskId}/priority`, { priority });
        console.log('[Task Priority Update] FastAPI update successful');
        return await fastApiResponse.json();
      } catch (fastApiError) {
        console.log('[Task Priority Update] FastAPI failed, trying Express fallback');
        lastError = fastApiError as Error;
        
        // Try Express fallback endpoint
        try {
          const expressResponse = await apiRequest('PATCH', endpoints.tasks.updatePriority(taskId), { priority });
          console.log('[Task Priority Update] Express fallback update successful');
          return await expressResponse.json();
        } catch (expressError) {
          console.log('[Task Priority Update] Express fallback failed, using mock data');
          lastError = expressError as Error;
          
          // Final fallback to mock data
          return mockTaskService.updateTaskPriority(taskId, priority);
        }
      }
    },
    onSuccess: (updatedTask, variables) => {
      // Invalidate cache for both dag_name and entity_name to ensure coherence
      invalidateTaskCache(queryClient, variables.dagName, variables.entityName);
      
      // Update both possible cache keys directly to prevent UI flicker
      if (variables.dagName) {
        queryClient.setQueryData(['tasks', variables.dagName], (oldTasks: Task[] | undefined) => {
          if (!oldTasks) return oldTasks;
          
          return oldTasks.map(task => 
            task.id === variables.taskId 
              ? { ...task, priority: variables.priority, task_type: variables.priority === 'high' ? 'AI' : 'regular' }
              : task
          );
        });
      }
      
      if (variables.entityName && variables.entityName !== variables.dagName) {
        queryClient.setQueryData(['tasks', variables.entityName], (oldTasks: Task[] | undefined) => {
          if (!oldTasks) return oldTasks;
          
          return oldTasks.map(task => 
            task.id === variables.taskId 
              ? { ...task, priority: variables.priority, task_type: variables.priority === 'high' ? 'AI' : 'regular' }
              : task
          );
        });
      }
    },
    onError: (error, variables) => {
      console.error('[Task Priority Update] All update methods failed:', error);
      // Still invalidate cache to ensure consistency
      invalidateTaskCache(queryClient, variables.dagName, variables.entityName);
    },
  });
};