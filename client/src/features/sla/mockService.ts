import { Task, TaskPriority, TaskStatus } from './types';

// Mock tasks for each DAG
const mockTasks: Record<number, Task[]> = {};

// Create basic mock tasks for a given DAG
export const generateMockTasksForDag = (dagId: number): Task[] => {
  // If we already have tasks for this DAG, return them
  if (mockTasks[dagId]) {
    return mockTasks[dagId];
  }
  
  // Create basic tasks for the DAG
  const tasks: Task[] = [
    {
      id: dagId * 100 + 1,
      entityId: dagId,
      name: 'Task1',
      description: 'First task in the DAG',
      status: 'completed' as TaskStatus,
      priority: 'normal' as TaskPriority,
      duration: 120,
      startTime: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
      endTime: new Date(Date.now() - 1000 * 60 * 28), // 28 mins ago
      dependsOn: '',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      updatedAt: new Date()
    },
    {
      id: dagId * 100 + 2,
      entityId: dagId,
      name: 'Task2',
      description: 'Second task in the DAG',
      status: 'running' as TaskStatus,
      priority: 'high' as TaskPriority,
      duration: 240,
      startTime: new Date(Date.now() - 1000 * 60 * 28), // 28 mins ago
      endTime: null,
      dependsOn: `${dagId * 100 + 1}`,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      updatedAt: new Date()
    },
    {
      id: dagId * 100 + 3,
      entityId: dagId,
      name: 'Task3',
      description: 'Third task in the DAG',
      status: 'pending' as TaskStatus,
      priority: 'normal' as TaskPriority,
      duration: 180,
      startTime: null,
      endTime: null,
      dependsOn: `${dagId * 100 + 2}`,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      updatedAt: new Date()
    }
  ];
  
  // Store the tasks for future reference
  mockTasks[dagId] = tasks;
  
  return tasks;
};

// Get tasks for a given DAG
export const getTasksForDag = (dagId: number): Promise<Task[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateMockTasksForDag(dagId));
    }, 300);
  });
};

// Update a task's priority
export const updateTaskPriority = (
  taskId: number, 
  priority: TaskPriority
): Promise<Task> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Find the task to update
      let foundTask: Task | null = null;
      let dagId: number | null = null;
      
      for (const [entityId, tasks] of Object.entries(mockTasks)) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          foundTask = task;
          dagId = parseInt(entityId, 10);
          break;
        }
      }
      
      if (!foundTask || !dagId) {
        reject(new Error(`Task with ID ${taskId} not found`));
        return;
      }
      
      // Update the task priority
      foundTask.priority = priority;
      foundTask.updatedAt = new Date();
      
      // Update the tasks in our mock store
      mockTasks[dagId] = mockTasks[dagId].map(t => 
        t.id === taskId ? foundTask! : t
      );
      
      resolve(foundTask);
    }, 300);
  });
};

// Add a new task to a DAG
export const addTaskToDag = (dagId: number, taskData: Partial<Task>): Promise<Task> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const tasks = mockTasks[dagId] || [];
      const maxId = tasks.length > 0 
        ? Math.max(...tasks.map(t => t.id)) 
        : dagId * 100;
      
      const newTask: Task = {
        id: maxId + 1,
        entityId: dagId,
        name: taskData.name || `New Task ${maxId + 1}`,
        description: taskData.description || null,
        status: taskData.status || 'pending',
        priority: taskData.priority || 'normal',
        duration: taskData.duration,
        startTime: taskData.startTime || null,
        endTime: taskData.endTime || null,
        dependsOn: taskData.dependsOn || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockTasks[dagId] = [...tasks, newTask];
      
      resolve(newTask);
    }, 300);
  });
};