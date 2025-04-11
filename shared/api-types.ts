/**
 * Standardized API response types for consistent interfaces across the application
 */

// Base response interface for all API responses
export interface ApiResponse {
  success: boolean;
  message?: string;
}

// Success response with data
export interface ApiSuccessResponse<T> extends ApiResponse {
  success: true;
  data: T;
}

// Error response with optional error details
export interface ApiErrorResponse extends ApiResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]> | string[];
  code?: string;
}

// Pagination metadata
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

// Paginated response
export interface ApiPaginatedResponse<T> extends ApiSuccessResponse<T[]> {
  pagination: PaginationMeta;
}

// Helper functions to create standardized responses

/**
 * Create a success response
 * @param data The data to include in the response
 * @param message Optional success message
 */
export function createSuccessResponse<T>(data: T, message?: string): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    ...(message ? { message } : {})
  };
}

/**
 * Create an error response
 * @param message Error message
 * @param errors Optional detailed error information
 * @param code Optional error code
 */
export function createErrorResponse(
  message: string,
  errors?: Record<string, string[]> | string[],
  code?: string
): ApiErrorResponse {
  return {
    success: false,
    message,
    ...(errors ? { errors } : {}),
    ...(code ? { code } : {})
  };
}

/**
 * Create a paginated response
 * @param data Array of items for the current page
 * @param pagination Pagination metadata
 * @param message Optional success message
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  message?: string
): ApiPaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination,
    ...(message ? { message } : {})
  };
}