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