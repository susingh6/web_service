/**
 * Utilities for preloading common application data
 */

import { CACHE_TTL } from './cacheUtils';

// Simple cache check function to determine if data needs refreshing
const isCacheValid = (cacheKey: string): boolean => {
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);
  
  if (cachedTime) {
    const timestamp = parseInt(cachedTime);
    return Date.now() - timestamp < CACHE_TTL;
  }
  
  return false;
};

/**
 * Preloads tenant data into the local cache
 * @returns Promise resolving to the array of tenant names
 */
export const preloadTenants = async (): Promise<string[]> => {
  // Skip if we already have fresh data
  if (isCacheValid('tenants')) {
    const cachedData = localStorage.getItem('tenants');
    if (cachedData) {
      return JSON.parse(cachedData);
    }
  }
  
  try {
    // In a real implementation, this would be an API call
    console.log('Preloading tenant data...');
    
    // Use the specified tenant values
    const tenants = ['Ad Engineering', 'Data Engineering'];
    
    // Cache the results
    localStorage.setItem('tenants', JSON.stringify(tenants));
    localStorage.setItem('tenants_time', Date.now().toString());
    
    return tenants;
  } catch (error) {
    console.error('Error preloading tenant data:', error);
    return [];
  }
};

/**
 * Preloads team data into the local cache
 * @returns Promise resolving to the array of team names
 */
export const preloadTeams = async (): Promise<string[]> => {
  // Skip if we already have fresh data
  if (isCacheValid('teams')) {
    const cachedData = localStorage.getItem('teams');
    if (cachedData) {
      return JSON.parse(cachedData);
    }
  }
  
  try {
    // In a real implementation, this would be an API call
    console.log('Preloading team data...');
    
    // Simulate API response
    const teams = ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM'];
    
    // Cache the results
    localStorage.setItem('teams', JSON.stringify(teams));
    localStorage.setItem('teams_time', Date.now().toString());
    
    return teams;
  } catch (error) {
    console.error('Error preloading team data:', error);
    return [];
  }
};

/**
 * Preloads all common application data in parallel
 * @returns Promise that resolves when all data is preloaded
 */
export const preloadCommonData = async (): Promise<void> => {
  console.log('Preloading common application data...');
  
  try {
    // Load all data in parallel
    await Promise.all([
      preloadTenants(),
      preloadTeams()
    ]);
    
    console.log('Common data preloading complete');
  } catch (error) {
    console.error('Error preloading common data:', error);
  }
};

// Background refresh utility
export const startBackgroundRefresh = (intervalMinutes = 30): () => void => {
  console.log(`Setting up background refresh every ${intervalMinutes} minutes`);
  
  const intervalId = setInterval(() => {
    console.log('Background refresh triggered');
    preloadCommonData();
  }, intervalMinutes * 60 * 1000);
  
  // Return a cleanup function
  return () => {
    console.log('Cleaning up background refresh');
    clearInterval(intervalId);
  };
};