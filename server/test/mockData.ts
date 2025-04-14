import { Entity } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load mock data from a JSON file
 * @param fileName The name of the JSON file (without path)
 * @returns The parsed JSON data
 */
export async function loadMockData<T>(fileName: string): Promise<T[]> {
  try {
    // Navigate up one directory from test/ to find the data/ directory
    const filePath = path.join(__dirname, '..', 'data', fileName);
    const rawData = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(rawData) as T[];
  } catch (error) {
    console.error(`Failed to load mock data from ${fileName}:`, error);
    return [];
  }
}

/**
 * Load mock DAG entities
 * @returns Array of mock DAG entities
 */
export async function loadMockDags(): Promise<Entity[]> {
  const mockDags = await loadMockData<Entity>('mock-dags.json');
  
  // Convert date strings to Date objects
  return mockDags.map(dag => ({
    ...dag,
    createdAt: new Date(dag.createdAt),
    updatedAt: new Date(dag.updatedAt),
    lastRun: dag.lastRun ? new Date(dag.lastRun) : null
  }));
}