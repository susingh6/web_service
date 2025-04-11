/**
 * API Response Utilities
 * 
 * This module provides helper functions for creating consistent API responses
 * throughout the server-side codebase using RESTful patterns.
 */

import { Response } from 'express';
import { ZodError } from 'zod';
import { 
  ApiSuccessResponse, 
  ApiErrorResponse, 
  PaginationMeta 
} from '@shared/api-types';

/**
 * Send a success response with data
 * @param res Express response object
 * @param data Data to send in the response
 * @param message Optional success message
 * @param statusCode HTTP status code (defaults to 200)
 */
export function sendSuccess<T>(
  res: Response, 
  data: T, 
  message?: string, 
  statusCode: number = 200
): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(message ? { message } : {})
  };
  
  res.status(statusCode).json(response);
}

/**
 * Send a paginated response
 * @param res Express response object
 * @param data Array of data items
 * @param pagination Pagination metadata
 * @param message Optional success message
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  message?: string
): void {
  res.status(200).json({
    success: true,
    data,
    pagination,
    ...(message ? { message } : {})
  });
}

/**
 * Send an error response
 * @param res Express response object
 * @param message Error message
 * @param statusCode HTTP status code (defaults to 400)
 * @param errors Optional detailed error information
 * @param code Optional error code
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: Record<string, string[]> | string[],
  code?: string
): void {
  const response: ApiErrorResponse = {
    success: false,
    message,
    ...(errors ? { errors } : {}),
    ...(code ? { code } : {})
  };
  
  res.status(statusCode).json(response);
}

/**
 * Process a Zod validation error and send an appropriate error response
 * @param res Express response object
 * @param error Zod validation error
 */
export function sendValidationError(res: Response, error: ZodError): void {
  const formattedErrors = error.format();
  // Convert Zod's error format to a more client-friendly structure
  const errors: Record<string, string[]> = {};
  
  Object.entries(formattedErrors)
    .filter(([key]) => key !== '_errors')
    .forEach(([key, value]) => {
      if (key !== '_errors' && value && typeof value === 'object' && '_errors' in value) {
        const fieldErrors = (value as { _errors: string[] })._errors;
        // Only include fields that actually have errors
        if (fieldErrors && Array.isArray(fieldErrors) && fieldErrors.length > 0) {
          errors[key] = fieldErrors;
        }
      }
    });
  
  sendError(
    res,
    'Validation error',
    400,
    errors,
    'VALIDATION_ERROR'
  );
}

/**
 * Send a not found error response
 * @param res Express response object
 * @param resource Name of the resource that wasn't found
 */
export function sendNotFound(res: Response, resource: string): void {
  sendError(
    res,
    `${resource} not found`,
    404,
    undefined,
    'NOT_FOUND'
  );
}

/**
 * Send an unauthorized error response
 * @param res Express response object
 * @param message Optional custom message
 */
export function sendUnauthorized(res: Response, message: string = 'Unauthorized'): void {
  sendError(
    res,
    message,
    401,
    undefined,
    'UNAUTHORIZED'
  );
}

/**
 * Send a forbidden error response
 * @param res Express response object
 * @param message Optional custom message
 */
export function sendForbidden(res: Response, message: string = 'Forbidden'): void {
  sendError(
    res,
    message,
    403,
    undefined,
    'FORBIDDEN'
  );
}

/**
 * Send a server error response
 * @param res Express response object
 * @param error The error object
 */
export function sendServerError(res: Response, error: unknown): void {
  console.error('Server error:', error);
  
  const message = error instanceof Error 
    ? error.message 
    : 'An unexpected error occurred';
    
  sendError(
    res,
    message,
    500,
    undefined,
    'SERVER_ERROR'
  );
}