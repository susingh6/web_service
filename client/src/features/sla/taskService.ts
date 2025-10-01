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
  entityName: string;
  allTasks: Task[];
  teamName: string;
  tenantName: string;
}

// Mutation to update task priorities using bulk PATCH with entity_name
export const useUpdateTaskPriority = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ entityName, allTasks, teamName, tenantName }: UpdateTaskPriorityParams) => {
      if (!entityName || !allTasks || !teamName || !tenantName) {
        throw new Error('Missing required parameters for task priority update');
      }

      // Build bulk update payload with ALL current task priorities
      const bulkUpdatePayload = {
        tasks: allTasks.map((task) => ({
          task_name: task.name,
          priority: task.priority
        })),
        team_name: teamName,
        tenant_name: tenantName,
        user: { 
          email: 'user@example.com', // TODO: Get from auth context
          name: 'Current User'
        }
      };

      // Try FastAPI bulk update endpoint
      try {
        await apiRequest('PATCH', `/api/v1/entities/${entityName}/tasks/priorities`, bulkUpdatePayload);
        console.log(`[Task Priority Update] FastAPI success for ${entityName}`);
        return { success: true, entityName, teamName };
      } catch (error) {
        console.log(`[Task Priority Update] FastAPI failed, trying Express fallback`);
        
        // Try Express fallback with same entity_name pattern
        try {
          await apiRequest('PATCH', `/api/entities/${entityName}/tasks/priorities`, bulkUpdatePayload);
          console.log(`[Task Priority Update] Express fallback success for ${entityName}`);
          return { success: true, entityName, teamName };
        } catch (fallbackError) {
          console.error('[Task Priority Update] All endpoints failed:', fallbackError);
          throw fallbackError;
        }
      }
    },
    onSuccess: (data, variables) => {
      console.log(`[Task Priority Update] Success - invalidating cache for ${variables.entityName}`);
      
      // Invalidate the query to trigger automatic refetch
      // This will call useGetDagTasks which fetches structure + AI tasks and does deduping
      queryClient.invalidateQueries({ 
        queryKey: ['tasks', variables.entityName, variables.teamName] 
      });
    },
    onError: (error, variables) => {
      console.error(`[Task Priority Update] Failed for ${variables.entityName}:`, error);
    }
  });
};