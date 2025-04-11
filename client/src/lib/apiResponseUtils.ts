import { ApiSuccessResponse, ApiErrorResponse } from '@shared/api-types';

/**
 * Standard API response structure
 * This represents the standardized API response format used across the application
 */
export interface StandardAPIResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]> | string[];
  code?: string;
}

/**
 * Legacy API response types
 * These interfaces represent older API response formats that might be used in some endpoints
 */
export interface LegacySuccessResponse<T> {
  result: T;
  status: 'success';
  message?: string;
}

export interface LegacyErrorResponse {
  error: string;
  status: 'error';
  code?: number;
  details?: unknown;
}

export type LegacyAPIResponse<T> = LegacySuccessResponse<T> | LegacyErrorResponse;

/**
 * Type guard to check if a response follows the standard format
 * @param response - Any API response to check
 * @returns True if the response follows the standard API format
 */
export function isStandardResponse<T>(
  response: any
): response is StandardAPIResponse<T> {
  return (
    response &&
    typeof response === 'object' &&
    'success' in response &&
    typeof response.success === 'boolean'
  );
}

/**
 * Type guard to check if a response follows the legacy format
 * @param response - Any API response to check
 * @returns True if the response follows the legacy API format
 */
export function isLegacyResponse<T>(
  response: any
): response is LegacyAPIResponse<T> {
  return (
    response &&
    typeof response === 'object' &&
    'status' in response &&
    (response.status === 'success' || response.status === 'error')
  );
}

/**
 * Type guard to check if a legacy response is successful
 * @param response - Legacy API response to check
 * @returns True if the legacy response indicates success
 */
export function isLegacySuccessResponse<T>(
  response: LegacyAPIResponse<T>
): response is LegacySuccessResponse<T> {
  return response.status === 'success';
}

/**
 * Convert a legacy response to the standard format
 * @param response - Legacy API response to convert
 * @returns Standardized API response
 */
export function convertLegacyToStandard<T>(
  response: LegacyAPIResponse<T>
): StandardAPIResponse<T> {
  if (isLegacySuccessResponse(response)) {
    return {
      success: true,
      data: response.result,
      message: response.message,
    };
  } else {
    return {
      success: false,
      message: response.error,
      code: response.code?.toString(),
      errors: response.details ? [response.error] : undefined,
    };
  }
}

/**
 * Extract data from any API response, handling both standard and legacy formats
 * @param response - API response of any format
 * @returns Extracted data or null if response indicates error
 * @throws Error if response indicates an error with a message
 */
export function extractData<T>(response: any): T | null {
  // Handle standard response format
  if (isStandardResponse<T>(response)) {
    if (response.success) {
      return response.data as T;
    } else {
      throw new Error(response.message || 'Unknown error occurred');
    }
  }
  
  // Handle legacy response format
  if (isLegacyResponse<T>(response)) {
    if (isLegacySuccessResponse(response)) {
      return response.result;
    } else {
      throw new Error(response.error || 'Unknown error occurred');
    }
  }
  
  // If no recognizable format, return as-is (likely direct data)
  return response as T;
}

/**
 * Create a standardized error message from any API error response
 * @param error - API error response of any format
 * @returns Formatted error message string
 */
export function formatErrorMessage(error: any): string {
  // Handle standard error response
  if (isStandardResponse<any>(error) && !error.success) {
    let message = error.message || 'Unknown error occurred';
    
    // Format validation errors if present
    if (error.errors) {
      if (Array.isArray(error.errors)) {
        message += ': ' + error.errors.join(', ');
      } else {
        const fieldErrors = Object.entries(error.errors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join('; ');
        message += ': ' + fieldErrors;
      }
    }
    
    return message;
  }
  
  // Handle legacy error response
  if (isLegacyResponse<any>(error) && !isLegacySuccessResponse(error)) {
    let message = error.error || 'Unknown error occurred';
    
    if (error.details) {
      message += ': ' + JSON.stringify(error.details);
    }
    
    return message;
  }
  
  // Handle generic errors or strings
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  // Default fallback
  return 'An unknown error occurred';
}

/**
 * Handle an API response consistently, extracting data and handling errors
 * @param responsePromise - Promise that resolves to an API response
 * @param options - Configuration options for handling the response
 * @returns Promise resolving to the extracted data
 */
export async function handleApiResponse<T>(
  responsePromise: Promise<Response>,
  options: {
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    errorMessage?: string;
  } = {}
): Promise<T> {
  try {
    const response = await responsePromise;
    
    // Handle 204 No Content responses
    if (response.status === 204) {
      return null as unknown as T;
    }
    
    // Parse the response
    const data = await response.json();
    
    // Extract data using our utility function
    const extractedData = extractData<T>(data);
    
    // Call success callback if provided
    if (options.onSuccess && extractedData !== null) {
      options.onSuccess(extractedData);
    }
    
    return extractedData as T;
  } catch (error) {
    // Format error message
    const errorMessage = options.errorMessage || formatErrorMessage(error);
    const enhancedError = new Error(errorMessage);
    
    // Call error callback if provided
    if (options.onError) {
      options.onError(enhancedError);
    }
    
    throw enhancedError;
  }
}