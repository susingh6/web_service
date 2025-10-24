import type { Response } from 'express';
import { z } from 'zod';

export function createValidationErrorResponse(error: z.ZodError, message: string = 'Validation failed') {
  return {
    message,
    errors: error.format(),
    timestamp: new Date().toISOString(),
    type: 'validation_error',
  };
}

export function createErrorResponse(message: string, type: string = 'server_error', details?: any) {
  return {
    message,
    type,
    timestamp: new Date().toISOString(),
    ...(details && { details }),
  };
}

export function sendError(res: Response, status: number, message: string, type?: string, details?: any) {
  const resolvedType =
    type || (status >= 500
      ? 'server_error'
      : status === 404
      ? 'not_found'
      : status === 401
      ? 'unauthorized'
      : status === 400
      ? 'validation_error'
      : 'client_error');
  return res.status(status).json(createErrorResponse(message, resolvedType, details));
}


