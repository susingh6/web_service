import { Task, TaskPriority, TaskStatus } from './types';

// Maintain a local data store for mock data
const mockTasks = new Map<number, Task[]>();

// Mock task statuses for random generation
const taskStatuses: TaskStatus[] = [
  'success', 'running', 'failed', 'warning', 'retry', 'pending'
];

// Generate random mock tasks for a DAG
const generateMockTasks = (dagId: number): Task[] => {
  const tasks: Task[] = [];
  const numTasks = Math.floor(Math.random() * 8) + 3; // 3-10 tasks
  
  // Create some basic tasks
  const baseTasks = ['Task1', 'Task2', 'Task3'];
  
  for (let i = 0; i < numTasks; i++) {
    // Determine task name - use base tasks for the first few, then random names
    const taskName = i < baseTasks.length 
      ? baseTasks[i] 
      : `Task_${dagId}_${i + 1}`;
    
    // Random priority distribution (30% high, 70% normal)
    const priority: TaskPriority = Math.random() < 0.3 ? 'high' : 'normal';
    
    // Random status
    const status = taskStatuses[Math.floor(Math.random() * taskStatuses.length)];
    
    // Random duration between 10s and 30min
    const duration = Math.floor(Math.random() * 1800) + 10;
    
    // Some tasks have dependencies
    const dependencies = Math.random() > 0.7 
      ? Array.from({ length: Math.floor(Math.random() * 3) + 1 }, 
          () => Math.floor(Math.random() * i) + 1)
      : [];
    
    tasks.push({
      id: dagId * 100 + i,
      name: taskName,
      priority,
      status,
      duration,
      dependencies,
      description: Math.random() > 0.5 ? `Processing data for ${taskName}` : undefined
    });
  }
  
  return tasks;
};

// Mock service implementation
export const mockTaskService = {
  // Get all tasks for a specific DAG
  getDagTasks: (dagId: number): Task[] => {
    // Return cached tasks if we have them
    if (mockTasks.has(dagId)) {
      return mockTasks.get(dagId) || [];
    }
    
    // Generate new mock tasks
    const tasks = generateMockTasks(dagId);
    mockTasks.set(dagId, tasks);
    return tasks;
  },
  
  // Update a task's priority
  updateTaskPriority: (taskId: number, priority: TaskPriority): Task | null => {
    // Find the task in our mocked data
    for (const [dagId, tasks] of mockTasks.entries()) {
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      
      if (taskIndex >= 0) {
        // Create updated task with new priority
        const updatedTask = { ...tasks[taskIndex], priority };
        
        // Update task in the map
        const updatedTasks = [...tasks];
        updatedTasks[taskIndex] = updatedTask;
        mockTasks.set(dagId, updatedTasks);
        
        return updatedTask;
      }
    }
    
    return null;
  }
};