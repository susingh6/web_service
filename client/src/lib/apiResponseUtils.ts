import { ApiErrorResponse, ApiSuccessResponse, ApiResponse } from '@shared/api-types';

/**
 * Type guard to check if a response follows the standard API success response format
 * 
 * @param response The response to check
 * @returns True if the response is a standardized success response
 */
export function isApiSuccessResponse<T>(response: any): response is ApiSuccessResponse<T> {
  return (
    response !== null &&
    typeof response === 'object' &&
    'success' in response &&
    response.success === true &&
    'data' in response
  );
}

/**
 * Type guard to check if a response follows the standard API error response format
 * 
 * @param response The response to check
 * @returns True if the response is a standardized error response
 */
export function isApiErrorResponse(response: any): response is ApiErrorResponse {
  return (
    response !== null &&
    typeof response === 'object' &&
    'success' in response &&
    response.success === false &&
    'message' in response
  );
}

/**
 * Type guard to check if a response follows any standard API response format
 * 
 * @param response The response to check
 * @returns True if the response follows the standard API response format
 */
export function isApiResponse(response: any): response is ApiResponse {
  return (
    response !== null &&
    typeof response === 'object' &&
    'success' in response &&
    typeof response.success === 'boolean'
  );
}

/**
 * Extracts data from an API response, handling both standardized and legacy formats
 * 
 * @param response The API response
 * @returns The extracted data
 */
export function extractData<T = any>(response: any): T {
  if (isApiSuccessResponse<T>(response)) {
    // Extract data from standardized success response
    return response.data;
  } else if (isApiErrorResponse(response)) {
    // Handle standardized error response
    throw new Error(response.message);
  } else if (isApiResponse(response)) {
    // For other API response formats with success flag but no data/message fields
    return response as unknown as T;
  } else {
    // For legacy API responses without standardized format
    return response as T;
  }
}

/**
 * Options for handling API responses
 */
interface ApiResponseOptions {
  /** Custom error message if the API request fails */
  errorMessage?: string;
  /** Whether to extract the data from the response */
  extractData?: boolean;
}

/**
 * Handles an API response promise and extracts the data or throws an error
 * 
 * @param responsePromise Promise that resolves to a Response object
 * @param options Options for handling the response
 * @returns Promise that resolves to the extracted data
 * 
 * @example
 * ```ts
 * const data = await handleApiResponse<User>(
 *   fetch('/api/user/123'),
 *   { errorMessage: 'Failed to fetch user' }
 * );
 * ```
 */
export async function handleApiResponse<T>(
  responsePromise: Promise<Response>,
  options: ApiResponseOptions = {}
): Promise<T> {
  const { errorMessage = 'API request failed', extractData: shouldExtractData = true } = options;
  
  try {
    const response = await responsePromise;
    
    if (!response.ok) {
      // Try to get error details from response body
      try {
        const errorData = await response.json();
        
        if (isApiErrorResponse(errorData)) {
          // Use standardized error message
          throw new Error(errorData.message);
        } else if (typeof errorData === 'object' && 'message' in errorData) {
          // Handle legacy error format
          throw new Error(errorData.message);
        }
      } catch (parseError) {
        // If parsing failed, throw with status text
        throw new Error(`${errorMessage}: ${response.status} ${response.statusText}`);
      }
      
      // Fallback error message
      throw new Error(`${errorMessage}: ${response.status} ${response.statusText}`);
    }
    
    // Parse successful response
    const data = await response.json();
    
    return shouldExtractData ? extractData<T>(data) : data;
  } catch (error) {
    // Re-throw errors with better context
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`${errorMessage}: ${String(error)}`);
    }
  }
}