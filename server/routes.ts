import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { redisCache } from "./redis-cache";
import { insertEntitySchema, insertTeamSchema, updateTeamSchema, insertEntityHistorySchema, insertIssueSchema, insertUserSchema, insertNotificationTimelineSchema, adminUserSchema, Entity, InsertNotificationTimeline } from "@shared/schema";
import { z } from "zod";
import { logAuthenticationEvent, structuredLogger } from "./middleware/structured-logging";

// Zod validation schema for rollback requests
const rollbackRequestSchema = z.object({
  toVersion: z.union([z.string(), z.number()]).transform(val => {
    const parsed = parseInt(val.toString());
    if (isNaN(parsed) || parsed < 1) {
      throw new z.ZodError([{
        code: z.ZodIssueCode.custom,
        message: "toVersion must be a positive integer",
        path: ["toVersion"]
      }]);
    }
    return parsed;
  }),
  user_email: z.string().email("Invalid email format").min(1, "User email is required"),
  reason: z.string().optional().default("")
});

type RollbackRequest = z.infer<typeof rollbackRequestSchema>;

// Tenant validation schemas (not defined in shared/schema.ts)
const adminTenantSchema = z.object({
  name: z.string().min(1, "Tenant name is required"),
  description: z.string().optional()
});

const updateTenantSchema = z.object({
  name: z.string().min(1, "Tenant name is required").optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update"
});

const updateUserSchema = adminUserSchema.partial().refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update"
});

// Helper function to create audit log entries for rollback operations
function createRollbackAuditLog(event: string, req: Request, additionalData?: any) {
  return {
    event,
    session_id: req.sessionID || 'unknown',
    notification_id: null,
    user_id: req.user?.id || null,
    email: req.user?.email || req.user?.username || 'unknown',
    session_type: 'local',
    roles: (req.user as any)?.role || 'user',
    request_id: req.requestId || 'unknown',
    logger: 'app.rollback.security',
    level: 'info' as const,
    timestamp: new Date().toISOString(),
    ...additionalData
  };
}
import { setupSimpleAuth, authorizeRollbackWithFastAPI } from "./simple-auth";
import { setupTestRoutes } from "./test-routes";

// Structured error response helpers
function createValidationErrorResponse(error: z.ZodError, message: string = "Validation failed") {
  return {
    message,
    errors: error.format(),
    timestamp: new Date().toISOString(),
    type: 'validation_error'
  };
}

function createErrorResponse(message: string, type: string = 'server_error', details?: any) {
  return {
    message,
    type,
    timestamp: new Date().toISOString(),
    ...(details && { details })
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up simplified authentication (no password hashing)
  setupSimpleAuth(app);
  
  // Set up test routes for development
  setupTestRoutes(app);
  
  // Environment-aware Express API routing middleware
  // In development: Allow auth fallback routes for testing
  // In production: Block legacy Express routes except critical fallbacks to prevent RBAC bypass
  const environment = process.env.NODE_ENV || 'development';
  const isDevelopment = environment === 'development';
  
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // CRITICAL SECURITY FIX: Only allow FastAPI fallback endpoints in development mode
    // Note: req.path doesn't include '/api' when middleware is mounted on '/api'
    if (req.path.startsWith('/v1/')) {
      if (isDevelopment) {
        structuredLogger.info('EXPRESS_FASTAPI_FALLBACK_DEV', {
          method: req.method,
          environment,
          timestamp: new Date().toISOString(),
          message: 'Allowing FastAPI fallback endpoint in development mode'
        });
        return next();
      } else {
        // In production: Block all FastAPI fallback routes to prevent RBAC bypass
        structuredLogger.warn('BLOCKED_FASTAPI_FALLBACK_PRODUCTION', {
          method: req.method,
          environment,
          timestamp: new Date().toISOString(),
          message: 'SECURITY: Blocked FastAPI fallback route in production to prevent RBAC bypass'
        });
        return res.status(503).json({
          error: 'FASTAPI_FALLBACK_DISABLED_PRODUCTION',
          message: 'FastAPI fallback routes are disabled in production for security. Use actual FastAPI endpoints.',
          environment,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Core system endpoints - always allowed
    const coreSystemPaths = [
      '/health',
      '/cache/status',
      '/cache/refresh'
    ];
    
    // Authentication fallback endpoints - environment-specific
    const authFallbackPaths = [
      '/login',
      '/logout', 
      '/register',
      '/user',
      '/auth/azure/validate',
      '/dev/create-test-user'
    ];
    
    // Development-only endpoints
    const developmentPaths = [
      '/debug/teams',
      '/teams',
      '/entities',
      '/dashboard/summary',
      '/users',
      '/tenants'
    ];
    
    // Check core system paths first (always allowed)
    if (coreSystemPaths.includes(req.path)) {
      structuredLogger.info('EXPRESS_CORE_ENDPOINT', {
        path: req.path,
        method: req.method,
        environment,
        timestamp: new Date().toISOString(),
        message: 'Using Express core system endpoint'
      });
      return next();
    }
    
    // In development mode: Allow auth fallbacks and development endpoints
    if (isDevelopment) {
      if (authFallbackPaths.includes(req.path) || developmentPaths.some(path => req.path.startsWith(path))) {
        structuredLogger.info('EXPRESS_DEVELOPMENT_ENDPOINT', {
          path: req.path,
          method: req.method,
          environment,
          timestamp: new Date().toISOString(),
          message: 'Using Express endpoint in development mode'
        });
        return next();
      }
    } else {
      // In production: Only allow auth fallbacks for emergency access
      if (authFallbackPaths.includes(req.path)) {
        structuredLogger.info('EXPRESS_AUTH_FALLBACK', {
          path: req.path,
          method: req.method,
          environment,
          timestamp: new Date().toISOString(),
          message: 'Using Express auth fallback in production (FastAPI unavailable)'
        });
        return next();
      }
    }
    
    // Block all other /api/* calls with environment-specific messaging
    const blockReason = isDevelopment 
      ? 'Legacy Express API call blocked in development - use FastAPI /api/v1/* instead'
      : 'Legacy Express API call blocked in production - use FastAPI /api/v1/* for security';
      
    structuredLogger.warn('BLOCKED_LEGACY_EXPRESS_CALL', {
      path: req.path,
      method: req.method,
      environment,
      headers: req.headers,
      timestamp: new Date().toISOString(),
      message: blockReason
    });
    
    return res.status(410).json({
      error: 'LEGACY_ENDPOINT_DISABLED',
      message: `Legacy Express endpoint ${req.path} is disabled. Use FastAPI /api/v1/* endpoints instead.`,
      fastapi_endpoint: req.path.replace('/api/', '/api/v1/'),
      environment,
      timestamp: new Date().toISOString()
    });
  });
  
  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
  
  
  // API Routes
  
  // Users endpoints for notification system
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // FastAPI fallback route for admin users endpoint
  app.get("/api/v1/users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      // Transform user data to match FastAPI format expected by admin pages
      const transformedUsers = users.map(user => ({
        user_id: user.id,
        user_name: user.username,
        user_email: user.email,
        user_slack: user.displayName ? [user.displayName.toLowerCase().replaceAll(' ', '.')] : [],
        user_pagerduty: user.email ? [user.email] : [],
        is_active: user.is_active !== undefined ? user.is_active : true // Use actual status or default to active
      }));
      res.json(transformedUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users from FastAPI fallback" });
    }
  });

  // FastAPI fallback route for creating new users
  app.post("/api/v1/users", async (req, res) => {
    try {
      // Validate request body with admin user schema
      const validationResult = adminUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { user_name, user_email, user_slack, user_pagerduty, is_active } = validationResult.data;

      // Create user with internal schema
      const newUser = await storage.createUser({
        username: user_name,
        password: "temp-password", // In real implementation, this would be generated or handled via Azure AD
        email: user_email,
        displayName: user_name,
        user_slack: user_slack || [],
        user_pagerduty: user_pagerduty || [],
        is_active: is_active,
        role: "user" // Default role
      });

      // Transform response to match admin panel format
      const transformedUser = {
        user_id: newUser.id,
        user_name: newUser.username,
        user_email: newUser.email,
        user_slack: newUser.user_slack || [],
        user_pagerduty: newUser.user_pagerduty || [],
        is_active: newUser.is_active
      };

      res.status(201).json(transformedUser);
    } catch (error) {
      console.error('User creation error:', error);
      res.status(500).json(createErrorResponse("Failed to create user", "creation_error"));
    }
  });

  // FastAPI fallback route for updating users
  app.put("/api/v1/users/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json(createErrorResponse("Invalid user ID", "validation_error"));
      }

      // Validate request body
      const validationResult = updateUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const updateData = validationResult.data;
      
      // Transform admin panel fields to internal schema fields
      const internalUpdateData: any = {};
      if (updateData.user_name) internalUpdateData.username = updateData.user_name;
      if (updateData.user_email) internalUpdateData.email = updateData.user_email;
      if (updateData.user_slack) internalUpdateData.user_slack = updateData.user_slack;
      if (updateData.user_pagerduty) internalUpdateData.user_pagerduty = updateData.user_pagerduty;
      if (updateData.is_active !== undefined) internalUpdateData.is_active = updateData.is_active;

      // Update user
      const updatedUser = await storage.updateUser(userId, internalUpdateData);
      if (!updatedUser) {
        return res.status(404).json(createErrorResponse("User not found", "not_found"));
      }

      // Transform response to match admin panel format
      const transformedUser = {
        user_id: updatedUser.id,
        user_name: updatedUser.username,
        user_email: updatedUser.email,
        user_slack: updatedUser.user_slack || [],
        user_pagerduty: updatedUser.user_pagerduty || [],
        is_active: updatedUser.is_active
      };

      res.json(transformedUser);
    } catch (error) {
      console.error('User update error:', error);
      res.status(500).json(createErrorResponse("Failed to update user", "update_error"));
    }
  });

  app.get("/api/users/roles", async (req, res) => {
    try {
      const roles = await storage.getUserRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user roles" });
    }
  });

  // Teams endpoints - using cache
  app.get("/api/teams", async (req, res) => {
    try {
      const { teamName } = req.query;
      const teams = await redisCache.getAllTeams();
      
      // Filter out inactive teams for dashboard team dropdown (like tenants)
      const activeTeams = teams.filter(team => team.isActive !== false);
      
      // If team name is provided, filter teams or log the specific team request
      if (teamName) {
        const filteredTeams = activeTeams.filter(team => team.name === teamName);
        res.json(filteredTeams);
      } else {
        res.json(activeTeams);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams from cache" });
    }
  });

  // Tenants endpoints - using cache (same data source as admin)
  app.get("/api/tenants", async (req, res) => {
    try {
      const cacheKey = 'all_tenants';
      let tenants = await redisCache.get(cacheKey);
      
      if (!tenants) {
        tenants = await storage.getTenants();
        await redisCache.set(cacheKey, tenants, 6 * 60 * 60); // 6 hour cache
      }

      // Filter out inactive tenants for dashboard tenant filter dropdown
      const activeTenants = tenants.filter(tenant => tenant.isActive !== false);

      res.json(activeTenants);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  // FastAPI fallback route for admin tenants endpoint
  app.get("/api/v1/tenants", async (req, res) => {
    try {
      const cacheKey = 'all_tenants';
      let tenants = await redisCache.get(cacheKey);
      
      if (!tenants) {
        tenants = await storage.getTenants();
        await redisCache.set(cacheKey, tenants, 6 * 60 * 60); // 6 hour cache
      }

      res.json(tenants);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenants from FastAPI fallback" });
    }
  });

  // FastAPI fallback route for creating new tenants
  app.post("/api/v1/tenants", async (req, res) => {
    try {
      // Validate request body
      const validationResult = adminTenantSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { name, description } = validationResult.data;

      // Create tenant
      const newTenant = await storage.createTenant({ name, description });

      // Clear cache after creation
      const cacheKey = 'all_tenants';
      await redisCache.invalidateCache([cacheKey]);

      res.status(201).json(newTenant);
    } catch (error) {
      console.error('Tenant creation error:', error);
      res.status(500).json(createErrorResponse("Failed to create tenant", "creation_error"));
    }
  });

  // FastAPI fallback route for updating tenants
  app.put("/api/v1/tenants/:tenantId", async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (isNaN(tenantId)) {
        return res.status(400).json(createErrorResponse("Invalid tenant ID", "validation_error"));
      }

      // Validate request body
      const validationResult = updateTenantSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const updateData = validationResult.data;

      // Update tenant
      const updatedTenant = await storage.updateTenant(tenantId, updateData);
      if (!updatedTenant) {
        return res.status(404).json(createErrorResponse("Tenant not found", "not_found"));
      }

      // Clear cache after update
      const cacheKey = 'all_tenants';
      await redisCache.invalidateCache([cacheKey]);

      res.json(updatedTenant);
    } catch (error) {
      console.error('Tenant update error:', error);
      res.status(500).json(createErrorResponse("Failed to update tenant", "update_error"));
    }
  });

  // FastAPI fallback route for creating new teams
  app.post("/api/v1/teams", async (req, res) => {
    try {
      // Validate request body
      const validationResult = insertTeamSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      // Create team
      const newTeam = await storage.createTeam(validationResult.data);

      // Invalidate all team-related caches using correct main cache keys
      await redisCache.invalidateCache({
        keys: ['all_teams', 'teams_summary'],
        patterns: [
          'team_details:*',
          'team_entities:*',
          'team_metrics:*',
          'team_trends:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        mainCacheKeys: ['TEAMS'], // This invalidates CACHE_KEYS.TEAMS used by getAllTeams()
        refreshAffectedData: true
      });

      res.status(201).json(newTeam);
    } catch (error) {
      console.error('Team creation error:', error);
      res.status(500).json(createErrorResponse("Failed to create team", "creation_error"));
    }
  });

  // FastAPI fallback route for updating teams
  app.put("/api/v1/teams/:teamId", async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      if (isNaN(teamId)) {
        return res.status(400).json(createErrorResponse("Invalid team ID", "validation_error"));
      }

      // Validate request body
      const validationResult = updateTeamSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const updateData = validationResult.data;

      // Update team
      const updatedTeam = await storage.updateTeam(teamId, updateData);
      if (!updatedTeam) {
        return res.status(404).json(createErrorResponse("Team not found", "not_found"));
      }

      // Invalidate all team-related caches
      await redisCache.invalidateCache({
        keys: ['all_teams', 'teams_summary'],
        patterns: [
          'team_details:*',
          'team_entities:*',
          'team_metrics:*',
          'team_trends:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        mainCacheKeys: ['TEAMS'], // This invalidates CACHE_KEYS.TEAMS used by getAllTeams()
        refreshAffectedData: true
      });

      res.json(updatedTeam);
    } catch (error) {
      console.error('Team update error:', error);
      res.status(500).json(createErrorResponse("Failed to update team", "update_error"));
    }
  });

  // Debug endpoint to check team data - using cache
  app.get("/api/debug/teams", async (req, res) => {
    try {
      const teams = await redisCache.getAllTeams();
      res.json({
        total: teams.length,
        teams: teams.map(t => ({ id: t.id, name: t.name, description: t.description })),
        message: "Debug: All teams with IDs from cache"
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams for debug" });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ 
      status: 'Passed', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      cache: 'redis-fallback-ready'
    });
  });

  // Cache management endpoints
  app.get("/api/cache/status", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cache status" });
    }
  });

  app.post("/api/cache/refresh", async (req, res) => {
    try {
      await redisCache.forceRefresh();
      res.json({ message: "Cache refreshed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to refresh cache" });
    }
  });

  // Helper functions for date range routing
  function isDateRangePredefined(startDate: string, endDate: string): boolean {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate the difference in days between start and end dates
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const daysFromNow = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`Date range check: startDate=${startDate}, endDate=${endDate}, daysDiff=${daysDiff}, daysFromNow=${daysFromNow}`);
    
    // Check if this matches common predefined ranges based on day differences
    if (daysDiff <= 1 && daysFromNow <= 1) {
      console.log('Detected: Today');
      return true; // Today
    }
    if (daysDiff <= 1 && daysFromNow >= 1 && daysFromNow <= 2) {
      console.log('Detected: Yesterday');
      return true; // Yesterday  
    }
    if (daysDiff >= 6 && daysDiff <= 8 && daysFromNow <= 1) {
      console.log('Detected: Last 7 Days');
      return true; // Last 7 Days
    }
    if (daysDiff >= 29 && daysDiff <= 31 && daysFromNow <= 31) {
      console.log('Detected: Last 30 Days');
      return true; // Last 30 Days (more flexible detection)
    }
    
    // Check for current month (start of month to now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysSinceMonthStart = Math.ceil((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
    if (Math.abs(start.getTime() - monthStart.getTime()) < 24 * 60 * 60 * 1000 && 
        daysDiff >= daysSinceMonthStart - 1 && daysDiff <= daysSinceMonthStart + 1) {
      console.log('Detected: This Month');
      return true; // This Month
    }
    
    console.log('Not detected as predefined range');
    return false;
  }
  
  function determinePredefinedRange(startDate: string, endDate: string): 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth' {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const daysFromNow = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1 && daysFromNow <= 1) return 'today';
    if (daysDiff <= 1 && daysFromNow >= 1 && daysFromNow <= 2) return 'yesterday';
    if (daysDiff >= 6 && daysDiff <= 8) return 'last7Days';
    if (daysDiff >= 29 && daysDiff <= 31) return 'last30Days';
    
    // Check for current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (Math.abs(start.getTime() - monthStart.getTime()) < 24 * 60 * 60 * 1000) return 'thisMonth';
    
    return 'last30Days'; // Default fallback
  }

  // Dashboard endpoints using cache with smart routing
  app.get("/api/dashboard/summary", async (req, res) => {
    try {
      const tenantName = req.query.tenant as string;
      const teamName = req.query.team as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!tenantName) {
        return res.status(400).json({ message: "Tenant parameter is required" });
      }
      
      const isTeamDashboard = teamName && teamName !== '0';

      // Determine if this is a predefined range or custom range
      const isPredefinedRange = !startDate || !endDate || isDateRangePredefined(startDate, endDate);
      const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
      
      if (isPredefinedRange && !USE_FASTAPI) {
        // Use cached data for predefined ranges when FastAPI is disabled
        const rangeType = startDate && endDate ? determinePredefinedRange(startDate, endDate) : 'last30Days';
        
        let metrics, complianceTrends;
        
        if (isTeamDashboard) {
          // Team Dashboard: Get team-specific cached data
          metrics = await redisCache.getTeamMetricsByRange(tenantName, teamName, rangeType);
          complianceTrends = await redisCache.getTeamTrendsByRange(tenantName, teamName, rangeType);
        } else {
          // Summary Dashboard: Get tenant-level cached data
          metrics = await redisCache.getMetricsByTenantAndRange(tenantName, rangeType);
          complianceTrends = await redisCache.getComplianceTrendsByTenantAndRange(tenantName, rangeType);
        }
        
        if (!metrics) {
          const scope = isTeamDashboard ? `team=${teamName}` : 'tenant-wide';
          return res.status(404).json({ message: `No data found for the specified ${scope} and range` });
        }
        
        const logScope = isTeamDashboard ? `team=${teamName}` : 'tenant-wide';
        console.log(`GET /api/dashboard/summary - Parameters: tenant=${tenantName}, ${logScope}, range=${rangeType} (cached) - status: 200`);
        
        return res.json({
          metrics,
          complianceTrends,
          lastUpdated: new Date(),
          cached: true,
          dateRange: rangeType,
          scope: isTeamDashboard ? 'team' : 'tenant'
        });
      }
      
      if (USE_FASTAPI) {
        // TODO: Call FastAPI endpoints
        console.log(`GET /api/dashboard/summary - Would call FastAPI for tenant=${tenantName}`);
        // For now, fallback to date range calculation
      }
      
      // Custom date range or FastAPI fallback: calculate metrics for specific date range
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        let metrics;
        if (isTeamDashboard) {
          // Team Dashboard: Calculate team-specific metrics for custom date range
          metrics = await redisCache.calculateTeamMetricsForDateRange(tenantName, teamName, start, end);
        } else {
          // Summary Dashboard: Calculate tenant-level metrics for custom date range
          metrics = await redisCache.calculateMetricsForDateRange(tenantName, start, end);
        }
        
        if (!metrics) {
          const scope = isTeamDashboard ? `team=${teamName}` : 'tenant';
          return res.status(404).json({ message: `No data found for the specified ${scope} and date range` });
        }
        
        const logScope = isTeamDashboard ? `team=${teamName}` : 'tenant-wide';
        console.log(`GET /api/dashboard/summary - Parameters: tenant=${tenantName}, ${logScope}, custom range=${startDate} to ${endDate} - status: 200`);
        
        return res.json({ 
          metrics,
          complianceTrends: null, // No trends for custom date ranges yet
          lastUpdated: new Date(),
          cached: false,
          dateRange: { startDate, endDate },
          scope: isTeamDashboard ? 'team' : 'tenant'
        });
      }
      
      // Default: get 30-day cached metrics (backward compatibility)
      let metrics, complianceTrends;
      
      if (isTeamDashboard) {
        // Team Dashboard: Get team-specific cached data (default to last30Days)
        metrics = await redisCache.getTeamMetricsByRange(tenantName, teamName, 'last30Days');
        complianceTrends = await redisCache.getTeamTrendsByRange(tenantName, teamName, 'last30Days');
      } else {
        // Summary Dashboard: Get tenant-level cached data
        metrics = await redisCache.getDashboardMetrics(tenantName);
        complianceTrends = await redisCache.getComplianceTrends(tenantName);
      }
      
      if (!metrics) {
        return res.status(404).json({ message: "No data found for the specified tenant" });
      }
      
      console.log(`GET /api/dashboard/summary - Parameters: tenant=${tenantName} (default 30-day) - status: 200`);
      
      res.json({
        metrics,
        complianceTrends,
        lastUpdated: new Date(),
        cached: true,
        dateRange: "last30Days"
      });
    } catch (error) {
      console.error('Dashboard summary error:', error);
      res.status(500).json({ 
        message: "Failed to fetch dashboard summary from cache",
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  app.post("/api/teams", async (req, res) => {
    try {
      const result = insertTeamSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid team data", errors: result.error.format() });
      }
      
      const team = await storage.createTeam(result.data);
      
      // Invalidate all team-related caches using correct main cache keys
      await redisCache.invalidateCache({
        keys: [
          `team_${team.id}`,         // Individual team cache
          `team_details_${team.name}`, // Team details cache
          `team_members_${team.name}`  // Team members cache
        ],
        patterns: [
          'team_*',      // All team-related cache keys
          'dashboard_*', // Dashboard data that uses team filters
          'summary_*'    // Dashboard summary with team filters
        ],
        mainCacheKeys: ['TEAMS'], // This invalidates CACHE_KEYS.TEAMS used by getAllTeams()
        refreshAffectedData: true
      });
      
      res.status(201).json(team);
    } catch (error) {
      res.status(500).json({ message: "Failed to create team" });
    }
  });
  
  app.get("/api/teams/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }
      
      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      res.json(team);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  // Get team details by team name with member information
  app.get("/api/get_team_details/:teamName", async (req, res) => {
    try {
      const { teamName } = req.params;
      
      // Use cache key for team details
      const cacheKey = `team_details_${teamName}`;
      let teamDetails = await redisCache.get(cacheKey);
      
      if (!teamDetails) {
        const team = await storage.getTeamByName(teamName);
        
        if (!team) {
          return res.status(404).json({ message: "Team not found" });
        }

        // Get actual team members from storage
        const members = await storage.getTeamMembers(teamName);

        teamDetails = {
          ...team,
          members: members
        };

        // Cache for 6 hours like other data
        await redisCache.set(cacheKey, teamDetails, 6 * 60 * 60);
      }

      res.json(teamDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team details" });
    }
  });

  // Get team members endpoint with caching
  app.get("/api/get_team_members/:teamName", async (req, res) => {
    try {
      const { teamName } = req.params;
      
      // Use cache key for team members
      const cacheKey = `team_members_${teamName}`;
      let members = await redisCache.get(cacheKey);
      
      if (!members) {
        members = await storage.getTeamMembers(teamName);
        
        // Cache for 6 hours like other data
        await redisCache.set(cacheKey, members, 6 * 60 * 60);
      }

      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Get all users endpoint with caching
  app.get("/api/get_user", async (req, res) => {
    try {
      const cacheKey = 'all_users';
      let users = await redisCache.get(cacheKey);
      
      if (!users) {
        users = await storage.getUsers();
        
        // Cache for 6 hours like other data
        await redisCache.set(cacheKey, users, 6 * 60 * 60);
      }

      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Team member management endpoints
  app.post("/api/teams/:teamName/members", async (req, res) => {
    try {
      const { teamName } = req.params;
      
      // Simple validation for team member operations - match frontend exactly
      const memberSchema = z.object({
        action: z.enum(['add', 'remove', 'update']),
        memberId: z.union([z.string(), z.number()]).transform(String), // Accept both string and number, convert to string
        member: z.any().optional()
      });
      
      const result = memberSchema.safeParse(req.body);
      if (!result.success) {
        console.log('Team member validation failed:', result.error.format());
        return res.status(400).json({ 
          message: "Invalid team member data", 
          errors: result.error.format() 
        });
      }
      
      const memberData = req.body;

      // Get OAuth context (team, tenant, username from session or headers)
      const oauthContext = {
        team: teamName,
        tenant: (Array.isArray(req.headers['x-tenant']) ? req.headers['x-tenant'][0] : req.headers['x-tenant']) || 'Data Engineering',
        username: (Array.isArray(req.headers['x-username']) ? req.headers['x-username'][0] : req.headers['x-username']) || 'azure_test_user'
      };

      const updatedTeam = await storage.updateTeamMembers(teamName, memberData, oauthContext);
      
      if (!updatedTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Use centralized cache invalidation system with real-time updates
      await redisCache.invalidateTeamData(teamName, {
        action: memberData.action,
        memberId: memberData.memberId,
        memberName: memberData.member?.name || memberData.member?.username,
        tenantName: oauthContext.tenant
      });

      res.json(updatedTeam);
    } catch (error) {
      res.status(500).json({ message: "Failed to update team members" });
    }
  });
  
  // Entities endpoints - using cache with pre-defined date filtering
  app.get("/api/entities", async (req, res) => {
    try {
      let entities = await redisCache.getAllEntities();
      
      // Filter by tenant if tenant parameter is provided
      if (req.query.tenant) {
        const tenantName = req.query.tenant as string;
        entities = await redisCache.getEntitiesByTenant(tenantName);
      }
      
      // Pre-defined date filtering (served from cache)
      if (req.query.date_filter) {
        const dateFilter = req.query.date_filter as string;
        const now = new Date();
        let filterDate: Date;
        
        switch (dateFilter.toLowerCase()) {
          case 'today':
            filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            entities = entities.filter(entity => {
              if (!entity.lastRefreshed) return false;
              const entityDate = new Date(entity.lastRefreshed);
              return entityDate >= filterDate;
            });
            break;
            
          case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
            const endOfYesterday = new Date(startOfYesterday);
            endOfYesterday.setHours(23, 59, 59, 999);
            entities = entities.filter(entity => {
              if (!entity.lastRefreshed) return false;
              const entityDate = new Date(entity.lastRefreshed);
              return entityDate >= startOfYesterday && entityDate <= endOfYesterday;
            });
            break;
            
          case 'last_7_days':
            filterDate = new Date(now);
            filterDate.setDate(filterDate.getDate() - 7);
            entities = entities.filter(entity => {
              if (!entity.lastRefreshed) return false;
              const entityDate = new Date(entity.lastRefreshed);
              return entityDate >= filterDate;
            });
            break;
            
          case 'last_30_days':
            filterDate = new Date(now);
            filterDate.setDate(filterDate.getDate() - 30);
            entities = entities.filter(entity => {
              if (!entity.lastRefreshed) return false;
              const entityDate = new Date(entity.lastRefreshed);
              return entityDate >= filterDate;
            });
            break;
            
          case 'this_month':
            filterDate = new Date(now.getFullYear(), now.getMonth(), 1);
            entities = entities.filter(entity => {
              if (!entity.lastRefreshed) return false;
              const entityDate = new Date(entity.lastRefreshed);
              return entityDate >= filterDate;
            });
            break;
            
          default:
            return res.status(400).json({ 
              message: "Invalid date_filter. Supported values: today, yesterday, last_7_days, last_30_days, this_month. Use /api/entities/custom for custom date ranges." 
            });
        }
      }
      
      // Additional filters
      if (req.query.teamId) {
        const teamId = parseInt(req.query.teamId as string);
        if (isNaN(teamId)) {
          return res.status(400).json({ message: "Invalid team ID" });
        }
        entities = entities.filter(entity => entity.teamId === teamId);
      } else if (req.query.type) {
        const type = req.query.type as string;
        if (type !== 'table' && type !== 'dag') {
          return res.status(400).json({ message: "Type must be 'table' or 'dag'" });
        }
        entities = entities.filter(entity => entity.type === type);
      }
      
      // Maintain backward compatibility: return array for existing clients
      // Add metadata only when specifically requested
      if (req.query.include_metadata === 'true') {
        res.json({
          entities,
          totalCount: entities.length,
          cached: true,
          dateFilter: req.query.date_filter || null
        });
      } else {
        // Default: return just the entities array (backward compatible)
        res.json(entities);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch entities from cache" });
    }
  });
  
  // Custom entities endpoint for ad-hoc date range queries (no caching)
  app.get("/api/entities/custom", async (req, res) => {
    try {
      const { start_date, end_date, team_id, tenant } = req.query;
      
      // Validate required date parameters
      if (!start_date || !end_date) {
        return res.status(400).json({ 
          message: "start_date and end_date parameters are required for custom date range queries" 
        });
      }
      
      // Parse and validate dates
      const startDate = new Date(start_date as string);
      const endDate = new Date(end_date as string);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ 
          message: "Invalid date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)" 
        });
      }
      
      if (startDate >= endDate) {
        return res.status(400).json({ 
          message: "start_date must be earlier than end_date" 
        });
      }
      
      // Parse optional filters
      const teamId = team_id ? parseInt(team_id as string) : undefined;
      const tenantName = tenant as string;
      
      if (team_id && isNaN(teamId!)) {
        return res.status(400).json({ message: "Invalid team_id parameter" });
      }
      
      // Call storage directly - no caching for custom queries
      const entities = await storage.getEntitiesByDateRange(startDate, endDate, teamId, tenantName);
      
      res.json({
        entities,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        totalCount: entities.length,
        cached: false // Indicate this is not cached data
      });
      
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch entities for custom date range" });
    }
  });
  
  app.post("/api/entities", async (req, res) => {
    try {
      const result = insertEntitySchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid entity data", errors: result.error.format() });
      }
      
      // Create entity directly in Redis cache (persistent storage)
      const entity = await redisCache.createEntity(result.data);
      
      // Entity-type-specific cache invalidation and rebuild (targeted approach)
      await redisCache.invalidateAndRebuildEntityCache(
        entity.teamId, 
        entity.type as 'table' | 'dag',
        true // Enable background rebuild
      );
      
      res.status(201).json(entity);
    } catch (error) {
      res.status(500).json({ message: "Failed to create entity" });
    }
  });
  
  app.get("/api/entities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      const entity = await redisCache.getEntity(id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      res.json(entity);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch entity" });
    }
  });

  // Get detailed entity information for editing
  app.get("/api/entities/:id/details", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      const entity = await redisCache.getEntity(id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      // Enhanced entity details with comprehensive field structure
      const entityDetails = {
        ...entity,
        // Common fields with sensible defaults based on entity type
        tenant_name: entity.tenant_name || (entity.type === 'table' ? 'Data Engineering' : 'Analytics'),
        team_name: entity.team_name || 'PGM',
        notification_preferences: entity.notification_preferences || ['email', 'slack'],
        owner_email: entity.owner_email || 'john.smith@example.com',
        user_email: entity.user_email || 'john.smith@example.com',
        is_active: entity.is_active !== undefined ? entity.is_active : true,
        expected_runtime_minutes: entity.expected_runtime_minutes || (entity.type === 'table' ? 30 : 45),
        donemarker_location: entity.donemarker_location || (entity.type === 'table' 
          ? 's3://analytics-tables/done_markers/' 
          : 's3://analytics-dags/agg_daily/'),
        donemarker_lookback: entity.donemarker_lookback || 2,
        
        // Type-specific fields
        ...(entity.type === 'table' ? {
          schema_name: entity.schema_name || 'analytics',
          table_name: entity.table_name || entity.name,
          table_description: entity.table_description || entity.description || 'Table for analytics processing',
          table_schedule: entity.table_schedule || '0 2 * * *',
          table_dependency: entity.table_dependency || 'raw_data_ingest,user_profile_enrichment',
        } : {
          dag_name: entity.dag_name || entity.name,
          dag_description: entity.dag_description || entity.description || 'DAG for daily analytics processing',
          dag_schedule: entity.dag_schedule || '0 2 * * *',
          dag_dependency: entity.dag_dependency || 'raw_data_ingest,user_profile_enrichment',
        })
      };
      
      res.json(entityDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch entity details" });
    }
  });
  
  app.put("/api/entities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      // Only validate the provided fields
      const updateSchema = z.object({
        name: z.string().optional(),
        type: z.string().optional(),
        teamId: z.number().optional(),
        description: z.string().optional(),
        slaTarget: z.number().optional(),
        currentSla: z.number().optional(),
        status: z.string().optional(),
        refreshFrequency: z.string().optional(),
        lastRefreshed: z.date().optional(),
        nextRefresh: z.date().optional(),
        owner: z.string().optional(),
        ownerEmail: z.string().optional(),
        is_active: z.boolean().optional(),
        // Add other common entity fields
        tenant_name: z.string().optional(),
        team_name: z.string().optional(),
        schema_name: z.string().optional(),
        table_name: z.string().optional(),
        table_description: z.string().optional(),
        table_schedule: z.string().optional(),
        table_dependency: z.string().optional(),
        dag_name: z.string().optional(),
        dag_description: z.string().optional(),
        dag_schedule: z.string().optional(),
        dag_dependency: z.string().optional(),
        server_name: z.string().optional(),
        expected_runtime_minutes: z.number().optional(),
        donemarker_location: z.string().optional(),
        donemarker_lookback: z.number().optional(),
        owner_email: z.string().optional(),
        user_email: z.string().optional(),
        notification_preferences: z.array(z.string()).optional(),
        is_entity_owner: z.boolean().optional(),
      });
      
      const result = updateSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid entity data", errors: result.error.format() });
      }
      
      // Ensure table_dependency and dag_dependency are properly typed as arrays
      const updateData: Partial<Entity> = { ...result.data } as any;
      if (updateData.table_dependency && typeof updateData.table_dependency === 'string') {
        updateData.table_dependency = (updateData.table_dependency as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      if (updateData.dag_dependency && typeof updateData.dag_dependency === 'string') {
        updateData.dag_dependency = (updateData.dag_dependency as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      const updatedEntity = await redisCache.updateEntityById(id, updateData);
      if (!updatedEntity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      // Entity-type-specific cache invalidation (targeted approach)
      await redisCache.invalidateAndRebuildEntityCache(
        updatedEntity.teamId, 
        updatedEntity.type as 'table' | 'dag',
        true // Enable background rebuild
      );
      
      res.json(updatedEntity);
    } catch (error) {
      res.status(500).json({ message: "Failed to update entity" });
    }
  });
  
  app.delete("/api/entities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      // Get entity info before deletion for cache invalidation
      const entityToDelete = await redisCache.getEntity(id);
      if (!entityToDelete) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      const success = await redisCache.deleteEntity(id);
      if (!success) {
        return res.status(500).json({ message: "Failed to delete entity" });
      }
      
      // Force WebSocket notification to all clients for real-time frontend updates
      redisCache.forceNotifyClients('entity-updated', {
        entityId: id,
        entityName: entityToDelete.name,
        entityType: entityToDelete.type,
        teamName: entityToDelete.team_name || 'Unknown',
        tenantName: entityToDelete.tenant_name || 'Unknown',
        type: 'deleted',
        entity: entityToDelete,
        timestamp: new Date()
      });
      
      // Entity-type-specific cache invalidation (targeted approach)
      await redisCache.invalidateAndRebuildEntityCache(
        entityToDelete.teamId, 
        entityToDelete.type as 'table' | 'dag',
        true // Enable background rebuild
      );
      
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete entity" });
    }
  });
  
  // Entity History endpoints
  app.get("/api/entities/:id/history", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      const history = await storage.getEntityHistory(id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch entity history" });
    }
  });
  
  app.post("/api/entities/:id/history", async (req, res) => {
    try {
      const entityId = parseInt(req.params.id);
      if (isNaN(entityId)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      const data = { ...req.body, entityId };
      const result = insertEntityHistorySchema.safeParse(data);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid history data", errors: result.error.format() });
      }
      
      const history = await storage.addEntityHistory(result.data);
      res.status(201).json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to add entity history" });
    }
  });
  
  // Issues endpoints
  app.get("/api/entities/:id/issues", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      const issues = await storage.getIssues(id);
      res.json(issues);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch issues" });
    }
  });
  
  app.post("/api/entities/:id/issues", async (req, res) => {
    try {
      const entityId = parseInt(req.params.id);
      if (isNaN(entityId)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      const data = { ...req.body, entityId };
      const result = insertIssueSchema.safeParse(data);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid issue data", errors: result.error.format() });
      }
      
      const issue = await storage.addIssue(result.data);
      res.status(201).json(issue);
    } catch (error) {
      res.status(500).json({ message: "Failed to add issue" });
    }
  });
  
  app.put("/api/issues/:id/resolve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid issue ID" });
      }
      
      const resolvedIssue = await storage.resolveIssue(id);
      if (!resolvedIssue) {
        return res.status(404).json({ message: "Issue not found" });
      }
      
      res.json(resolvedIssue);
    } catch (error) {
      res.status(500).json({ message: "Failed to resolve issue" });
    }
  });

  // Notification Timeline endpoints

  // Get notification timelines for an entity
  app.get("/api/entities/:id/notification-timelines", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const entityId = parseInt(req.params.id);
      const timelines = await storage.getNotificationTimelines(entityId);
      res.json(timelines);
    } catch (error) {
      console.error("Error fetching notification timelines:", error);
      res.status(500).json({ message: "Failed to fetch notification timelines" });
    }
  });

  // Get all tasks for an entity with task_type field
  app.get("/api/entities/:id/tasks", async (req: Request, res: Response) => {
    try {
      const entityId = parseInt(req.params.id);
      // Return all tasks with task_type field indicating AI or regular
      const allTasks = [
        { id: 1, name: "Task1", description: "AI monitoring for Task1", task_type: "AI" },
        { id: 2, name: "Task2", description: "AI monitoring for Task2", task_type: "AI" },
        { id: 3, name: "Task3", description: "AI monitoring for Task3", task_type: "AI" },
        { id: 4, name: "Task4", description: "Regular monitoring for Task4", task_type: "regular" },
        { id: 5, name: "Task5", description: "Regular monitoring for Task5", task_type: "regular" },
        { id: 6, name: "Task6", description: "Regular monitoring for Task6", task_type: "regular" },
        { id: 7, name: "Task7", description: "Regular monitoring for Task7", task_type: "regular" }
      ];
      res.json(allTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Get current DAG settings by team name and entity name
  app.get("/api/dags/current-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { team, name } = req.query;
      
      if (!team || !name) {
        return res.status(400).json({ message: "Missing required parameters: team, name" });
      }
      
      // Find the DAG entity by team name and entity name
      const entities = await storage.getEntities();
      const teams = await storage.getTeams();
      
      const teamObj = teams.find(t => t.name === team);
      if (!teamObj) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      const entity = entities.find(e => e.name === name && e.type === 'dag' && e.teamId === teamObj.id);
      if (!entity) {
        return res.status(404).json({ message: "DAG not found" });
      }
      
      // Return current DAG settings in a standardized format
      const currentSettings = {
        name: entity.name,
        team: teamObj.name,
        ownerEmail: entity.owner || entity.ownerEmail,
        userEmail: entity.user_email,
        description: entity.dag_description || entity.description,
        schedule: entity.dag_schedule,
        expectedRuntime: entity.expected_runtime_minutes,
        donemarkerLocation: entity.donemarker_location,
        donemarkerLookback: entity.donemarker_lookback,
        dagDependency: entity.dag_dependency,
        isActive: entity.status === 'Passed' || entity.status === 'Pending',
        status: entity.status,
        lastUpdated: new Date()
      };
      
      res.json(currentSettings);
    } catch (error) {
      console.error("Error fetching current DAG settings:", error);
      res.status(500).json({ message: "Failed to fetch current DAG settings" });
    }
  });

  // Get current Table settings by team name and entity name
  app.get("/api/tables/current-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { team, name } = req.query;
      
      if (!team || !name) {
        return res.status(400).json({ message: "Missing required parameters: team, name" });
      }
      
      // Find the Table entity by team name and entity name
      const entities = await storage.getEntities();
      const teams = await storage.getTeams();
      
      const teamObj = teams.find(t => t.name === team);
      if (!teamObj) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      const entity = entities.find(e => e.name === name && e.type === 'table' && e.teamId === teamObj.id);
      if (!entity) {
        return res.status(404).json({ message: "Table not found" });
      }
      
      // Return current Table settings in a standardized format
      const currentSettings = {
        name: entity.name,
        team: teamObj.name,
        ownerEmail: entity.owner || entity.ownerEmail,
        userEmail: entity.user_email,
        description: entity.table_description || entity.description,
        schedule: entity.table_schedule,
        expectedRuntime: entity.expected_runtime_minutes,
        donemarkerLocation: entity.donemarker_location,
        donemarkerLookback: entity.donemarker_lookback,
        tableDependency: entity.table_dependency,
        schemaName: entity.schema_name,
        isActive: entity.status === 'Passed' || entity.status === 'Pending',
        status: entity.status,
        lastUpdated: new Date()
      };
      
      res.json(currentSettings);
    } catch (error) {
      console.error("Error fetching current Table settings:", error);
      res.status(500).json({ message: "Failed to fetch current Table settings" });
    }
  });

  // Get history changes for an entity (last 5 changes)
  app.get("/api/entities/:id/history-changes", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const entityId = parseInt(req.params.id);
      if (isNaN(entityId)) {
        return res.status(400).json({ message: "Invalid entity ID" });
      }
      
      // Get entity history from storage
      const history = await storage.getEntityHistory(entityId);
      
      // Transform history into changes format for display
      const changes = history.slice(0, 5).map((record, index) => ({
        id: record.id,
        fieldChanged: 'SLA Compliance',
        oldValue: null,
        newValue: record.slaValue,
        description: `SLA compliance updated to ${record.slaValue}% with ${record.status} status`,
        changedBy: 'System',
        changedAt: record.date,
        entityId: record.entityId
      }));
      
      res.json(changes);
    } catch (error) {
      console.error("Error fetching history changes:", error);
      res.status(500).json({ message: "Failed to fetch history changes" });
    }
  });

  // Get 30-day trends for all entities (independent of global date filter)
  app.get("/api/entities/trends/30-day", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const entities = await storage.getEntities();
      
      // Generate 30-day trend data for each entity
      // In production, this would calculate real trends from the last 30 days of data
      const trends = entities.map(entity => {
        // Use entity ID for consistent demo data
        const seed = entity.id * 7919;
        const rand = () => {
          const x = Math.sin(seed) * 10000;
          return (x - Math.floor(x)) * 4 - 2; // Generate value between -2 and 2
        };
        
        const trendValue = rand();
        
        return {
          entityId: entity.id,
          trend: Number(trendValue.toFixed(1)),
          icon: trendValue > 0.5 ? 'up' : trendValue < -0.5 ? 'down' : 'flat',
          color: trendValue > 0.5 ? 'success' : trendValue < -0.5 ? 'error' : 'warning',
          lastUpdated: new Date().toISOString()
        };
      });
      
      // Generated 30-day trends
      res.json(trends);
    } catch (error) {
      console.error("Error fetching 30-day trends:", error);
      res.status(500).json({ message: "Failed to fetch 30-day trends" });
    }
  });

  // Create notification timeline
  app.post("/api/notification-timelines", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const validatedData = insertNotificationTimelineSchema.parse(req.body);
      const timeline = await storage.createNotificationTimeline(validatedData);
      res.status(201).json(timeline);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Error creating notification timeline:", error);
      res.status(500).json({ message: "Failed to create notification timeline" });
    }
  });

  // Get notification timeline by ID
  app.get("/api/notification-timelines/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const timelineId = req.params.id;
      // Implementation would retrieve timeline by ID from storage
      res.json({ message: "Timeline retrieval not yet implemented" });
    } catch (error) {
      console.error("Error fetching notification timeline:", error);
      res.status(500).json({ message: "Failed to fetch notification timeline" });
    }
  });

  // Update notification timeline
  app.put("/api/notification-timelines/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const timelineId = req.params.id;
      
      // Validate notification timeline update data
      const result = insertNotificationTimelineSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid notification timeline data", 
          errors: result.error.format() 
        });
      }
      
      // Ensure triggers property is properly typed as array if it exists
      const timelineData = { ...result.data } as any;
      if (timelineData.triggers && typeof timelineData.triggers === 'string') {
        timelineData.triggers = [timelineData.triggers];
      }
      const timeline = await storage.updateNotificationTimeline(timelineId, timelineData);
      
      if (!timeline) {
        return res.status(404).json({ message: "Notification timeline not found" });
      }
      
      res.json(timeline);
    } catch (error) {
      console.error("Error updating notification timeline:", error);
      res.status(500).json({ message: "Failed to update notification timeline" });
    }
  });

  // Delete notification timeline
  app.delete("/api/notification-timelines/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const timelineId = req.params.id;
      const deleted = await storage.deleteNotificationTimeline(timelineId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Notification timeline not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting notification timeline:", error);
      res.status(500).json({ message: "Failed to delete notification timeline" });
    }
  });

  // Task API routes
  // Get tasks for a specific DAG
  app.get("/api/dags/:dagId/tasks", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const dagId = parseInt(req.params.dagId);
      if (isNaN(dagId)) {
        return res.status(400).json({ message: "Invalid DAG ID" });
      }

      // For now, return mock data as tasks are not stored in database yet
      // In a real implementation, this would fetch from the database
      const mockTasks = [
        {
          id: 1,
          name: "Task1",
          priority: "normal",
          status: "running",
          dagId: dagId,
          description: "First task in the DAG"
        },
        {
          id: 2,
          name: "Task2", 
          priority: "high",
          status: "completed",
          dagId: dagId,
          description: "Second task in the DAG"
        },
        {
          id: 3,
          name: "Task3",
          priority: "normal",
          status: "pending",
          dagId: dagId,
          description: "Third task in the DAG"
        }
      ];

      res.json(mockTasks);
    } catch (error) {
      console.error("Error fetching DAG tasks:", error);
      res.status(500).json({ message: "Failed to fetch DAG tasks" });
    }
  });

  // Update task priority
  app.patch("/api/tasks/:taskId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId);
      if (isNaN(taskId)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      const { priority } = req.body;
      if (!priority || !["high", "normal"].includes(priority)) {
        return res.status(400).json({ message: "Invalid priority. Must be 'high' or 'normal'" });
      }

      // For now, return updated mock data
      // In a real implementation, this would update the database
      const updatedTask = {
        id: taskId,
        name: `Task${taskId}`,
        priority: priority,
        status: "running",
        description: `Updated task ${taskId} priority to ${priority}`,
        updatedAt: new Date().toISOString()
      };

      // Task priority updated
      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task priority:", error);
      res.status(500).json({ message: "Failed to update task priority" });
    }
  });

  // ============================================
  // ADMIN TENANT MANAGEMENT ENDPOINTS
  // ============================================
  
  // Get all tenants for admin (with caching)
  app.get("/api/admin/tenants", async (req, res) => {
    try {
      const cacheKey = 'admin_tenants';
      let tenants = await redisCache.get(cacheKey);
      
      if (!tenants) {
        tenants = await storage.getTenants();
        await redisCache.set(cacheKey, tenants, 6 * 60 * 60); // 6 hour cache
      }

      res.json(tenants);
    } catch (error) {
      console.error('Admin tenants fetch error:', error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  // Create new tenant with optimistic update support
  app.post("/api/admin/tenants", async (req, res) => {
    try {
      const tenantSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      });
      
      const result = tenantSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid tenant data", 
          errors: result.error.format() 
        });
      }
      
      const tenantData = result.data;
      
      // Create tenant
      const newTenant = await storage.createTenant(tenantData);
      
      // Invalidate all tenant-related caches (same pattern as team updates)
      await redisCache.invalidateCache({
        keys: [
          'admin_tenants',           // Admin tenant list
          'all_tenants',             // Main app tenant list  
          `tenant_${newTenant.id}`,  // Individual tenant cache
        ],
        patterns: [
          'team_*',      // Teams that might reference this tenant
          'dashboard_*', // Dashboard data that uses tenant filters
          'summary_*'    // Dashboard summary with tenant filters
        ]
      });

      res.status(201).json(newTenant);
    } catch (error) {
      console.error('Tenant creation error:', error);
      res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  // Update tenant with optimistic update support
  app.put("/api/admin/tenants/:id", async (req, res) => {
    try {
      const tenantId = parseInt(req.params.id);
      if (isNaN(tenantId)) {
        return res.status(400).json({ message: "Invalid tenant ID" });
      }

      const tenantSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      });
      
      const result = tenantSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid tenant data", 
          errors: result.error.format() 
        });
      }
      
      const tenantData = result.data;
      
      // Update tenant
      const updatedTenant = await storage.updateTenant(tenantId, tenantData);
      
      if (!updatedTenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      // Invalidate all tenant-related caches
      await redisCache.invalidateCache({
        keys: [
          'admin_tenants',           // Admin tenant list
          'all_tenants',             // Main app tenant list  
          `tenant_${tenantId}`,      // Individual tenant cache
        ],
        patterns: [
          'team_*',      // Teams that might reference this tenant
          'dashboard_*'  // Dashboard data that uses tenant filters
        ]
      });

      res.json(updatedTenant);
    } catch (error) {
      console.error('Tenant update error:', error);
      res.status(500).json({ message: "Failed to update tenant" });
    }
  });
  
  // ============================================
  // ADMIN TEAM MANAGEMENT ENDPOINTS
  // ============================================
  
  // Create new team from admin panel with comprehensive cache invalidation
  app.post("/api/admin/teams", async (req, res) => {
    try {
      const result = insertTeamSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid team data", errors: result.error.format() });
      }
      
      const team = await storage.createTeam(result.data);
      
      // Invalidate all team-related caches using correct main cache keys
      await redisCache.invalidateCache({
        keys: [
          `team_${team.id}`,         // Individual team cache
          `team_details_${team.name}`, // Team details cache
          `team_members_${team.name}`  // Team members cache
        ],
        patterns: [
          'team_*',      // All team-related cache keys
          'dashboard_*', // Dashboard data that uses team filters
          'summary_*'    // Dashboard summary with team filters
        ],
        mainCacheKeys: ['TEAMS'], // This invalidates CACHE_KEYS.TEAMS used by getAllTeams()
        refreshAffectedData: true
      });
      
      res.status(201).json(team);
    } catch (error) {
      console.error('Admin team creation error:', error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });
  
  // ============================================
  // ADMIN USER MANAGEMENT ENDPOINTS
  // ============================================
  
  // Get all users for admin panel
  app.get("/api/admin/users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      
      // Debug: Log actual user count
      console.log(`DEBUG: storage.getUsers() returned ${users.length} users`);
      console.log(`DEBUG: First few usernames:`, users.slice(0, 5).map(u => u.username));
      
      // Transform to admin format expected by frontend
      const adminUsers = users.map(user => ({
        user_id: user.id,
        user_name: user.username,
        user_email: user.email || '',
        user_slack: user.user_slack || null,
        user_pagerduty: user.user_pagerduty || null,
        is_active: user.is_active ?? true
      }));

      console.log(`DEBUG: Returning ${adminUsers.length} admin users to frontend`);
      res.json(adminUsers);
    } catch (error) {
      console.error('Admin users fetch error:', error);
      res.status(500).json(createErrorResponse("Failed to fetch users"));
    }
  });

  // Create new user from admin panel
  app.post("/api/admin/users", async (req, res) => {
    try {
      const result = adminUserSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json(createValidationErrorResponse(result.error, "Invalid user data"));
      }
      
      const adminUserData = result.data;
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(adminUserData.user_name);
      if (existingUser) {
        return res.status(409).json(createErrorResponse("Username already exists", "duplicate_username"));
      }
      
      // Transform admin format to storage format
      const userData = {
        username: adminUserData.user_name,
        password: "default-password", // Default password that admin can change
        email: adminUserData.user_email,
        displayName: adminUserData.user_name,
        user_slack: adminUserData.user_slack || null,
        user_pagerduty: adminUserData.user_pagerduty || null,
        is_active: adminUserData.is_active ?? true,
        role: "user" as const
      };
      
      const user = await storage.createUser(userData);
      
      // Invalidate user-related caches
      await redisCache.invalidateUserData();
      
      // Transform response to admin format
      const adminUser = {
        user_id: user.id,
        user_name: user.username,
        user_email: user.email || '',
        user_slack: user.user_slack || null,
        user_pagerduty: user.user_pagerduty || null,
        is_active: user.is_active ?? true
      };
      
      res.status(201).json(adminUser);
    } catch (error) {
      console.error('Admin user creation error:', error);
      res.status(500).json(createErrorResponse("Failed to create user"));
    }
  });

  // Update existing user from admin panel
  app.put("/api/admin/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json(createErrorResponse("Invalid user ID", "invalid_parameter"));
      }

      const result = adminUserSchema.partial().safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json(createValidationErrorResponse(result.error, "Invalid user data"));
      }
      
      const adminUserData = result.data;
      
      // Check if user exists
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json(createErrorResponse("User not found", "user_not_found"));
      }
      
      // Check if username is being changed and conflicts
      if (adminUserData.user_name && adminUserData.user_name !== existingUser.username) {
        const userWithSameName = await storage.getUserByUsername(adminUserData.user_name);
        if (userWithSameName) {
          return res.status(409).json(createErrorResponse("Username already exists", "duplicate_username"));
        }
      }
      
      // Transform admin format to storage format
      const updateData: any = {};
      if (adminUserData.user_name) updateData.username = adminUserData.user_name;
      if (adminUserData.user_email) updateData.email = adminUserData.user_email;
      if (adminUserData.user_slack !== undefined) updateData.user_slack = adminUserData.user_slack;
      if (adminUserData.user_pagerduty !== undefined) updateData.user_pagerduty = adminUserData.user_pagerduty;
      if (adminUserData.is_active !== undefined) updateData.is_active = adminUserData.is_active;
      
      // Note: Since storage doesn't have updateUser method, we'll simulate it for now
      // In a real implementation, you'd add updateUser to the storage interface
      const updatedUser = {
        ...existingUser,
        ...updateData
      };
      
      // Invalidate user-related caches
      await redisCache.invalidateUserData();
      
      // Transform response to admin format
      const adminUser = {
        user_id: updatedUser.id,
        user_name: updatedUser.username,
        user_email: updatedUser.email || '',
        user_slack: updatedUser.user_slack || null,
        user_pagerduty: updatedUser.user_pagerduty || null,
        is_active: updatedUser.is_active ?? true
      };
      
      res.json(adminUser);
    } catch (error) {
      console.error('Admin user update error:', error);
      res.status(500).json(createErrorResponse("Failed to update user"));
    }
  });
  
  // Dashboard summary endpoint
  app.get("/api/dashboard/summary", async (req, res) => {
    try {
      let entities = await storage.getEntities();
      
      // Filter by tenant if tenant parameter is provided
      if (req.query.tenant) {
        const tenantName = req.query.tenant as string;
        entities = entities.filter(entity => entity.tenant_name === tenantName);
      }
      
      // Calculate metrics
      const tables = entities.filter(e => e.type === 'table');
      const dags = entities.filter(e => e.type === 'dag');
      
      const calcAvgSla = (items: typeof entities) => {
        if (items.length === 0) return 0;
        const sum = items.reduce((acc, item) => acc + (item.currentSla || 0), 0);
        return parseFloat((sum / items.length).toFixed(1));
      };
      
      const overallSla = calcAvgSla(entities);
      const tablesSla = calcAvgSla(tables);
      const dagsSla = calcAvgSla(dags);
      
      // Return summary data
      res.json({
        metrics: {
          overallCompliance: overallSla,
          tablesCompliance: tablesSla,
          dagsCompliance: dagsSla,
          entitiesCount: entities.length,
          tablesCount: tables.length,
          dagsCount: dags.length
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard summary" });
    }
  });
  
  // Get all DAGs endpoint
  app.get("/api/dags", async (req, res) => {
    try {
      const dags = await storage.getEntitiesByType('dag');
      res.json(dags);
    } catch (error) {
      console.error("Error fetching DAGs:", error);
      res.status(500).json({ message: "Failed to fetch DAGs" });
    }
  });

  // Get all Tables endpoint
  app.get("/api/tables", async (req, res) => {
    try {
      const tables = await storage.getEntitiesByType('table');
      res.json(tables);
    } catch (error) {
      console.error("Error fetching Tables:", error);
      res.status(500).json({ message: "Failed to fetch Tables" });
    }
  });
  
  // DEVELOPMENT ONLY - Create a test user
  // This would typically be handled by Azure AD in a production environment
  app.get("/api/dev/create-test-user", async (req, res) => {
    try {
      // Check if the test user already exists
      const existingUser = await storage.getUserByUsername("azure_test_user");
      
      if (existingUser) {
        return res.json({ 
          message: "Test user already exists", 
          credentials: { 
            username: "azure_test_user", 
            password: "Azure123!" 
          } 
        });
      }
      
      // Hash the password (use the one from auth.ts so password format is consistent)
      
      // Create a test user (with plain text password for testing purposes)
      const testUser = {
        username: "azure_test_user",
        password: "Azure123!",
        email: "test@example.com",
        displayName: "Azure Test User",
        team: "Data Engineering"
      };
      
      await storage.createUser(testUser);
      
      res.json({ 
        message: "Test user created successfully", 
        credentials: { 
          username: testUser.username, 
          password: "Azure123!" // Return the non-hashed password for testing
        } 
      });
    } catch (error) {
      console.error("Failed to create test user:", error);
      res.status(500).json({ message: "Failed to create test user" });
    }
  });
  
  // TEST ONLY - Check if test user exists (for debugging)
  app.get("/api/test/user-check", async (req, res) => {
    try {
      const user = await storage.getUserByUsername("azure_test_user");
      if (user) {
        // For debugging, we'll actually show the password hash
        // Test user found
        res.status(200).json({
          message: "Test user exists",
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            team: user.team,
            passwordHash: user.password  // For debugging only
          },
          credentials: {
            username: "azure_test_user",
            password: "Azure123!"
          }
        });
      } else {
        res.status(404).json({ message: "Test user not found" });
      }
    } catch (error) {
      console.error("Error checking test user:", error);
      res.status(500).json({ message: "Error checking test user" });
    }
  });
  
  // TEST ONLY - Reset test user with direct hash
  app.get("/api/test/reset-user", async (req, res) => {
    try {
      // First try to find and delete the existing user
      const existingUser = await storage.getUserByUsername("azure_test_user");
      if (existingUser) {
        // If we had a deleteUser method, we'd use it here
        // Found existing user
      }
      
      // Create a new test user with plain text password for testing
      const testUser = {
        username: "azure_test_user",
        password: "Azure123!",
        email: "test@example.com",
        displayName: "Azure Test User",
        team: "Data Engineering"
      };
      
      const user = await storage.createUser(testUser);
      // Created test user
      
      res.status(200).json({
        message: "Test user created/reset successfully",
        credentials: {
          username: "azure_test_user",
          password: "Azure123!"
        }
      });
    } catch (error) {
      console.error("Error resetting test user:", error);
      res.status(500).json({ message: "Error resetting test user" });
    }
  });

  // Cache management endpoints
  app.post('/api/cache/incremental-update', async (req: Request, res: Response) => {
    try {
      const { entityName, entityType, teamName, tenantName, ...updates } = req.body;
      
      // Validate required fields
      if (!entityName || !entityType || !teamName) {
        return res.status(400).json({ 
          message: 'Missing required fields: entityName, entityType, teamName' 
        });
      }

      // Update cache incrementally
      const success = await redisCache.updateEntity(entityName, entityType, teamName, updates);
      
      if (success) {
        res.json({ 
          success: true, 
          message: `Entity ${entityName} updated successfully`,
          entityName,
          entityType,
          teamName,
          tenantName
        });
      } else {
        res.status(404).json({ 
          message: `Entity ${entityName} (${entityType}) not found in team ${teamName}` 
        });
      }
    } catch (error) {
      console.error('Cache incremental update error:', error);
      res.status(500).json({ message: 'Failed to update cache' });
    }
  });

  app.get('/api/cache/recent-changes', async (req: Request, res: Response) => {
    try {
      const { tenantName, teamName } = req.query;
      
      const recentChanges = await redisCache.getRecentChanges(
        tenantName as string, 
        teamName as string
      );
      
      res.json({
        changes: recentChanges,
        count: recentChanges.length
      });
    } catch (error) {
      console.error('Recent changes error:', error);
      res.status(500).json({ message: 'Failed to fetch recent changes' });
    }
  });

  // Owner and SLA settings endpoint for entity details modal
  app.get('/api/teams/:teamName/:entityType/:entityName/owner_sla_settings', async (req: Request, res: Response) => {
    try {
      const { teamName, entityType, entityName } = req.params;
      
      // Get all entities from cache
      const entities = await redisCache.getAllEntities();
      
      // Find the specific entity
      const entity = entities.find(e => 
        e.name === entityName && 
        e.type === entityType &&
        e.team_name === teamName
      );
      
      if (!entity) {
        return res.status(404).json({ message: 'Entity not found' });
      }
      
      // Return owner and SLA settings data
      res.json({
        owner: entity.owner || 'Unknown Owner',
        ownerEmail: entity.ownerEmail || entity.owner_email || 'owner@company.com',
        userEmail: 'user@company.com',
        entityName: entity.name,
        team: teamName,
        description: entity.description || `${entity.type} entity for data processing`,
        schedule: entity.dag_schedule || entity.table_schedule || '0 2 * * *',
        expectedRuntime: entity.expected_runtime_minutes || 45,
        donemarkerLocation: entity.donemarker_location || `s3://analytics-${entity.type}s/${entity.name}/`,
        donemarkerLookback: entity.donemarker_lookback || 2,
        dependency: entity.dag_dependency || entity.table_dependency || 'upstream_dependencies',
        isActive: entity.is_active !== undefined ? entity.is_active : true,
        ...(entity.type === 'dag' && { serverName: 'airflow-prod-01' }),
      });
    } catch (error) {
      console.error('Owner SLA settings error:', error);
      res.status(500).json({ message: 'Failed to fetch owner and SLA settings' });
    }
  });

  // SLA status 30 days endpoint for entity details modal
  app.get('/api/teams/:teamName/:entityType/:entityName/sla_status_30days', async (req: Request, res: Response) => {
    try {
      const { teamName, entityType, entityName } = req.params;
      
      // Generate mock 30-day SLA status data
      const days = [];
      const today = new Date();
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        
        // Generate realistic SLA data with some variation
        const baseSla = 85 + Math.random() * 15; // Between 85-100%
        const status = baseSla >= 95 ? 'Passed' : baseSla >= 85 ? 'Warning' : 'Failed';
        
        days.push({
          date: date.toISOString().split('T')[0],
          sla: parseFloat(baseSla.toFixed(1)),
          status: status
        });
      }
      
      res.json({ days });
    } catch (error) {
      console.error('SLA status 30 days error:', error);
      res.status(500).json({ message: 'Failed to fetch SLA status data' });
    }
  });

  // Settings changes endpoint for entity details modal
  app.get('/api/teams/:teamName/:entityType/:entityName/settings_changes', async (req: Request, res: Response) => {
    try {
      const { teamName, entityType, entityName } = req.params;
      
      // Generate mock settings changes data
      const changes = [
        {
          id: 1,
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          user: 'john.doe@company.com',
          field: 'SLA Target',
          oldValue: '90%',
          newValue: '95%',
          reason: 'Updated to align with new business requirements'
        },
        {
          id: 2,
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          user: 'jane.smith@company.com',
          field: 'Owner',
          oldValue: 'legacy.owner@company.com',
          newValue: 'new.owner@company.com',
          reason: 'Team restructuring - ownership transfer'
        },
        {
          id: 3,
          timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          user: 'admin@company.com',
          field: 'Schedule',
          oldValue: '0 1 * * *',
          newValue: '0 2 * * *',
          reason: 'Adjusted runtime to avoid peak hours'
        }
      ];
      
      res.json({ changes });
    } catch (error) {
      console.error('Settings changes error:', error);
      res.status(500).json({ message: 'Failed to fetch settings changes' });
    }
  });

  // Secured rollback endpoint for entity details modal
  app.post('/api/teams/:teamName/:entityType/:entityName/rollback', 
    async (req: Request, res: Response) => {
    
    const requestStartTime = Date.now();
    const requestId = req.requestId || 'unknown';
    
    try {
      const { teamName, entityType, entityName } = req.params;
      
      // Extract session_id for FastAPI authorization
      const sessionId = req.headers['x-session-id'] as string;
      
      if (!sessionId) {
        logAuthenticationEvent("rollback-access-denied", "anonymous", undefined, req.requestId, false);
        return res.status(401).json({ 
          message: "Session ID required for rollback authorization",
          type: 'authentication_error' 
        });
      }
      
      // Delegate authorization to FastAPI
      const authResult = await authorizeRollbackWithFastAPI(sessionId, teamName, entityType, entityName);
      
      if (!authResult.authorized) {
        logAuthenticationEvent("rollback-access-denied", "unknown", undefined, req.requestId, false);
        return res.status(authResult.error === 'Invalid or expired session' ? 401 : 403).json({
          message: authResult.error || "Access denied",
          type: authResult.error === 'Invalid or expired session' ? 'authentication_error' : 'authorization_error'
        });
      }
      
      // Get the entity for the rollback operation
      const entities = await redisCache.getAllEntities();
      const entity = entities.find(e => 
        e.name === entityName && 
        e.type === entityType &&
        e.team_name === teamName
      );
      
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      // Create authorization context from FastAPI user data
      const fastApiUser = authResult.user;
      const authContext = {
        userEmail: fastApiUser?.email || 'unknown',
        userRole: fastApiUser?.roles?.[0] || 'user',
        userId: fastApiUser?.user_id || null,
        sessionId: sessionId,
        entity
      };
      
      // Validate request payload with Zod
      const validationResult = rollbackRequestSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const validationError = createValidationErrorResponse(
          validationResult.error, 
          "Invalid rollback request data"
        );
        
        // Log validation failure
        structuredLogger.warn(
          `rollback-validation-failed for ${entityName} (${entityType}) in team ${teamName}`,
          {
            session_id: authContext.sessionId,
            user_id: authContext.userId,
            email: authContext.userEmail,
            session_type: 'client_credentials',
            roles: authContext.userRole,
            notification_id: null
          },
          requestId
        );
        console.log('Rollback validation errors:', JSON.stringify(validationResult.error.format()));
        
        return res.status(400).json(validationError);
      }
      
      const { toVersion, user_email, reason } = validationResult.data;
      
      // Additional security: Verify user_email matches authenticated user
      if (user_email !== authContext.userEmail && authContext.userRole !== 'admin') {
        // Log security violation
        structuredLogger.error(
          `rollback-security-violation: email mismatch for ${entityName} (${entityType}) in team ${teamName}`,
          {
            session_id: authContext.sessionId,
            user_id: authContext.userId,
            email: authContext.userEmail,
            session_type: 'client_credentials',
            roles: authContext.userRole,
            notification_id: null
          },
          requestId
        );
        console.log('Security violation details:', { attempted_user_email: user_email, actual_user_email: authContext.userEmail });
        
        return res.status(403).json({ 
          message: "Security violation: User email mismatch",
          type: 'security_error'
        });
      }
      
      // Log successful authorization and start of rollback
      structuredLogger.info(
        `rollback-initiated for ${entityName} (${entityType}) in team ${teamName} to version ${toVersion}`,
        {
          session_id: authContext.sessionId,
          user_id: authContext.userId,
          email: authContext.userEmail,
          session_type: 'client_credentials',
          roles: authContext.userRole,
          notification_id: null
        },
        requestId
      );
      console.log('Rollback authorization details:', {
        entity_id: entity.id.toString(),
        user_role: authContext.userRole,
        session_id: authContext.sessionId,
        authorized_by_fastapi: true
      });
      
      // Broadcast rollback event using the existing pattern
      await redisCache.broadcastEntityRollback({
        entityId: entity.id.toString(),
        entityName: entity.name,
        entityType: entity.type,
        teamName: teamName,
        tenantName: entity.tenant_name || 'Unknown',
        toVersion: toVersion,
        userEmail: authContext.userEmail,
        reason: reason || `Rollback to version ${toVersion}`,
        originUserId: authContext.userEmail
      });
      
      const responseData = {
        success: true,
        message: `Successfully initiated rollback for ${entityName} to version ${toVersion}`,
        entityName,
        entityType,
        teamName,
        toVersion,
        timestamp: new Date().toISOString(),
        requestId,
        authorizedBy: authContext.userEmail,
        authorizationLevel: authContext.userRole
      };
      
      // Log successful completion
      const duration = Date.now() - requestStartTime;
      structuredLogger.info(
        `rollback-completed for ${entityName} (${entityType}) in team ${teamName} to version ${toVersion} in ${duration}ms`,
        {
          session_id: authContext.sessionId,
          user_id: authContext.userId,
          email: authContext.userEmail,
          session_type: 'client_credentials',
          roles: authContext.userRole,
          notification_id: null
        },
        requestId
      );
      
      res.json(responseData);
      
    } catch (error) {
      const duration = Date.now() - requestStartTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Extract route params for error logging
      const { teamName, entityType, entityName } = req.params;
      
      // Log error with context 
      const sessionId = req.headers['x-session-id'] as string || 'unknown';
      structuredLogger.error(
        `rollback-error for ${entityName || 'unknown'} (${entityType || 'unknown'}) in team ${teamName || 'unknown'}: ${errorMessage}`,
        {
          session_id: sessionId,
          user_id: null,
          email: 'unknown',
          session_type: 'client_credentials',
          roles: 'unknown',
          notification_id: null
        },
        requestId
      );
      console.log('Rollback error details:', { duration_ms: duration, errorMessage, stack: error instanceof Error ? error.stack : undefined });
      
      console.error('Secured rollback endpoint error:', error);
      res.status(500).json(createErrorResponse(
        'Failed to process rollback request',
        'rollback_error',
        { requestId, timestamp: new Date().toISOString() }
      ));
    }
  });



  const httpServer = createServer(app);

  // Setup WebSocket server with authentication and subscriptions
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track authenticated connections with heartbeat monitoring
  const authenticatedSockets: Map<WebSocket, {
    sessionId: string;
    userId: string;
    subscriptions: Set<string>; // tenant:team format
    lastPong: number; // Last pong response timestamp
    isAlive: boolean; // Heartbeat status
  }> = new Map();

  // Heartbeat configuration
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds
  const IDLE_TIMEOUT = 60000; // 60 seconds
  const CLEANUP_INTERVAL = 10000; // 10 seconds

  wss.on('connection', (ws, req) => {
    let socketData: { sessionId: string; userId: string; subscriptions: Set<string>; lastPong: number; isAlive: boolean } | null = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle authentication
        if (data.type === 'authenticate') {
          const { sessionId } = data;
          if (!sessionId) {
            ws.send(JSON.stringify({ type: 'auth-error', message: 'Session ID required' }));
            ws.close(4001, 'Authentication failed');
            return;
          }

          // Validate session ID (basic validation for now)
          // In production, validate against session store
          socketData = {
            sessionId,
            userId: data.userId || 'anonymous',
            subscriptions: new Set(),
            lastPong: Date.now(),
            isAlive: true
          };
          
          authenticatedSockets.set(ws, socketData);
          ws.send(JSON.stringify({ type: 'auth-success', message: 'Authenticated' }));
          return;
        }

        // Require authentication for all other operations
        if (!socketData) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }

        // Handle subscription management
        if (data.type === 'subscribe') {
          const { tenantName, teamName } = data;
          if (tenantName && teamName) {
            const subscriptionKey = `${tenantName}:${teamName}`;
            socketData.subscriptions.add(subscriptionKey);
            ws.send(JSON.stringify({ 
              type: 'subscribed', 
              tenantName, 
              teamName,
              message: `Subscribed to ${subscriptionKey}` 
            }));
          }
          return;
        }

        if (data.type === 'unsubscribe') {
          const { tenantName, teamName } = data;
          if (tenantName && teamName) {
            const subscriptionKey = `${tenantName}:${teamName}`;
            socketData.subscriptions.delete(subscriptionKey);
            ws.send(JSON.stringify({ 
              type: 'unsubscribed', 
              tenantName, 
              teamName,
              message: `Unsubscribed from ${subscriptionKey}` 
            }));
          }
          return;
        }

        // Handle ping/pong with heartbeat tracking
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          return;
        }

        if (data.type === 'pong') {
          // Update heartbeat status
          if (socketData) {
            socketData.lastPong = Date.now();
            socketData.isAlive = true;
          }
          return;
        }

      } catch (error) {
        console.error('WebSocket message parse error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
    
    ws.on('close', () => {
      // Remove from authenticated sockets
      authenticatedSockets.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      authenticatedSockets.delete(ws);
    });

    // Send authentication request
    ws.send(JSON.stringify({ 
      type: 'auth-required', 
      message: 'Please authenticate with session ID' 
    }));
  });

  // Setup heartbeat system
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    
    wss.clients.forEach((ws) => {
      const socketData = authenticatedSockets.get(ws);
      
      if (socketData) {
        // Check if client is stuck (no pong response within timeout)
        if (now - socketData.lastPong > IDLE_TIMEOUT) {
          console.log(`Terminating idle client: ${socketData.userId}`);
          ws.terminate();
          authenticatedSockets.delete(ws);
          return;
        }
        
        // Send heartbeat ping
        if (ws.readyState === WebSocket.OPEN) {
          socketData.isAlive = false;
          ws.send(JSON.stringify({ 
            type: 'heartbeat-ping', 
            timestamp: new Date().toISOString() 
          }));
        }
      }
    });
  }, HEARTBEAT_INTERVAL);

  // Cleanup interval for connection health monitoring
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const stuckClients: WebSocket[] = [];
    
    authenticatedSockets.forEach((socketData, ws) => {
      // Mark clients as stuck if they haven't responded to heartbeat
      if (!socketData.isAlive && now - socketData.lastPong > IDLE_TIMEOUT) {
        stuckClients.push(ws);
      }
    });
    
    // Remove stuck clients
    stuckClients.forEach(ws => {
      const socketData = authenticatedSockets.get(ws);
      console.log(`Removing stuck client: ${socketData?.userId || 'unknown'}`);
      ws.terminate();
      authenticatedSockets.delete(ws);
    });
    
    if (stuckClients.length > 0) {
      console.log(`Cleaned up ${stuckClients.length} stuck WebSocket connections`);
    }
  }, CLEANUP_INTERVAL);

  // Cleanup intervals on server shutdown
  process.on('SIGTERM', () => {
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
  });

  process.on('SIGINT', () => {
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
  });

  // Connect WebSocket to cache system with authenticated sockets
  redisCache.setupWebSocket(wss, authenticatedSockets as any);

  return httpServer;
}
