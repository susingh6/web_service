/**
 * Utility functions for validating custom inputs against API endpoints
 */

/**
 * Validates a custom tenant name by checking against the API
 * @param tenantName The tenant name to validate
 * @returns Promise that resolves to true if valid, or error message if invalid
 */
export const validateTenant = async (tenantName: string): Promise<true | string> => {
  try {
    // Placeholder API endpoint - will be replaced with actual endpoint
    const response = await fetch(`https://api.example.com/validate/tenant?name=${encodeURIComponent(tenantName)}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      return errorData.message || 'Invalid tenant name. Please check and try again.';
    }
    
    return true;
  } catch (error) {
    console.error('Error validating tenant name:', error);
    return 'Unable to validate tenant name. Please try again later.';
  }
};

/**
 * Validates a custom team name by checking against the API
 * @param teamName The team name to validate
 * @returns Promise that resolves to true if valid, or error message if invalid
 */
export const validateTeam = async (teamName: string): Promise<true | string> => {
  try {
    // Placeholder API endpoint - will be replaced with actual endpoint
    const response = await fetch(`https://api.example.com/validate/team?name=${encodeURIComponent(teamName)}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      return errorData.message || 'Invalid team name. Please check and try again.';
    }
    
    return true;
  } catch (error) {
    console.error('Error validating team name:', error);
    return 'Unable to validate team name. Please try again later.';
  }
};

/**
 * Validates a custom DAG name by checking against our FastAPI backend
 * The backend will then validate with Airflow - web UI never calls Airflow directly
 * @param dagName The DAG name to validate
 * @returns Promise that resolves to true if valid, or error message if invalid
 */
export const validateDag = async (dagName: string): Promise<true | string> => {
  try {
    // Our FastAPI endpoint that will internally check with Airflow
    const response = await fetch(`https://api.example.com/validate/dag?name=${encodeURIComponent(dagName)}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      return errorData.message || 'Invalid DAG name. Please check and try again.';
    }
    
    return true;
  } catch (error) {
    console.error('Error validating DAG name:', error);
    return 'Unable to validate DAG name. Please try again later.';
  }
};