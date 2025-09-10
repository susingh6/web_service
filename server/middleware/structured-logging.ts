import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request interface to include session context
declare global {
  namespace Express {
    interface Request {
      sessionContext?: SessionContext;
      requestId?: string;
      startTime?: number;
      teamName?: string;
    }
  }
}

export interface SessionContext {
  session_id: string;
  user_id: number | null;
  email: string | null;
  session_type: 'azure_ad' | 'local' | 'client_credentials' | 'api';
  roles: string | null;
  notification_id: string | null;
  name?: string;
  expires_at?: string;
}

export interface StructuredLogEvent {
  event: string;
  session_id: string;
  notification_id: string | null;
  user_id: number | null;
  email: string | null;
  session_type: string;
  roles: string | null;
  request_id: string;
  logger: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp: string;
  duration_ms?: number;
  status_code?: number;
}

class StructuredLogger {
  private static instance: StructuredLogger;
  
  private constructor() {}
  
  static getInstance(): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger();
    }
    return StructuredLogger.instance;
  }
  
  private createLogEvent(
    event: string,
    level: 'info' | 'warn' | 'error' | 'debug',
    sessionContext?: SessionContext,
    requestId?: string,
    additionalFields?: Partial<StructuredLogEvent>
  ): StructuredLogEvent {
    return {
      event,
      session_id: sessionContext?.session_id || 'anonymous',
      notification_id: sessionContext?.notification_id || null,
      user_id: sessionContext?.user_id || null,
      email: sessionContext?.email || null,
      session_type: sessionContext?.session_type || 'anonymous',
      roles: sessionContext?.roles || null,
      request_id: requestId || 'unknown',
      logger: 'app.express.server',
      level,
      timestamp: new Date().toISOString(),
      ...additionalFields
    };
  }
  
  info(event: string, sessionContext?: SessionContext, requestId?: string, additionalFields?: Partial<StructuredLogEvent>): void {
    const logEvent = this.createLogEvent(event, 'info', sessionContext, requestId, additionalFields);
    console.log(JSON.stringify(logEvent));
  }
  
  warn(event: string, sessionContext?: SessionContext, requestId?: string, additionalFields?: Partial<StructuredLogEvent>): void {
    const logEvent = this.createLogEvent(event, 'warn', sessionContext, requestId, additionalFields);
    console.warn(JSON.stringify(logEvent));
  }
  
  error(event: string, sessionContext?: SessionContext, requestId?: string, additionalFields?: Partial<StructuredLogEvent>): void {
    const logEvent = this.createLogEvent(event, 'error', sessionContext, requestId, additionalFields);
    console.error(JSON.stringify(logEvent));
  }
  
  debug(event: string, sessionContext?: SessionContext, requestId?: string, additionalFields?: Partial<StructuredLogEvent>): void {
    const logEvent = this.createLogEvent(event, 'debug', sessionContext, requestId, additionalFields);
    console.debug(JSON.stringify(logEvent));
  }
}

export const structuredLogger = StructuredLogger.getInstance();

// Middleware to extract session context from FastAPI session
export function sessionContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate unique request ID
  req.requestId = uuidv4();
  req.startTime = Date.now();
  
  // Extract session context from user session or headers
  if (req.user) {
    // User is authenticated via passport - check if we have FastAPI session data
    const fastApiSession = (req.user as any).fastApiSession;
    if (fastApiSession) {
      // Use FastAPI session context
      req.sessionContext = {
        session_id: fastApiSession.session.session_id,
        user_id: fastApiSession.user.user_id,
        email: fastApiSession.user.email,
        session_type: fastApiSession.user.type,
        roles: Array.isArray(fastApiSession.user.roles) ? fastApiSession.user.roles.join(',') : fastApiSession.user.roles,
        notification_id: fastApiSession.user.notification_id,
        name: fastApiSession.user.name,
        expires_at: fastApiSession.session.expires_at
      };
    } else {
      // Fallback to local session
      req.sessionContext = {
        session_id: req.sessionID || 'local_session',
        user_id: req.user.id,
        email: req.user.email,
        session_type: 'local',
        roles: req.user.team || null,
        notification_id: null
      };
    }
  } else if (req.headers['x-session-id']) {
    // FastAPI session token provided via headers
    req.sessionContext = {
      session_id: req.headers['x-session-id'] as string,
      user_id: req.headers['x-user-id'] ? parseInt(req.headers['x-user-id'] as string) : null,
      email: req.headers['x-user-email'] as string || null,
      session_type: req.headers['x-session-type'] as any || 'client_credentials',
      roles: req.headers['x-user-roles'] as string || null,
      notification_id: req.headers['x-notification-id'] as string || null,
      name: (req.headers['x-user-name'] as string) || undefined,
      expires_at: (req.headers['x-session-expires'] as string) || undefined
    };
  } else {
    // Anonymous session
    req.sessionContext = {
      session_id: 'anonymous',
      user_id: null,
      email: null,
      session_type: 'local',
      roles: null,
      notification_id: null
    };
  }
  
  next();
}

// Middleware to log incoming requests with structured format
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Format query parameters and route parameters for logging
  let parameterString = '';
  const queryParams = Object.keys(req.query).length > 0 
    ? Object.entries(req.query).map(([key, value]) => `${key}=${value}`).join(', ')
    : '';
  
  const routeParams = Object.keys(req.params).length > 0 
    ? Object.entries(req.params).map(([key, value]) => `${key}=${value}`).join(', ')
    : '';
  
  const allParams = [queryParams, routeParams].filter(Boolean).join(', ');
  
  if (allParams) {
    parameterString = ` - Parameters: ${allParams}`;
  }
    
  const event = `${req.method} ${req.path}${parameterString}`;
  
  // Log the incoming request (don't log initial request, only response)
  
  // Log response when it finishes
  const originalSend = res.send;
  res.send = function(data) {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    
    const responseEvent = `${req.method} ${req.path}${parameterString} - status: ${res.statusCode}`;
    
    structuredLogger.info(
      responseEvent,
      req.sessionContext,
      req.requestId,
      { 
        duration_ms: duration,
        status_code: res.statusCode
      }
    );
    
    return originalSend.call(this, data);
  };
  
  next();
}

// Enhanced logging for specific operations
export function logEntityOperation(
  operation: string,
  entityType: string,
  entityId: number | string,
  req: Request,
  additionalData?: any
): void {
  const event = `${operation} ${entityType} - ID: ${entityId}`;
  structuredLogger.info(
    event,
    req.sessionContext,
    req.requestId,
    additionalData
  );
}

export function logCacheOperation(
  operation: string,
  cacheKey: string,
  req: Request,
  additionalData?: any
): void {
  const event = `Cache ${operation} - Key: ${cacheKey}`;
  structuredLogger.info(
    event,
    req.sessionContext,
    req.requestId,
    additionalData
  );
}

export function logAuthenticationEvent(
  event: string,
  username: string,
  sessionContext?: SessionContext,
  requestId?: string,
  success: boolean = true
): void {
  const logEvent = `Authentication ${event} - User: ${username} - ${success ? 'SUCCESS' : 'FAILED'}`;
  
  if (success) {
    structuredLogger.info(logEvent, sessionContext, requestId);
  } else {
    structuredLogger.warn(logEvent, sessionContext, requestId);
  }
}