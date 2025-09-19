import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { structuredLogger } from "./structured-logging";

/**
 * Middleware to check if the current user's is_active status is false and block write operations
 * This middleware should be applied after isAuthenticated middleware
 * Only applies to write operations (POST, PUT, DELETE) - read operations (GET) are allowed
 */
export const checkActiveUserForWrites = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only apply to write operations (POST, PUT, DELETE) - skip GET requests
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // User must be authenticated (this should be checked by isAuthenticated middleware first)
    if (!req.user || !req.isAuthenticated()) {
      return res.status(401).json({
        message: "Authentication required",
        type: "unauthorized",
        timestamp: new Date().toISOString()
      });
    }

    const currentUser = req.user as any;
    
    // Cross-reference with admin database to get full user details including is_active status
    // Use the same lookup pattern as profile endpoints (by email)
    let targetUser;
    try {
      if (currentUser.email) {
        const allUsers = await storage.getUsers();
        targetUser = allUsers.find(user => user.email === currentUser.email);
      }
      
      // If no match by email, try by username as fallback
      if (!targetUser && currentUser.username) {
        targetUser = await storage.getUserByUsername(currentUser.username);
      }
    } catch (dbError) {
      // If database lookup fails, log the error but allow the request to proceed
      // This ensures that temporary database issues don't lock out all users
      structuredLogger.warn('USER_ACTIVE_CHECK_DB_ERROR', req.sessionContext, req.requestId, {
        logger: 'app.middleware.active-check'
      });
      
      console.warn('Failed to lookup user for active status check, allowing request:', dbError instanceof Error ? dbError.message : String(dbError));
      return next();
    }
    
    // If user not found in admin database, allow request to proceed
    // This handles cases where session users haven't been added to admin database yet
    if (!targetUser) {
      structuredLogger.info('USER_ACTIVE_CHECK_NO_ADMIN_RECORD', req.sessionContext, req.requestId, {
        logger: 'app.middleware.active-check'
      });
      
      return next();
    }
    
    // Check if user is inactive
    if (targetUser.is_active === false) {
      // Log the blocked access attempt
      structuredLogger.warn('BLOCKED_INACTIVE_USER_WRITE', req.sessionContext, req.requestId, {
        logger: 'app.middleware.active-check'
      });
      
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact your administrator.",
        type: "account_deactivated",
        timestamp: new Date().toISOString(),
        errorCode: "ACCOUNT_INACTIVE"
      });
    }
    
    // User is active, allow the request to proceed
    structuredLogger.debug('USER_ACTIVE_CHECK_PASSED', req.sessionContext, req.requestId, {
      logger: 'app.middleware.active-check'
    });
    
    return next();
    
  } catch (error) {
    // Log the middleware error but don't block the request
    // This ensures that middleware errors don't break the application
    structuredLogger.error('USER_ACTIVE_CHECK_MIDDLEWARE_ERROR', req.sessionContext, req.requestId, {
      logger: 'app.middleware.active-check'
    });
    
    console.error('Error in checkActiveUserForWrites middleware:', error instanceof Error ? error.message : String(error));
    
    // Allow request to proceed to avoid breaking the application due to middleware errors
    return next();
  }
};

/**
 * Helper function to create a combined middleware that checks both authentication and active status
 * Usage: app.post('/protected-route', requireActiveUser, routeHandler)
 */
export const requireActiveUser = [
  // First check authentication
  (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  },
  // Then check active status for writes
  checkActiveUserForWrites
];