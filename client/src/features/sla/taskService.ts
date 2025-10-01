import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskPriority } from './types';
import { apiRequest } from '@/lib/queryClient';
import { endpoints } from '@/config';
import { mockTaskService } from './mockService';
import { DagTaskData } from '@shared/cache-types';
import { useOptimisticMutation } from '@/utils/cache-management';

// New architecture: Fetch DAG structure from cache, then fetch team-scoped AI tasks
export const useGetDagTasks = (dagName?: string, entityName?: string, teamName?: string) => {
  return useQuery({
    queryKey: ['tasks', dagName || entityName, teamName],
    queryFn: async () => {
      const name = dagName || entityName;
      if (!name) return [];
      
      try {
        // Step 1: Fetch all tasks structure from 6-hour cache
        console.log(`[TaskService] Fetching all tasks structure from cache`);
        const allTasksResponse = await apiRequest('GET', endpoints.tasks.getAll);
        const allTasksData: DagTaskData[] = await allTasksResponse.json();
        
        // Find this DAG's structure
        const dagTaskData = allTasksData.find((dtd: DagTaskData) => dtd.dag_name === name);
        
        if (!dagTaskData) {
          console.log(`[TaskService] DAG ${name} not found in cache, using mock`);
          return mockTaskService.getDagTasks(1, name);
        }

        // Step 2: Fetch team-scoped AI tasks if team context available
        let aiTaskNames: string[] = [];
        if (teamName && endpoints.tasks.getAiTasks) {
          try {
            console.log(`[TaskService] Fetching AI tasks for team ${teamName}, DAG ${name}`);
            const aiTasksResponse = await apiRequest('GET', `${endpoints.tasks.getAiTasks(name)}?team=${teamName}`);
            const aiTasksData = await aiTasksResponse.json();
            aiTaskNames = aiTasksData.ai_tasks || [];
            console.log(`[TaskService] AI tasks for ${name}: [${aiTaskNames.join(', ')}]`);
          } catch (error) {
            console.log(`[TaskService] Failed to fetch AI tasks, trying fallback`);
            try {
              if (endpoints.tasks.getAiTasksFallback) {
                const fallbackResponse = await apiRequest('GET', `${endpoints.tasks.getAiTasksFallback(name)}?team=${teamName}`);
                const fallbackData = await fallbackResponse.json();
                aiTaskNames = fallbackData.ai_tasks || [];
              }
            } catch (fallbackError) {
              console.log(`[TaskService] Fallback failed, using empty AI tasks`);
            }
          }
        }

        // Step 3: Merge structure with AI task priorities
        const tasks = dagTaskData.tasks.map((task, index) => ({
          id: index + 1,
          name: task.task_name,
          description: `${task.task_type} task`,
          priority: aiTaskNames.includes(task.task_name) ? 'high' as TaskPriority : 'normal' as TaskPriority,
          task_type: task.task_type,
          status: 'running' as const
        }));

        console.log(`[TaskService] Successfully loaded ${tasks.length} tasks for ${name}`);
        return tasks;
      } catch (error) {
        console.error(`[TaskService] Error fetching tasks:`, error);
        console.log(`[TaskService] Using mock service fallback`);
        return mockTaskService.getDagTasks(1, name);
      }
    },
    enabled: !!(dagName || entityName),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true
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


// Mutation to update task priority using optimistic updates
export const useUpdateTaskPriority = () => {
  const { executeWithOptimism } = useOptimisticMutation();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, priority, entityName, dagName, allTasks, tenantName, teamName }: UpdateTaskPriorityParams) => {
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

              await apiRequest('PATCH', `/api/v1/entities/${entityName}/tasks/priorities`, bulkUpdatePayload);
              console.log('[Bulk Task Priority Update] FastAPI bulk update successful');
              
              // Return immediately after successful call
              return { 
                id: taskId, 
                priority, 
                success: true,
                task_type: priority === 'high' ? 'AI' : 'regular',
                entityName,
                dagName
              };
            } catch (error) {
              console.log('[Bulk Task Priority Update] Failed, trying fallback');
              // Try individual task endpoint as fallback
              try {
                await apiRequest('PATCH', endpoints.tasks.updatePriority(taskId), { priority });
                console.log('[Individual Task Update] Success');
                return { 
                  id: taskId, 
                  priority, 
                  success: true,
                  task_type: priority === 'high' ? 'AI' : 'regular',
                  entityName,
                  dagName
                };
              } catch (fallbackError) {
                console.log('[Individual Task Update] Failed, using mock');
                // Final fallback to mock
                return mockTaskService.updateTaskPriority(taskId, priority);
              }
            }
          }
          
          // No entity context, use mock
          return mockTaskService.updateTaskPriority(taskId, priority);
        },
        invalidationScenario: {
          scenario: 'TASK_PRIORITY_CHANGED',
          params: [dagName || entityName || 'unknown', priority, priority]
        },
        rollbackKeys: dagName ? [['tasks', dagName]] : []
      });
    },
    onSettled: (data, error, variables) => {
      // Aggressively invalidate ALL related caches to force fresh data
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dags', variables.dagName, 'tasks'] });
      queryClient.removeQueries({ queryKey: ['tasks', variables.dagName] });
      queryClient.removeQueries({ queryKey: ['tasks', variables.entityName] });
      
      // Force a hard refresh of the task data
      if (variables.dagName) {
        queryClient.refetchQueries({ queryKey: ['tasks', variables.dagName] });
      }
      
      if (error) {
        console.error('[Task Priority Update] Failed:', error);
      } else {
        console.log('[Task Priority Update] Success - cache aggressively invalidated and refetched');
      }
    },
  });
};