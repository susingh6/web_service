import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { endpoints } from '@/config';
import { useStandardCrud, CACHE_PATTERNS, useCacheManager, useOptimisticMutation } from '@/utils/cache-management';
import { mockTaskService } from '@/features/sla/mockService';

export interface Task {
  id: number;
  name: string;
  description?: string;
  priority: 'high' | 'normal';
  task_type: 'AI' | 'regular';
  status?: string;
  duration?: string;
  dependencies?: string[];
}

export type TaskPriority = 'high' | 'normal';

// Enhanced task service with comprehensive caching system
export const useTaskMutations = () => {
  const { executeWithOptimism, cacheManager } = useOptimisticMutation();

  // Create task with optimistic updates and 6-hour caching
  const createTask = async (taskData: Omit<Task, 'id'> & { dagId: number }) => {
    const optimisticId = Date.now();
    const optimisticTask = { ...taskData, id: optimisticId };

    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TASKS.BY_DAG(taskData.dagId),
        updater: (old: Task[] | undefined) => old ? [...old, optimisticTask] : [optimisticTask],
      },
      mutationFn: async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) headers['X-Session-ID'] = sessionId;

        const response = await fetch(`/api/dags/${taskData.dagId}/tasks`, {
          method: 'POST',
          headers,
          body: JSON.stringify(taskData),
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to create task');
        return response.json();
      },
      invalidationScenario: {
        scenario: 'TASK_CREATED',
        params: [taskData.dagId],
      },
      rollbackKeys: [CACHE_PATTERNS.TASKS.BY_DAG(taskData.dagId)],
    });
  };

  // Update task with race condition prevention
  const updateTask = async (taskId: number, taskData: Partial<Task>, dagId: number) => {
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TASKS.BY_DAG(dagId),
        updater: (old: Task[] | undefined) => {
          if (!old) return [];
          return old.map(task => task.id === taskId ? { ...task, ...taskData } : task);
        },
      },
      mutationFn: async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) headers['X-Session-ID'] = sessionId;

        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(taskData),
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to update task');
        return response.json();
      },
      invalidationScenario: {
        scenario: 'TASK_UPDATED',
        params: [taskId, dagId],
      },
      rollbackKeys: [CACHE_PATTERNS.TASKS.BY_DAG(dagId)],
    });
  };

  // Delete task with optimistic updates
  const deleteTask = async (taskId: number, dagId: number) => {
    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TASKS.BY_DAG(dagId),
        updater: (old: Task[] | undefined) => 
          old ? old.filter(task => task.id !== taskId) : [],
      },
      mutationFn: async () => {
        const headers: Record<string, string> = {};
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) headers['X-Session-ID'] = sessionId;

        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE',
          headers,
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to delete task');
        return response.ok;
      },
      invalidationScenario: {
        scenario: 'TASK_DELETED',
        params: [dagId],
      },
      rollbackKeys: [CACHE_PATTERNS.TASKS.BY_DAG(dagId)],
    });
  };

  // Priority change with targeted cache invalidation
  const updateTaskPriority = async (taskId: number, newPriority: TaskPriority, dagId: number) => {
    // Get current task to determine old priority for cache invalidation
    const currentTasks = cacheManager.queryClient.getQueryData(CACHE_PATTERNS.TASKS.BY_DAG(dagId)) as Task[] | undefined;
    const currentTask = currentTasks?.find(t => t.id === taskId);
    const oldPriority = currentTask?.priority || 'normal';

    return executeWithOptimism({
      optimisticUpdate: {
        queryKey: CACHE_PATTERNS.TASKS.BY_DAG(dagId),
        updater: (old: Task[] | undefined) => {
          if (!old) return [];
          return old.map(task => 
            task.id === taskId 
              ? { ...task, priority: newPriority, task_type: newPriority === 'high' ? 'AI' : 'regular' }
              : task
          );
        },
      },
      mutationFn: async () => {
        try {
          const response = await apiRequest('PATCH', endpoints.tasks.updatePriority(taskId), { priority: newPriority });
          return await response.json();
        } catch (error) {
          // Fallback to mock service for development
          return mockTaskService.updateTaskPriority(taskId, newPriority);
        }
      },
      invalidationScenario: {
        scenario: 'TASK_PRIORITY_CHANGED',
        params: [taskId, dagId, oldPriority, newPriority],
      },
      rollbackKeys: [CACHE_PATTERNS.TASKS.BY_DAG(dagId)],
    });
  };

  return { createTask, updateTask, deleteTask, updateTaskPriority };
};

// Enhanced task fetching with 6-hour caching
export const useGetDagTasks = (dagId?: number) => {
  return useQuery({
    queryKey: dagId ? CACHE_PATTERNS.TASKS.BY_DAG(dagId) : ['tasks'],
    queryFn: async () => {
      if (!dagId) return [];
      
      try {
        const response = await apiRequest('GET', endpoints.entity.tasks(dagId));
        const allTasks = await response.json();
        
        return allTasks.map((task: any) => ({
          id: task.id,
          name: task.name,
          description: task.description,
          priority: task.task_type === 'AI' ? 'high' : 'normal',
          task_type: task.task_type,
          status: task.status,
          duration: task.duration,
          dependencies: task.dependencies || [],
        })) as Task[];
      } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
      }
    },
    enabled: !!dagId,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours - same as entities/teams/tenants
    gcTime: 6 * 60 * 60 * 1000, // Keep in cache for 6 hours
  });
};

// Enhanced task priority update with loading states and race condition prevention
interface UpdateTaskPriorityParams {
  taskId: number;
  priority: TaskPriority;
  dagId: number;
}

export const useUpdateTaskPriority = () => {
  const { updateTaskPriority } = useTaskMutations();
  
  return useMutation({
    mutationFn: async ({ taskId, priority, dagId }: UpdateTaskPriorityParams) => {
      return await updateTaskPriority(taskId, priority, dagId);
    },
    // Loading states and error handling are built into the executeWithOptimism pattern
  });
};

// Team dashboard task caching (for 6-hourly refresh of all tasks for dag_name in team dashboards)
export const useTeamDagTasks = (teamId: number, dagName: string) => {
  return useQuery({
    queryKey: CACHE_PATTERNS.TASKS.BY_TEAM_DAG(teamId, dagName),
    queryFn: async () => {
      try {
        const headers: Record<string, string> = {};
        const sessionId = localStorage.getItem('fastapi_session_id');
        if (sessionId) headers['X-Session-ID'] = sessionId;

        const response = await fetch(`/api/teams/${teamId}/dags/${encodeURIComponent(dagName)}/tasks`, {
          headers,
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to fetch team DAG tasks');
        return response.json();
      } catch (error) {
        console.error('Error fetching team DAG tasks:', error);
        return [];
      }
    },
    staleTime: 6 * 60 * 60 * 1000, // 6 hours caching
    gcTime: 6 * 60 * 60 * 1000,
    enabled: !!teamId && !!dagName,
  });
};