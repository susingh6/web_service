/**
 * Centralized validation utilities for entity forms
 * Eliminates duplicate validation logic across AddEntityModal and EditEntityModal
 */

export const validateTenant = async (tenantName: string): Promise<boolean | string> => {
  // Basic validation - non-empty string
  if (!tenantName || tenantName.trim() === '') {
    return 'Tenant name cannot be empty';
  }
  
  // Length validation
  if (tenantName.length < 2) {
    return 'Tenant name must be at least 2 characters';
  }
  
  if (tenantName.length > 100) {
    return 'Tenant name must be less than 100 characters';
  }
  
  // Pattern validation - alphanumeric, spaces, hyphens, underscores
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(tenantName)) {
    return 'Tenant name can only contain letters, numbers, spaces, hyphens, and underscores';
  }
  
  return true;
};

export const validateTeam = async (teamName: string): Promise<boolean | string> => {
  // Basic validation - non-empty string
  if (!teamName || teamName.trim() === '') {
    return 'Team name cannot be empty';
  }
  
  // Length validation
  if (teamName.length < 2) {
    return 'Team name must be at least 2 characters';
  }
  
  if (teamName.length > 50) {
    return 'Team name must be less than 50 characters';
  }
  
  // Pattern validation - alphanumeric, spaces, hyphens, underscores
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(teamName)) {
    return 'Team name can only contain letters, numbers, spaces, hyphens, and underscores';
  }
  
  return true;
};

export const validateDag = async (dagName: string): Promise<boolean | string> => {
  // Basic validation - non-empty string
  if (!dagName || dagName.trim() === '') {
    return 'DAG name cannot be empty';
  }
  
  // Length validation
  if (dagName.length < 2) {
    return 'DAG name must be at least 2 characters';
  }
  
  if (dagName.length > 100) {
    return 'DAG name must be less than 100 characters';
  }
  
  // Pattern validation for DAG names - more restrictive
  const validPattern = /^[a-zA-Z0-9_]+$/;
  if (!validPattern.test(dagName)) {
    return 'DAG name can only contain letters, numbers, and underscores';
  }
  
  return true;
};

/**
 * Cache update utility to eliminate duplicate cache management code
 */
export const updateCacheWithNewValue = (cacheKey: string, newValue: string, currentOptions: string[]): string[] => {
  if (!currentOptions.includes(newValue)) {
    const updated = [...currentOptions, newValue];
    localStorage.setItem(cacheKey, JSON.stringify(updated));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    // Cache updated with validated name
    return updated;
  }
  return currentOptions;
};