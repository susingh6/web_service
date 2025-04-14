import { Task, TaskPriority, TaskStatus } from './types';

// Task names that will be consistent across all DAGs for demo
const taskNames = [
  'extract_data',
  'transform_data',
  'load_warehouse',
  'validate_schema',
  'generate_report',
  'send_notification',
  'update_metadata',
  'archive_data',
  'check_quality',
  'publish_metrics'
];

// Descriptions for tasks
const taskDescriptions = {
  'extract_data': 'Extract raw data from source systems',
  'transform_data': 'Transform and clean data for analysis',
  'load_warehouse': 'Load data into the data warehouse',
  'validate_schema': 'Validate data schema and structure',
  'generate_report': 'Generate analysis reports',
  'send_notification': 'Send notifications to stakeholders',
  'update_metadata': 'Update metadata repository',
  'archive_data': 'Archive processed data',
  'check_quality': 'Perform data quality checks',
  'publish_metrics': 'Publish performance metrics'
};

// Generate random duration in seconds
const getRandomDuration = () => {
  return Math.floor(Math.random() * 3600) + 1; // 1 second to 1 hour
};

// Get random status
const getRandomStatus = (): TaskStatus => {
  const statuses: TaskStatus[] = ['success', 'failed', 'running', 'warning', 'retry', 'pending'];
  const weights = [0.65, 0.1, 0.1, 0.05, 0.05, 0.05]; // Success is more likely
  
  const random = Math.random();
  let cumulativeWeight = 0;
  
  for (let i = 0; i < statuses.length; i++) {
    cumulativeWeight += weights[i];
    if (random < cumulativeWeight) {
      return statuses[i];
    }
  }
  
  return 'success'; // Default
};

// Get random priority - 20% high, 80% normal
const getRandomPriority = (): TaskPriority => {
  return Math.random() < 0.2 ? 'high' : 'normal';
};

// Cache to store mock task data for each DAG
const taskCache = new Map<number, Task[]>();

/**
 * Generate mock tasks for a DAG
 */
const generateMockTasks = (dagId: number): Task[] => {
  const tasks: Task[] = [];
  
  // Generate 5-10 tasks for each DAG
  const numTasks = Math.floor(Math.random() * 6) + 5;
  
  for (let i = 0; i < numTasks; i++) {
    const taskName = taskNames[i % taskNames.length];
    
    const task: Task = {
      id: dagId * 100 + i,
      name: taskName,
      description: taskDescriptions[taskName as keyof typeof taskDescriptions],
      dagId: dagId,
      status: getRandomStatus(),
      priority: getRandomPriority(),
      duration: getRandomDuration(),
      lastRun: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
    };
    
    // Add some dependencies for the tasks
    if (i > 0) {
      task.dependencies = [dagId * 100 + (i - 1)];
      
      // Add a second dependency sometimes
      if (i > 1 && Math.random() < 0.3) {
        task.dependencies.push(dagId * 100 + (i - 2));
      }
    }
    
    tasks.push(task);
  }
  
  return tasks;
};

/**
 * Get tasks for a specific DAG
 */
export const getTasksForDag = async (dagId: number): Promise<Task[]> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Return cached tasks if available
  if (taskCache.has(dagId)) {
    return taskCache.get(dagId)!;
  }
  
  // Generate new tasks and cache them
  const tasks = generateMockTasks(dagId);
  taskCache.set(dagId, tasks);
  
  return tasks;
};

/**
 * Update a task's priority
 */
export const updateTaskPriority = async (taskId: number, newPriority: TaskPriority): Promise<Task> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Find the DAG containing this task
  let task: Task | undefined;
  let dagId: number | undefined;
  
  for (const [cachedDagId, tasks] of taskCache.entries()) {
    const foundTask = tasks.find(t => t.id === taskId);
    if (foundTask) {
      task = foundTask;
      dagId = cachedDagId;
      break;
    }
  }
  
  if (!task || !dagId) {
    throw new Error(`Task with ID ${taskId} not found`);
  }
  
  // Update the task priority
  task.priority = newPriority;
  
  // Return the updated task
  return task;
};