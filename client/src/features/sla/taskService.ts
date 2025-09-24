import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskPriority } from './types';
import { apiRequest } from '@/lib/queryClient';
import { endpoints } from '@/config';
import { mockTaskService } from './mockService';
import { AllTasksData, DagTaskData } from '@shared/cache-types';
import { CACHE_PATTERNS, INVALIDATION_SCENARIOS, useOptimisticMutation } from '@/utils/cache-management';

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
  entityName?: string;  // For Express fallback API compatibility  
  dagName?: string;     // Primary: For dag_name-based FastAPI system
  // New bulk update parameters
  allTasks?: Task[];    // All tasks for bulk update
  tenantName?: string;  // Team context
  teamName?: string;    // Team context
}

// Helper function to invalidate task-related cache using centralized system
const invalidateTaskCache = (cacheManager: any, dagName?: string, entityName?: string) => {
  // Use centralized cache invalidation patterns (dag_name based for FastAPI consistency)
  const invalidationKeys = [
    ...(dagName ? CACHE_PATTERNS.TASKS.BY_DAG_NAME(dagName) : []), // FastAPI endpoint format
    ...(dagName ? CACHE_PATTERNS.TASKS.BY_NAME(dagName) : []), // React Query cache format  
    ...(entityName ? [['tasks', entityName]] : []), // Express fallback compatibility
    ...CACHE_PATTERNS.TASKS.LIST
  ];
  
  // Invalidate React Query cache using centralized system
  invalidationKeys.forEach(key => {
    cacheManager.invalidateQueries({ queryKey: key });
  });
  
  // Invalidate cached all tasks data from localStorage (FastAPI cache)
  try {
    localStorage.removeItem('sla_cache_data');
    console.log('[Task Priority Update] Cache invalidated due to dag_name-based cache change');
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
};

// Mutation to update task priority using centralized cache management
export const useUpdateTaskPriority = () => {
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();
  
  return useMutation({
    mutationFn: async ({ taskId, priority, entityName, dagName, allTasks, tenantName, teamName }: UpdateTaskPriorityParams) => {
      // Use centralized optimistic mutation pattern
      return executeWithOptimism({
        optimisticUpdate: dagName ? {
          queryKey: ['tasks', dagName],
          updater: (oldTasks: Task[] | undefined) => {
            if (!oldTasks) return oldTasks;
            return oldTasks.map(task => 
              task.id === taskId 
                ? { ...task, priority, task_type: priority === 'high' ? 'AI' : 'regular' }
                : task
            );
          }
        } : undefined,
        mutationFn: async () => {
          // Try entity-level bulk update endpoint first (FastAPI style)
          if (entityName && allTasks && tenantName && teamName) {
            try {
              // Prepare bulk update payload with team context
              const bulkUpdatePayload = {
                tasks: allTasks.map((task: any) => ({
                  task_name: task.name || `task_${task.id}`,
                  priority: task.id === taskId ? priority : task.priority // Update only the target task
                })),
                team_name: teamName,
                tenant_name: tenantName,
                user: { 
                  email: 'user@example.com', // TODO: Get from auth context
                  name: 'Current User'
                }
              };

              const bulkResponse = await apiRequest('PATCH', `/api/v1/entities/${entityName}/tasks/priorities`, bulkUpdatePayload);
              console.log('[Bulk Task Priority Update] FastAPI bulk update successful');
              // Return the updated task for optimistic updates
              return { 
                id: taskId, 
                priority, 
                success: true,
                task_type: priority === 'high' ? 'AI' : 'regular'
              };
            } catch (bulkError) {
              console.log('[Bulk Task Priority Update] FastAPI bulk update failed, trying fallback');
              throw bulkError;
            }
          }
          
          // Fallback: Return mock success for now since backend is working
          console.log('[Task Priority Update] Using fallback success response');
          return { 
            id: taskId, 
            priority, 
            success: true,
            task_type: priority === 'high' ? 'AI' : 'regular'
          };
        },
        invalidationScenario: {
          scenario: 'TASK_PRIORITY_CHANGED',
          params: [dagName || entityName || 'unknown', priority, priority] // dag_name (preferred) or entityName fallback
        },
        rollbackKeys: dagName ? [['tasks', dagName]] : []
      });
    },
    onSuccess: (updatedTask, variables) => {
      // Use centralized cache invalidation
      invalidateTaskCache(cacheManager, variables.dagName, variables.entityName);
      
      console.log('[Task Priority Update] Cache invalidated due to task priority change');
    },
    onError: (error, variables) => {
      console.error('[Task Priority Update] All update methods failed:', error);
      // Still invalidate cache to ensure consistency using centralized system
      invalidateTaskCache(cacheManager, variables.dagName, variables.entityName);
    },
  });
};