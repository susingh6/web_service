import { Task, TaskPriority, TaskStatus } from './types';

// Maintain a local data store for mock data
const mockTasks = new Map<number, Task[]>();

// Mock task statuses for random generation
const taskStatuses: TaskStatus[] = [
  'success', 'running', 'failed', 'warning', 'retry', 'pending'
];

// DAG name-based task definitions with realistic enterprise data pipeline task names
// SparkTask and HiveTask are task_type, not task_name
const dagTaskDefinitions: Record<string, Array<{task_name: string, task_type: string, priority: string}>> = {
  'agg_daily_pgm': [
    { task_name: 'spark_ingest_customer_activity', task_type: 'SparkTask', priority: 'AI Monitored' },
    { task_name: 'spark_normalize_usage_events', task_type: 'SparkTask', priority: 'AI Monitored' },
    { task_name: 'hive_partition_rollup_daily', task_type: 'HiveTask', priority: 'Regular' },
    { task_name: 'hive_reconcile_financials', task_type: 'HiveTask', priority: 'Regular' }
  ],
  'daily_analytics': [
    { task_name: 'spark_feature_engineering_marketing', task_type: 'SparkTask', priority: 'AI Monitored' },
    { task_name: 'spark_sessionization_web', task_type: 'SparkTask', priority: 'AI Monitored' },
    { task_name: 'hive_materialize_marketing_cube', task_type: 'HiveTask', priority: 'Regular' }
  ],
  'hourly_metrics': [
    { task_name: 'spark_stream_ingest_clickstream', task_type: 'SparkTask', priority: 'AI Monitored' },
    { task_name: 'spark_update_kpis_hourly', task_type: 'SparkTask', priority: 'AI Monitored' },
    { task_name: 'hive_snapshot_latency_dashboard', task_type: 'HiveTask', priority: 'Regular' }
  ]
};

// Generate mock tasks for a DAG using dag_name-based definitions
const generateMockTasks = (dagId: number, entityName?: string): Task[] => {
  const tasks: Task[] = [];
  
  // Try to get specific tasks for this dag name
  const dagTasks = entityName ? dagTaskDefinitions[entityName] : null;
  
  if (dagTasks) {
    // Use predefined tasks based on dag name
    dagTasks.forEach((taskDef, i) => {
      const priority: TaskPriority = taskDef.priority === 'AI Monitored' ? 'high' : 'normal';
      const status = taskStatuses[Math.floor(Math.random() * taskStatuses.length)];
      const duration = Math.floor(Math.random() * 1800) + 10;
      
      tasks.push({
        id: dagId * 100 + i,
        name: taskDef.task_name,
        priority,
        status,
        duration,
        dependencies: i > 0 ? [dagId * 100 + i - 1] : [], // Sequential dependencies
        description: `${taskDef.task_type} - Processing data for ${taskDef.task_name}`
      });
    });
  } else {
    // Fallback to generic tasks for unknown DAGs
    const baseTasks = ['DataExtract', 'DataTransform', 'DataLoad', 'DataValidate'];
    const taskTypes = ['SparkTask', 'HiveTask', 'ValidationTask', 'PublishTask'];
    
    for (let i = 0; i < baseTasks.length; i++) {
      const priority: TaskPriority = Math.random() < 0.3 ? 'high' : 'normal';
      const status = taskStatuses[Math.floor(Math.random() * taskStatuses.length)];
      const duration = Math.floor(Math.random() * 1800) + 10;
      
      tasks.push({
        id: dagId * 100 + i,
        name: baseTasks[i],
        priority,
        status,
        duration,
        dependencies: i > 0 ? [dagId * 100 + i - 1] : [],
        description: `${taskTypes[i]} - Processing data for ${baseTasks[i]}`
      });
    }
  }
  
  return tasks;
};

// Mock service implementation
export const mockTaskService = {
  // Get all tasks for a specific DAG
  getDagTasks: (dagId: number, entityName?: string): Task[] => {
    // Return cached tasks if we have them
    const cacheKey = `${dagId}_${entityName || 'unknown'}`;
    const cachedTasks = Array.from(mockTasks.entries()).find(([key]) => key.toString().startsWith(dagId.toString()));
    
    if (cachedTasks) {
      return cachedTasks[1];
    }
    
    // Generate new mock tasks using entity name for proper task definitions
    const tasks = generateMockTasks(dagId, entityName);
    mockTasks.set(dagId, tasks);
    return tasks;
  },

  // Get all tasks data in the format expected by /api/v1/sla/all_tasks
  getAllTasksData: () => {
    const allTasksData = {
      dagTasks: Object.entries(dagTaskDefinitions).map(([dag_name, tasks]) => ({
        dag_name,
        tasks: tasks.map(task => ({
          task_name: task.task_name,
          task_type: task.task_type,
          priority: task.priority
        }))
      })),
      lastUpdated: new Date()
    };
    return allTasksData;
  },
  
  // Update a task's priority
  updateTaskPriority: (taskId: number, priority: TaskPriority): Task | null => {
    // Find the task in our mocked data
    for (const [dagId, tasks] of Array.from(mockTasks.entries())) {
      const taskIndex = tasks.findIndex((t: Task) => t.id === taskId);
      
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
  },

  // Update task priority by DAG entity ID and task name (for backend PATCH endpoint)
  updateTaskPriorityByName: (dagId: number, taskName: string, priority: TaskPriority): boolean => {
    // Find the corresponding DAG name for this dagId
    const entities = Object.keys(dagTaskDefinitions);
    
    // For the mock system, we can derive dag name from common entity names
    // This is a simple mapping - in a real system this would be more robust
    let targetDagName: string | null = null;
    
    // Since we don't have access to the storage here, we'll need to update all matching task names
    // across all DAGs that contain that task name
    for (const [dagName, taskDefs] of Object.entries(dagTaskDefinitions)) {
      const taskIndex = taskDefs.findIndex(task => task.task_name === taskName);
      if (taskIndex >= 0) {
        // Update the task definition directly
        const priorityString = priority === 'high' ? 'AI Monitored' : 'Regular';
        dagTaskDefinitions[dagName][taskIndex] = {
          ...dagTaskDefinitions[dagName][taskIndex],
          priority: priorityString
        };
        
        // Also update the cached tasks if they exist
        if (mockTasks.has(dagId)) {
          const cachedTasks = mockTasks.get(dagId)!;
          const cachedTaskIndex = cachedTasks.findIndex(t => t.name === taskName);
          if (cachedTaskIndex >= 0) {
            const updatedTasks = [...cachedTasks];
            updatedTasks[cachedTaskIndex] = { ...updatedTasks[cachedTaskIndex], priority };
            mockTasks.set(dagId, updatedTasks);
          }
        }
        
        targetDagName = dagName;
        break;
      }
    }
    
    return targetDagName !== null;
  }
};