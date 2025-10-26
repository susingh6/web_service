import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { redisCache, CACHE_KEYS } from "./redis-cache";
import { insertEntitySchema, insertTeamSchema, updateTeamSchema, insertEntityHistorySchema, insertIssueSchema, insertUserSchema, insertNotificationTimelineSchema, insertEntitySubscriptionSchema, adminUserSchema, Entity, InsertNotificationTimeline } from "@shared/schema";
import { z } from "zod";
import { SocketData } from "@shared/websocket-config";
import { logAuthenticationEvent, structuredLogger } from "./middleware/structured-logging";
import { requireActiveUser, checkActiveUserDev } from "./middleware/check-active-user";
import { WEBSOCKET_CONFIG } from "@shared/websocket-config";

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

// Helper function to generate optimistic IDs for client-side optimistic updates
// Combination of timestamp + random for uniqueness across multiple admins
const generateOptimisticId = (): number => {
  return -(Date.now() * 10000 + Math.floor(Math.random() * 10000));
};

// Helper function to create audit log entries for rollback operations
function createRollbackAuditLog(event: string, req: Request, additionalData?: any) {
  return {
    event,
    session_id: req.sessionID || 'unknown',
    notification_id: null,
    user_id: req.user?.id || null,
    email: req.user?.email || req.user?.username || 'unknown',
    session_type: 'local',
    roles: (req.user as any)?.role || 'admin',
    request_id: req.requestId || 'unknown',
    logger: 'app.rollback.security',
    level: 'info' as const,
    timestamp: new Date().toISOString(),
    ...additionalData
  };
}
import { setupSimpleAuth, authorizeRollbackWithFastAPI } from "./simple-auth";
import { createErrorResponse, createValidationErrorResponse, sendError } from './utils/http';
import { setupTestRoutes } from "./test-routes";

// Structured error helpers moved to ./utils/http

// (sendError provided by ./utils/http)

// Sanitize incoming entity payloads for conflict/original payload storage and logging
function sanitizeEntityPayloadForConflict(raw: any): any {
  try {
    const p = raw || {};
    const entityType = ((p as any).entity_type || (p as any).type) === 'table' ? 'table' : 'dag';
    const isOwner = p.is_entity_owner === false ? false : true;
    const parseStringOrList = (val: any): string[] | null => {
      if (val === undefined || val === null) return null;
      if (Array.isArray(val)) {
        const out = val.map((x) => String(x).trim()).filter((s) => s.length > 0);
        return out.length > 0 ? out : null;
      }
      const s = String(val).trim();
      if (!s) return null;
      if (s.includes(',')) {
        const out = s.split(',').map((x) => x.trim()).filter((t) => t.length > 0);
        return out.length > 0 ? out : null;
      }
      return [s];
    };
    const parseIntOrList = (val: any): number | number[] | null => {
      if (val === undefined || val === null || val === '') return null;
      if (Array.isArray(val)) {
        const nums = val.map((x) => parseInt(String(x), 10)).filter((n) => !isNaN(n));
        return nums.length > 1 ? nums : (nums[0] ?? null);
      }
      const s = String(val).trim();
      if (s.includes(',')) {
        const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n));
        return nums.length > 1 ? nums : (nums[0] ?? null);
      }
      const n = parseInt(s, 10);
      return isNaN(n) ? null : n;
    };

    const base: any = {
      entity_type: entityType,
      tenant_name: p.tenant_name ?? null,
      team_name: p.team_name ?? null,
      entity_name: p.entity_name ?? null,
      is_active: (typeof p.is_active === 'boolean') ? p.is_active : true,
      is_entity_owner: isOwner,
      expected_runtime_minutes: p.expected_runtime_minutes ?? null,
      donemarker_lookback: parseIntOrList(p.donemarker_lookback),
      server_name: p.server_name ?? null,
      owner_email: p.owner_email ?? p.action_by_user_email ?? p.user_email ?? null,
      action_by_user_email: p.action_by_user_email ?? p.user_email ?? null,
    };

    if (entityType === 'dag') {
      base.dag_name = isOwner ? (p.dag_name ?? p.entity_display_name ?? p.name ?? p.entity_name ?? null) : null;
      base.dag_schedule = isOwner ? (p.dag_schedule ?? p.entity_schedule ?? null) : null;
      base.dag_description = isOwner ? (p.dag_description ?? null) : null;
      base.dag_dependency = isOwner ? parseStringOrList(p.dag_dependency) : null;
      // Use prefixed field for ownership payloads; fall back to common if provided, normalize to string[]
      base.dag_donemarker_location = isOwner ? (parseStringOrList(p.dag_donemarker_location ?? p.donemarker_location) ) : null;
      base.owner_entity_ref_name = isOwner ? null : (p.owner_entity_ref_name ?? p.owner_entity_reference ?? null);
    } else {
      base.schema_name = isOwner ? (p.schema_name ?? null) : null;
      base.table_name = isOwner ? (p.table_name ?? p.entity_display_name ?? p.name ?? p.entity_name ?? null) : null;
      base.table_schedule = isOwner ? (p.table_schedule ?? p.entity_schedule ?? null) : null;
      base.table_description = isOwner ? (p.table_description ?? null) : null;
      base.table_dependency = isOwner ? parseStringOrList(p.table_dependency) : null;
      base.table_donemarker_location = isOwner ? (parseStringOrList(p.table_donemarker_location ?? p.donemarker_location)) : null;
      base.owner_entity_ref_name = isOwner ? null : (p.owner_entity_ref_name ?? p.owner_entity_reference ?? null);
    }

    Object.keys(base).forEach((k) => { if (base[k] === undefined) delete base[k]; });
    return base;
  } catch {
    return raw;
  }
}

// Lightweight API validation schema for entity creation (name-based; IDs resolved server-side)
const apiEntitySchema = z.union([
  z.object({
    entity_type: z.literal('dag'),
    tenant_name: z.string().min(1),
    team_name: z.string().min(1),
    entity_name: z.string().min(1),
    entity_display_name: z.string().optional(),
    dag_name: z.string().optional(),
    dag_schedule: z.string().nullable().optional(),
    is_entity_owner: z.boolean().optional(),
    expected_runtime_minutes: z.number().int().nonnegative().nullable().optional(),
    server_name: z.string().nullable().optional(),
    owner_entity_reference: z.string().optional(),
    owner_email: z.union([z.string().email(), z.array(z.string().email())]).nullable().optional(),
    user_email: z.string().email().nullable().optional(),
  }),
  z.object({
    entity_type: z.literal('table'),
    tenant_name: z.string().min(1),
    team_name: z.string().min(1),
    entity_name: z.string().min(1),
    entity_display_name: z.string().optional(),
    schema_name: z.string().nullable().optional(),
    table_name: z.string().optional(),
    table_schedule: z.string().nullable().optional(),
    is_entity_owner: z.boolean().optional(),
    expected_runtime_minutes: z.number().int().nonnegative().nullable().optional(),
    server_name: z.string().nullable().optional(),
    owner_entity_reference: z.string().optional(),
    owner_email: z.union([z.string().email(), z.array(z.string().email())]).nullable().optional(),
    user_email: z.string().email().nullable().optional(),
  })
]);

// Helper function for rollback cache invalidation using existing patterns
async function invalidateRollbackCaches(rolledBackEntity: Entity) {
  const { team_name, tenant_name, type, is_active, is_entity_owner } = rolledBackEntity;
  
  // ALWAYS invalidate team caches - entity reappears in team dashboard regardless of status
  if (team_name) {
    // Use existing team cache invalidation patterns
    await redisCache.invalidateTeamData(team_name);
    
    if (tenant_name) {
      await redisCache.invalidateTeamMetricsCache(tenant_name, team_name);
    }
  }
  
  // Always invalidate team-specific entity caches using existing patterns
  await redisCache.invalidateCache({
    keys: [
      `team_${rolledBackEntity.teamId}_entities`,
      `entity_${rolledBackEntity.id}`,
    ],
    patterns: [
      'entities_*',
      'team_entities:*',
      'team_details:*',
      'team_metrics:*',
      'team_trends:*'
    ],
    mainCacheKeys: ['ENTITIES', 'TEAMS'],
    refreshAffectedData: true
  });
  
  // CONDITIONALLY invalidate summary dashboard caches only if (is_active && is_entity_owner)
  // Business rule: Summary dashboard only shows active entities owned by the team
  if (is_active && is_entity_owner) {
    console.log(`🔄 Rollback: Invalidating summary caches for active entity owner: ${rolledBackEntity.name}`);
    
    await redisCache.invalidateCache({
      keys: [
        'dashboard_summary',
        'dashboardSummary',
      ],
      patterns: [
        'dashboard_*',
        'summary_*',
        'dashboardSummary:*'
      ],
      mainCacheKeys: ['METRICS'],
      refreshAffectedData: true
    });
  } else {
    console.log(`🔄 Rollback: Skipping summary cache invalidation for entity ${rolledBackEntity.name} (is_active=${is_active}, is_entity_owner=${is_entity_owner})`);
  }
  
  console.log(`✅ Rollback cache invalidation completed for ${type} entity: ${rolledBackEntity.name}`);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up simplified authentication (no password hashing)
  setupSimpleAuth(app);
  
  // Set up test routes for development
  setupTestRoutes(app);
  
  // Health check endpoint - returns 503 when FastAPI integration is disabled
  app.get("/api/v1/health", (_req: Request, res: Response) => {
    const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
    if (USE_FASTAPI) {
      // When enabled, this would proxy to FastAPI
      return res.status(200).json({ status: 'ok', service: 'fastapi' });
    }
    // FastAPI integration disabled - return 503 so client knows to use Express fallback
    return res.status(503).json({ status: 'unavailable', service: 'fastapi', fallback: 'express' });
  });
  
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
        structuredLogger.info('EXPRESS_FASTAPI_FALLBACK_DEV', undefined, req.requestId, {
          session_id: req.sessionContext?.session_id || 'anonymous',
          status_code: 200,
          logger: 'app.express.server'
        });
        return next();
      } else {
        // In production: Block all FastAPI fallback routes to prevent RBAC bypass
        structuredLogger.warn('BLOCKED_FASTAPI_FALLBACK_PRODUCTION', undefined, req.requestId, {
          session_id: req.sessionContext?.session_id || 'anonymous',
          status_code: 503,
          logger: 'app.express.server'
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
      '/cache/refresh',
      '/scheduler/entity-updates'  // Scheduler API for incremental updates
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
      '/tables',
      '/dags',
      '/dashboard/summary',
      '/users',
      '/admin/users',
      '/tenants',
      '/audit',
      '/alerts',
      '/broadcast-messages',
      // Allow conflict resolution fallback in development
      '/api/v1/conflicts',
      '/v1/conflicts'
    ];
    
    // Check core system paths first (always allowed)
    if (coreSystemPaths.includes(req.path)) {
      structuredLogger.info('EXPRESS_CORE_ENDPOINT', req.sessionContext, req.requestId, { logger: 'app.express.server' });
      return next();
    }
    
    // In development mode: Allow auth fallbacks and development endpoints
    if (isDevelopment) {
      const isAuthPath = authFallbackPaths.includes(req.path);
      const isDevPath = developmentPaths.some(path => req.path.startsWith(path));
      if (isAuthPath || isDevPath) {
        structuredLogger.info('EXPRESS_DEVELOPMENT_ENDPOINT', req.sessionContext, req.requestId, { logger: 'app.express.server' });
        return next();
      }
    } else {
      // In production: Only allow auth fallbacks for emergency access
      if (authFallbackPaths.includes(req.path)) {
        structuredLogger.info('EXPRESS_AUTH_FALLBACK', req.sessionContext, req.requestId, { logger: 'app.express.server' });
        return next();
      }
    }
    
    // Block all other /api/* calls with environment-specific messaging
    const blockReason = isDevelopment 
      ? 'Legacy Express API call blocked in development - use FastAPI /api/v1/* instead'
      : 'Legacy Express API call blocked in production - use FastAPI /api/v1/* for security';
      
    structuredLogger.warn('BLOCKED_LEGACY_EXPRESS_CALL', req.sessionContext, req.requestId, { logger: 'app.express.server' });
    
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
    return sendError(res, 401, 'Unauthorized');
  };
  
  // Middleware to validate scheduler API token
  const validateSchedulerToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['x-scheduler-token'];
    const expectedToken = process.env.SCHEDULER_API_TOKEN;
    
    if (!expectedToken) {
      structuredLogger.error('SCHEDULER_TOKEN_NOT_CONFIGURED', req.sessionContext, req.requestId, { 
        logger: 'app.scheduler.security' 
      });
      return res.status(500).json(createErrorResponse('Scheduler token not configured', 'configuration_error'));
    }
    
    if (!token || token !== expectedToken) {
      structuredLogger.warn('SCHEDULER_INVALID_TOKEN', req.sessionContext, req.requestId, { 
        logger: 'app.scheduler.security'
      });
      return res.status(401).json(createErrorResponse('Invalid or missing scheduler token', 'unauthorized'));
    }
    
    next();
  };
  
  
  // API Routes
  
  // Get current user profile (from cache for optimal performance)
  app.get("/api/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return sendError(res, 401, 'User not authenticated');
      }

      // Try to get user from cache first
      const cachedUsers = await storage.getUsers();
      const cachedUser = cachedUsers.find((u: any) => u.id === req.user?.id);
      
      if (cachedUser) {
        return res.json(cachedUser);
      }

      // Fallback to storage if not in cache
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return sendError(res, 404, 'User not found');
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return sendError(res, 500, 'Failed to fetch user profile');
    }
  });
  
  // Users endpoints for notification system - Redis-first; fallback to mock when Redis unavailable
  app.get("/api/users", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      
      if (status.connected) {
        // Redis mode: read from users hash (O(1) storage)
        const users = await redisCache.getAllUsersFromHash();
        res.json(users || []);
      } else {
        // In-memory mode: fallback to storage
      const users = await storage.getUsers();
      res.json(users);
      }
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch users');
    }
  });

  // FastAPI fallback route for admin users endpoint - Redis-first; fallback to mock when Redis unavailable
  app.get("/api/v1/users", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';

      if (redisConnected) {
        // Redis-first: read from users hash (HVALS)
        const users = await redisCache.getAllUsersFromHash();
        const transformedUsers = Array.isArray(users) ? users.map((user: any) => ({
          id: user.id,
          name: user.username,
          email: user.email || '',
          is_active: user.is_active !== false
        })) : [];
        return res.json(transformedUsers);
      }

      // Redis not available: return mock users from storage
      const users = await storage.getUsers();
      const transformedUsers = users.map(user => ({
        id: user.id,
        name: user.username,
        email: user.email || '',
        is_active: user.is_active !== false
      }));
      res.json(transformedUsers);
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch users from FastAPI fallback');
    }
  });
  // FastAPI fallback route for creating new users
  app.post("/api/v1/users", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      // Validate request body with admin user schema
      const validationResult = adminUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { user_name, user_email, user_slack, user_pagerduty, is_active } = validationResult.data;

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: O(1) create in users hash
        const created = await redisCache.createUserInHash({
          user_name,
          user_email,
          user_slack,
          user_pagerduty,
          is_active,
        });
        return res.status(201).json({
          user_id: created.id,
          user_name: created.username,
          user_email: created.email || '',
          user_slack: created.user_slack || null,
          user_pagerduty: created.user_pagerduty || null,
          is_active: created.is_active ?? true
        });
      }

      // In-memory mode: create via storage
      const newUser = await storage.createUser({
        username: user_name,
        password: "temp-password",
        email: user_email,
        displayName: user_name,
        user_slack: user_slack || [],
        user_pagerduty: user_pagerduty || [],
        is_active: is_active,
        role: "user"
      });

      await redisCache.invalidateCache({
        keys: ['all_users', 'users_list'],
        patterns: ['user_*'],
        mainCacheKeys: ['USERS_HASH'],
        refreshAffectedData: true
      });

      // Transform response to match admin panel format
      return res.status(201).json({
        user_id: newUser.id,
        user_name: newUser.username,
        user_email: newUser.email || '',
        user_slack: newUser.user_slack || null,
        user_pagerduty: newUser.user_pagerduty || null,
        is_active: newUser.is_active ?? true
      });
    } catch (error) {
      res.status(500).json(createErrorResponse("Failed to create user"));
    }
  });

  // FastAPI fallback route for updating users
  app.put("/api/v1/users/:userId", checkActiveUserDev, async (req: Request, res: Response) => {
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
      let updatedUser: any = await storage.updateUser(userId, internalUpdateData);
      if (!updatedUser) {
        return res.status(404).json(createErrorResponse("User not found", "not_found"));
      }

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: O(1) update by id in users hash
        const next = await redisCache.updateUserByIdInHash(userId, updateData);
        if (!next) {
          return res.status(404).json(createErrorResponse("User not found", "not_found"));
        }
        updatedUser = next;
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateUserData();
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

  // PATCH endpoint for user updates (FastAPI)
  app.patch("/api/v1/users/:userId", checkActiveUserDev, async (req: Request, res: Response) => {
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
      const status = await redisCache.getCacheStatus();

      let updatedUser: any = undefined;

      if (status && status.mode === 'redis') {
        // Redis mode: O(1) update by id in users hash
        updatedUser = await redisCache.updateUserByIdInHash(userId, updateData);
        if (!updatedUser) {
          return res.status(404).json(createErrorResponse("User not found", "not_found"));
        }
      } else {
        // In-memory mode: update storage
      const internalUpdateData: any = {};
      if (updateData.user_name) internalUpdateData.username = updateData.user_name;
      if (updateData.user_email) internalUpdateData.email = updateData.user_email;
      if (updateData.user_slack) internalUpdateData.user_slack = updateData.user_slack;
      if (updateData.user_pagerduty) internalUpdateData.user_pagerduty = updateData.user_pagerduty;
      if (updateData.is_active !== undefined) internalUpdateData.is_active = updateData.is_active;

        updatedUser = await storage.updateUser(userId, internalUpdateData);
      if (!updatedUser) {
        return res.status(404).json(createErrorResponse("User not found", "not_found"));
      }

        // Invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateUserData();
      }
      
      // CRITICAL: Also invalidate profile cache for this user so profile page shows updated data
      await redisCache.invalidateCache({
        keys: updatedUser ? [`profile_${updatedUser.id}`, `profile_${updatedUser.email}`] : [],
        refreshAffectedData: false
      });

      // CRITICAL: If this is the currently logged-in user, update their session data
      // This ensures /api/user endpoint returns fresh data immediately
      if (req.isAuthenticated && req.isAuthenticated() && req.user && (req.user as any).id === userId) {
        console.log('Admin updated currently logged-in user, refreshing session...');
        req.login(updatedUser, (loginErr) => {
          if (loginErr) {
            console.error('Failed to update session after admin update:', loginErr);
          } else {
            console.log('Session refreshed successfully for user:', updatedUser.id);
          }
        });
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

  // PATCH endpoint for user updates (Express fallback)
  app.patch("/api/users/:userId", requireActiveUser, async (req: Request, res: Response) => {
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

      // CRITICAL: If this is the currently logged-in user, update their session data
      // This ensures /api/user endpoint returns fresh data immediately
      if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.id === userId) {
        console.log('Admin updated currently logged-in user (Express fallback), refreshing session...');
        req.login(updatedUser, (loginErr) => {
          if (loginErr) {
            console.error('Failed to update session after admin update:', loginErr);
          } else {
            console.log('Session refreshed successfully for user:', updatedUser.id);
          }
        });
      }

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
      return sendError(res, 500, 'Failed to fetch user roles');
    }
  });

  // GET /api/v1/roles - Redis-first; fallback to mock when Redis unavailable
  app.get("/api/v1/roles", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      if (redisConnected) {
        // Redis-first: read from Redis only, return empty if key doesn't exist
        const roles = await redisCache.get(CACHE_KEYS.ROLES) || [];
        return res.json(roles);
      }

      const roles = await storage.getRoles();
      return res.json(roles);
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch roles');
    }
  });

  // POST /api/v1/roles - Create new role
  app.post("/api/v1/roles", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const roleData = req.body;
      const status = await redisCache.getCacheStatus();

      if (status && status.mode === 'redis') {
        // Redis mode: generate ID from Redis (avoid storage mock counters)
        const existingRoles = await redisCache.get(CACHE_KEYS.ROLES) || [];
        const nextId = Array.isArray(existingRoles) && existingRoles.length > 0
          ? Math.max(...existingRoles.map((r: any) => Number(r?.id) || 0)) + 1
          : 1;
        
        const now = new Date().toISOString();
        const newRole = {
          id: nextId,
          role_name: roleData.role_name,
          description: roleData.description || null,
          is_active: roleData.is_active ?? true,
          is_system_role: roleData.is_system_role ?? false,
          role_permissions: roleData.role_permissions || [],
          team_name: roleData.team_name || null,
          tenant_name: roleData.tenant_name || null,
          createdAt: now,
          updatedAt: now,
        };

        // Update Redis cache
        const updatedRoles = [...existingRoles, newRole];
        await redisCache.set(CACHE_KEYS.ROLES, updatedRoles, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ROLES, {
          timestamp: new Date().toISOString()
        });

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return res.status(201).json(newRole);
      }

      // In-memory mode: create via storage
      const newRole = await storage.createRole(roleData);
      
      // Invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateCache({
        keys: ['all_roles', 'roles_list'],
        patterns: ['role_*'],
        mainCacheKeys: ['ROLES'],
        refreshAffectedData: true
      });

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.status(201).json(newRole);
    } catch (error) {
      console.error('Error creating role:', error);
      return sendError(res, 500, 'Failed to create role');
    }
  });
  // PATCH /api/v1/roles/{roleName} - Update role by name
  app.patch("/api/v1/roles/:roleName", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { roleName } = req.params;
      const roleData = req.body;
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      let updatedRole;
      
      if (status && status.mode === 'redis') {
        // Redis mode: update directly in Redis
        const existingRoles = await redisCache.get(CACHE_KEYS.ROLES) || [];
        const roleIndex = Array.isArray(existingRoles)
          ? existingRoles.findIndex((role: any) => role.role_name === roleName)
          : -1;
        
        if (roleIndex === -1) {
          return sendError(res, 404, `Role '${roleName}' not found`);
        }
        
        // Merge existing role with updates
        updatedRole = {
          ...existingRoles[roleIndex],
          ...roleData,
          role_name: roleName, // Ensure name doesn't change
        };
        
        const updatedRoles = [...existingRoles];
        updatedRoles[roleIndex] = updatedRole;
        await redisCache.set(CACHE_KEYS.ROLES, updatedRoles, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ROLES, {
          timestamp: new Date().toISOString()
        });
      } else {
        // In-memory mode: update in storage
        updatedRole = await storage.updateRole(roleName, roleData);
      
      if (!updatedRole) {
        return sendError(res, 404, `Role '${roleName}' not found`);
      }
      
        // Invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_roles', 'roles_list'],
          patterns: ['role_*'],
          mainCacheKeys: ['ROLES'],
          refreshAffectedData: true
        });
      }

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.json(updatedRole);
    } catch (error) {
      console.error(`Error updating role '${req.params.roleName}':`, error);
      return sendError(res, 500, 'Failed to update role');
    }
  });

  // DELETE /api/v1/roles/{roleName} - Delete role by name
  app.delete("/api/v1/roles/:roleName", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { roleName } = req.params;
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: delete directly from Redis
        const existingRoles = await redisCache.get(CACHE_KEYS.ROLES) || [];
        const roleExists = Array.isArray(existingRoles) && existingRoles.some((role: any) => role.role_name === roleName);
        
        if (!roleExists) {
          return sendError(res, 404, `Role '${roleName}' not found`);
        }
        
        const updatedRoles = existingRoles.filter((role: any) => role.role_name !== roleName);
        await redisCache.set(CACHE_KEYS.ROLES, updatedRoles, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ROLES, {
          timestamp: new Date().toISOString()
        });
      } else {
        // In-memory mode: delete from storage
      const success = await storage.deleteRole(roleName);
      
      if (!success) {
        return sendError(res, 404, `Role '${roleName}' not found`);
      }
      
        // Invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_roles', 'roles_list'],
          patterns: ['role_*'],
          mainCacheKeys: ['ROLES'],
          refreshAffectedData: true
        });
      }

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.json({ success: true, message: `Role '${roleName}' deleted` });
    } catch (error) {
      console.error(`Error deleting role '${req.params.roleName}':`, error);
      return sendError(res, 500, 'Failed to delete role');
    }
  });

  // GET /api/v1/get_all_permissions - Redis-first; fallback to mock storage when Redis unavailable
  app.get("/api/v1/get_all_permissions", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      
      if (redisConnected) {
        // Redis-first: read from Redis only, return empty if key doesn't exist
        const permissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        return res.json(permissions);
      }
      
      // Redis not available: return mock permissions from storage
      const permissions = await storage.getPermissions();
      res.json(permissions);
    } catch (error) {
      console.error('Error fetching permissions from /api/v1/get_all_permissions:', error);
      return sendError(res, 500, 'Failed to fetch permissions');
    }
  });
  // GET /api/permissions - Redis-first; fallback to mock storage when Redis unavailable
  app.get("/api/permissions", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      
      if (redisConnected) {
        // Redis-first: read from Redis only, return empty if key doesn't exist
        const permissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        return res.json(permissions);
      }
      
      // Redis not available: return mock permissions from storage
      const permissions = await storage.getPermissions();
      res.json(permissions);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      return sendError(res, 500, 'Failed to fetch permissions');
    }
  });

  // POST /api/v1/permissions - FastAPI fallback for creating permissions
  app.post("/api/v1/permissions", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const permissionData = req.body;
      const status = await redisCache.getCacheStatus();

      if (status && status.mode === 'redis') {
        // Redis mode: generate ID from Redis (avoid storage mock counters)
        const existingPermissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        const nextId = Array.isArray(existingPermissions) && existingPermissions.length > 0
          ? Math.max(...existingPermissions.map((p: any) => Number(p?.id) || 0)) + 1
          : 1;
        
        const now = new Date().toISOString();
        const newPermission = {
          id: nextId,
          permission_name: permissionData.permission_name,
          description: permissionData.description || null,
          category: permissionData.category,
          is_active: permissionData.is_active ?? true,
          createdAt: now,
          updatedAt: now,
        };

        // Update Redis cache
        const updatedPermissions = [...existingPermissions, newPermission];
        await redisCache.set(CACHE_KEYS.PERMISSIONS, updatedPermissions, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.PERMISSIONS, {
          timestamp: new Date().toISOString()
        });

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        return res.status(201).json(newPermission);
      }

      // In-memory mode: create via storage
      const newPermission = await storage.createPermission(permissionData);
      
      // Invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateCache({
        keys: ['all_permissions', 'permissions_list'],
        patterns: ['permission_*'],
        mainCacheKeys: ['PERMISSIONS'],
        refreshAffectedData: true
      });

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.status(201).json(newPermission);
    } catch (error) {
      console.error('Error creating permission from /api/v1/permissions:', error);
      return sendError(res, 500, 'Failed to create permission');
    }
  });

  // PATCH /api/v1/permissions/:name - FastAPI fallback for updating permissions
  app.patch("/api/v1/permissions/:name", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const permissionData = req.body;
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      let updatedPermission;
      
      if (status && status.mode === 'redis') {
        // Redis mode: update directly in Redis
        const existingPermissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        const permissionIndex = Array.isArray(existingPermissions) 
          ? existingPermissions.findIndex((perm: any) => perm.permission_name === name)
          : -1;
        
        if (permissionIndex === -1) {
          return sendError(res, 404, `Permission '${name}' not found`);
        }
        
        // Merge existing permission with updates
        updatedPermission = {
          ...existingPermissions[permissionIndex],
          ...permissionData,
          permission_name: name, // Ensure name doesn't change
        };
        
        const updatedPermissions = [...existingPermissions];
        updatedPermissions[permissionIndex] = updatedPermission;
        await redisCache.set(CACHE_KEYS.PERMISSIONS, updatedPermissions, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.PERMISSIONS, {
          timestamp: new Date().toISOString()
        });
      } else {
        // In-memory mode: update in storage
        updatedPermission = await storage.updatePermission(name, permissionData);
      if (!updatedPermission) {
        return sendError(res, 404, `Permission '${name}' not found`);
      }
        
        // Invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_permissions', 'permissions_list'],
          patterns: ['permission_*'],
          mainCacheKeys: ['PERMISSIONS'],
          refreshAffectedData: true
        });
      }

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.json(updatedPermission);
    } catch (error) {
      console.error(`Error updating permission '${req.params.name}' from /api/v1/permissions:`, error);
      return sendError(res, 500, 'Failed to update permission');
    }
  });

  // DELETE /api/v1/permissions/:name - FastAPI fallback for deleting permissions
  app.delete("/api/v1/permissions/:name", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: delete directly from Redis
        const existingPermissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        const permissionExists = Array.isArray(existingPermissions) && existingPermissions.some((perm: any) => perm.permission_name === name);
        
        if (!permissionExists) {
          return sendError(res, 404, `Permission '${name}' not found`);
        }
        
        const updatedPermissions = existingPermissions.filter((perm: any) => perm.permission_name !== name);
        await redisCache.set(CACHE_KEYS.PERMISSIONS, updatedPermissions, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.PERMISSIONS, {
          timestamp: new Date().toISOString()
        });
      } else {
        // In-memory mode: delete from storage
      const success = await storage.deletePermission(name);
      if (!success) {
        return sendError(res, 404, `Permission '${name}' not found`);
      }
        
        // Invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_permissions', 'permissions_list'],
          patterns: ['permission_*'],
          mainCacheKeys: ['PERMISSIONS'],
          refreshAffectedData: true
        });
      }

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.json({ success: true, message: `Permission '${name}' deleted` });
    } catch (error) {
      console.error(`Error deleting permission '${req.params.name}' from /api/v1/permissions:`, error);
      return sendError(res, 500, 'Failed to delete permission');
    }
  });

  // POST /api/permissions - Create new permission
  app.post("/api/permissions", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const permissionData = req.body;
      const newPermission = await storage.createPermission(permissionData);

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: write directly to Redis
        const existingPermissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        const updatedPermissions = Array.isArray(existingPermissions) ? [...existingPermissions, newPermission] : [newPermission];
        await redisCache.set(CACHE_KEYS.PERMISSIONS, updatedPermissions, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.GENERAL, {
          timestamp: new Date().toISOString()
        });
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_permissions', 'permissions_list'],
          patterns: ['permission_*'],
          mainCacheKeys: ['PERMISSIONS'],
          refreshAffectedData: true
        });
      }

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.status(201).json(newPermission);
    } catch (error) {
      console.error('Error creating permission:', error);
      return sendError(res, 500, 'Failed to create permission');
    }
  });

  // PATCH /api/permissions/:name - Update permission by name
  app.patch("/api/permissions/:name", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const permissionData = req.body;
      const updatedPermission = await storage.updatePermission(name, permissionData);
      
      if (!updatedPermission) {
        return sendError(res, 404, `Permission '${name}' not found`);
      }
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: write directly to Redis
        const existingPermissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        const updatedPermissions = Array.isArray(existingPermissions)
          ? existingPermissions.map((perm: any) => perm.permission_name === name ? updatedPermission : perm)
          : [updatedPermission];
        await redisCache.set(CACHE_KEYS.PERMISSIONS, updatedPermissions, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.PERMISSIONS, {
          timestamp: new Date().toISOString()
        });
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_permissions', 'permissions_list'],
          patterns: ['permission_*'],
          mainCacheKeys: ['PERMISSIONS'],
          refreshAffectedData: true
        });
      }

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.json(updatedPermission);
    } catch (error) {
      console.error(`Error updating permission '${req.params.name}':`, error);
      return sendError(res, 500, 'Failed to update permission');
    }
  });

  // DELETE /api/permissions/:name - Delete permission by name
  app.delete("/api/permissions/:name", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const success = await storage.deletePermission(name);
      
      if (!success) {
        return sendError(res, 404, `Permission '${name}' not found`);
      }
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: write directly to Redis
        const existingPermissions = await redisCache.get(CACHE_KEYS.PERMISSIONS) || [];
        const updatedPermissions = Array.isArray(existingPermissions)
          ? existingPermissions.filter((perm: any) => perm.permission_name !== name)
          : [];
        await redisCache.set(CACHE_KEYS.PERMISSIONS, updatedPermissions, 6 * 60 * 60);
        
        // Broadcast update to connected clients
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.PERMISSIONS, {
          timestamp: new Date().toISOString()
        });
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_permissions', 'permissions_list'],
          patterns: ['permission_*'],
          mainCacheKeys: ['PERMISSIONS'],
          refreshAffectedData: true
        });
      }

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.json({ success: true, message: `Permission '${name}' deleted` });
    } catch (error) {
      console.error(`Error deleting permission '${req.params.name}':`, error);
      return sendError(res, 500, 'Failed to delete permission');
    }
  });

  // GET /api/v1/alerts - Redis-first for admin notification bell; fallback to mock when Redis unavailable
  app.get("/api/v1/alerts", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';
      const now = new Date();

      let alerts: any[] = [];
      if (redisConnected) {
        // Redis-first: read from Redis only, return empty if key doesn't exist
        alerts = await redisCache.get(CACHE_KEYS.ALERTS) || [];
      } else {
        // Redis unavailable: fallback to Express/mock storage
        alerts = await storage.getAlerts();
      }

      const activeAlerts = (alerts || []).filter(alert => 
        alert.isActive && (!alert.expiresAt || new Date(alert.expiresAt) > now)
      );

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.json(activeAlerts);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      return sendError(res, 500, 'Failed to fetch system alerts');
    }
  });

  // POST /api/v1/alerts - Create system alert
  app.post("/api/v1/alerts", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const status = await redisCache.getCacheStatus();

      if (status && status.mode === 'redis') {
        // Redis mode: generate ID from Redis (avoid storage mock counters)
        const existingAlerts = await redisCache.get(CACHE_KEYS.ALERTS) || [];
        const nextId = Array.isArray(existingAlerts) && existingAlerts.length > 0
          ? Math.max(...existingAlerts.map((a: any) => Number(a?.id) || 0)) + 1
          : 1;
        
        const now = new Date().toISOString();
        const newAlert = {
          id: nextId,
          ...req.body,
          isActive: req.body.isActive ?? true,
          expiresAt: req.body.expiresAt ?? null,
          createdAt: now,
          updatedAt: now,
        };

        // Update Redis cache
        const updatedAlerts = [...existingAlerts, newAlert];
        await redisCache.set(CACHE_KEYS.ALERTS, updatedAlerts, 6 * 60 * 60);

        return res.status(201).json({
          success: true,
          message: "Alert created successfully",
          alert: newAlert
        });
      }

      // In-memory mode: create via storage
      const newAlert = await storage.createAlert(req.body);
      
      // Invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateCache({
        keys: ['all_alerts', 'system_alerts'],
        patterns: ['alert_*'],
        mainCacheKeys: ['ALERTS'],
        refreshAffectedData: true
      });

      res.status(201).json({
        success: true,
        message: "Alert created successfully",
        alert: newAlert
      });
    } catch (error) {
      console.error('Failed to create alert:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create alert",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DELETE /api/v1/alerts/:id - Deactivate alert
  app.delete("/api/v1/alerts/:id", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const alertId = parseInt(req.params.id);
      
      // Deactivate alert in storage
      const success = await storage.deactivateAlert(alertId);
      if (!success) {
        return res.status(404).json({ 
          success: false,
          message: "Alert not found" 
        });
      }

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: write directly to Redis
        const existingAlerts = await redisCache.get(CACHE_KEYS.ALERTS) || [];
        const updatedAlerts = Array.isArray(existingAlerts) 
          ? existingAlerts.map((alert: any) => alert.id === alertId ? { ...alert, isActive: false } : alert)
          : [];
        await redisCache.set(CACHE_KEYS.ALERTS, updatedAlerts, 6 * 60 * 60);
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_alerts', 'system_alerts'],
          patterns: ['alert_*'],
          mainCacheKeys: ['ALERTS'],
          refreshAffectedData: true
        });
      }

      res.json({
        success: true,
        message: "Alert deactivated successfully"
      });
    } catch (error) {
      console.error('Failed to deactivate alert:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to deactivate alert",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/v1/admin/broadcast-messages - Get admin broadcast messages
  app.get("/api/v1/admin/broadcast-messages", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      
      let messages: any[] = [];
      if (redisConnected) {
        // Redis-first: read from Redis only, return empty if key doesn't exist
        messages = await redisCache.get(CACHE_KEYS.ADMIN_MESSAGES) || [];
      } else {
        // Redis unavailable: fallback to Express/mock storage
        messages = await storage.getAdminBroadcastMessages();
      }

      return res.json(messages);
    } catch (error) {
      console.error('Failed to fetch broadcast messages:', error);
      return sendError(res, 500, 'Failed to fetch broadcast messages');
    }
  });
  // POST /api/v1/admin/broadcast-messages - Create admin broadcast message
  app.post("/api/v1/admin/broadcast-messages", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const status = await redisCache.getCacheStatus();

      if (status && status.mode === 'redis') {
        // Redis mode: generate ID from Redis (avoid storage mock counters)
        const existingMessages = await redisCache.get(CACHE_KEYS.ADMIN_MESSAGES) || [];
        const nextId = Array.isArray(existingMessages) && existingMessages.length > 0
          ? Math.max(...existingMessages.map((m: any) => Number(m?.id) || 0)) + 1
          : 1;
        
        const now = new Date().toISOString();
        const newMessage = {
          id: nextId,
          ...req.body,
          isActive: req.body.isActive ?? true,
          expiresAt: req.body.expiresAt ?? null,
          excludeDateKeys: req.body.excludeDateKeys ?? [],
          createdAt: now,
          updatedAt: now,
        };

        // Update Redis cache
        const updatedMessages = [...existingMessages, newMessage];
        await redisCache.set(CACHE_KEYS.ADMIN_MESSAGES, updatedMessages, 6 * 60 * 60);

        // Broadcast to connected clients if delivery type is immediate, login_triggered, or immediate_and_login_triggered
        if (newMessage.deliveryType === 'immediate' || newMessage.deliveryType === 'login_triggered' || newMessage.deliveryType === 'immediate_and_login_triggered') {
          await redisCache.broadcastAdminMessage({
            id: newMessage.id,
            message: newMessage.message,
            deliveryType: newMessage.deliveryType,
            expiresAt: newMessage.expiresAt ? new Date(newMessage.expiresAt) : null,
            createdAt: new Date(newMessage.createdAt),
          });
          // Also emit cache-updated to force instant refetch for clients that rely on query polling
          try {
            await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ADMIN_MESSAGES, {
              action: 'create',
              id: newMessage.id,
              timestamp: new Date().toISOString(),
            });
          } catch {}
        }

        return res.status(201).json({
          success: true,
          message: "Broadcast message created successfully",
          data: newMessage
        });
      }

      // In-memory mode: create via storage
      const newMessage = await storage.createAdminBroadcastMessage(req.body);

      // Invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateCache({
        keys: ['all_broadcast_messages', 'admin_messages'],
        patterns: ['broadcast_*'],
        mainCacheKeys: ['ADMIN_MESSAGES'],
        refreshAffectedData: true
      });

      // Broadcast to connected clients if delivery type is immediate, login_triggered, or immediate_and_login_triggered
      if (newMessage.deliveryType === 'immediate' || newMessage.deliveryType === 'login_triggered' || newMessage.deliveryType === 'immediate_and_login_triggered') {
        await redisCache.broadcastAdminMessage({
          id: newMessage.id,
          message: newMessage.message,
          deliveryType: newMessage.deliveryType,
          createdAt: typeof newMessage.createdAt === 'string' ? new Date(newMessage.createdAt) : newMessage.createdAt,
          expiresAt: newMessage.expiresAt ? (typeof newMessage.expiresAt === 'string' ? new Date(newMessage.expiresAt) : newMessage.expiresAt) : null
        });
        try {
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ADMIN_MESSAGES, {
            action: 'create',
            id: newMessage.id,
            timestamp: new Date().toISOString(),
          });
        } catch {}
      }

      res.status(201).json({
        success: true,
        message: "Broadcast message created successfully",
        broadcastMessage: newMessage
      });
    } catch (error) {
      console.error('Failed to create broadcast message:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create broadcast message",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DELETE /api/v1/admin/broadcast-messages/:id - Deactivate broadcast message
  app.delete("/api/v1/admin/broadcast-messages/:id", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.id);
      
      // Deactivate broadcast message in storage
      const success = await storage.deactivateAdminBroadcastMessage(messageId);
      if (!success) {
        return res.status(404).json({ 
          success: false,
          message: "Broadcast message not found" 
        });
      }

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: write directly to Redis
        const existingMessages = await redisCache.get(CACHE_KEYS.ADMIN_MESSAGES) || [];
        const updatedMessages = Array.isArray(existingMessages) 
          ? existingMessages.filter((msg: any) => msg.id !== messageId)
          : [];
        await redisCache.set(CACHE_KEYS.ADMIN_MESSAGES, updatedMessages, 6 * 60 * 60);
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
        await redisCache.invalidateCache({
          keys: ['all_broadcast_messages', 'admin_messages'],
          patterns: ['broadcast_*'],
          mainCacheKeys: ['ADMIN_MESSAGES'],
          refreshAffectedData: true
        });
      }

      res.json({
        success: true,
        message: "Broadcast message deactivated successfully"
      });

      // Notify clients to refetch admin messages immediately
      try {
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ADMIN_MESSAGES, {
          action: 'delete',
          id: messageId,
          timestamp: new Date().toISOString(),
        });
      } catch {}
    } catch (error) {
      console.error('Failed to deactivate broadcast message:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to deactivate broadcast message",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/v1/conflicts - Redis-first; fallback to mock storage when Redis unavailable
  app.get("/api/v1/conflicts", async (_req: Request, res: Response) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';
      
      if (redisConnected) {
        const conflicts = await redisCache.getConflicts(1000);
        return res.json(conflicts);
      }
      
      // Redis not available: return mock conflicts from storage
      const conflicts = await storage.getConflicts();
      return res.json(conflicts);
    } catch (error) {
      console.error('Failed to fetch conflicts:', error);
      return sendError(res, 500, 'Failed to fetch conflicts');
    }
  });
  // POST /api/v1/conflicts/:notificationId/resolve - Express fallback to resolve conflicts when FastAPI unavailable
  app.post('/api/v1/conflicts/:notificationId/resolve', async (req: Request, res: Response) => {
    try {
      const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
      const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
      const { notificationId } = req.params;
      const { resolutionType, resolutionNotes, payload } = req.body || {};

      if (USE_FASTAPI) {
        // Proxy to FastAPI when available
        const resp = await fetch(`${FASTAPI_BASE_URL}/api/v1/conflicts/${notificationId}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolutionType, resolutionNotes, payload })
        });
        const data = await resp.json().catch(() => ({}));
        return res.status(resp.status).json(data);
      }

      // Express fallback: apply the resolution locally
      const conflict = await redisCache.getConflictById(notificationId);
      if (!conflict) {
        return sendError(res, 404, 'Conflict not found');
      }

      // Allow admin to edit payload in-place prior to resolution
      let effectivePayload = payload || conflict.record.originalPayload || {};

      // If create_shared, we create or update the entity based on action_type (add|update)
      if (resolutionType === 'create_shared') {
        // Prefer edited payload fields for correct requester context
        const entityType = (conflict.record.entityType || conflict.record.entity_type) as 'table' | 'dag';
        const requestTeam = (effectivePayload.team_name || effectivePayload.team || conflict.record.conflictDetails?.requestedByTeam || conflict.record.team_name || '').toString();
        const tenantName = (effectivePayload.tenant_name || conflict.record.conflictDetails?.tenantName || conflict.record.tenant_name || null) as string | null;
        const serverName = (effectivePayload.server_name || conflict.record.conflictDetails?.serverName || conflict.record.server_name || null) as string | null;
        const entityDisplayName = (effectivePayload.entity_display_name || effectivePayload.dag_name || (effectivePayload.schema_name && effectivePayload.table_name ? `${effectivePayload.schema_name}.${effectivePayload.table_name}` : undefined) || conflict.record.entityName || conflict.record.entity_display_name) as string;
        const actionType = (effectivePayload as any)?.action_type || (conflict.record?.originalPayload as any)?.action_type || 'add';
        const isBulk = actionType === 'bulk_add' && Array.isArray((conflict.record?.originalPayload as any)?.bulkRequest);

        // Resolve numeric IDs for team and tenant from cache
        let teamId: number | null = null;
        let tenantId: number | null = null;
        try {
          const teams = await redisCache.getAllTeams();
          const tenants = await redisCache.getAllTenants();
          const teamMatch = Array.isArray(teams) ? teams.find((t: any) => (t.name || '').toLowerCase() === (requestTeam || '').toLowerCase()) : null;
          if (teamMatch) {
            teamId = teamMatch.id ?? null;
            tenantId = teamMatch.tenant_id ?? null;
          }
          if (!tenantId && tenantName && Array.isArray(tenants)) {
            const tenantMatch = tenants.find((tn: any) => (tn.name || '').toLowerCase() === (tenantName || '').toLowerCase());
            if (tenantMatch) tenantId = tenantMatch.id ?? null;
          }
        } catch {}

        if (isBulk) {
          // Process entire bulk set without checking conflicts; create non-owner entries by default
          const bulkItems: any[] = (conflict.record?.originalPayload as any)?.bulkRequest || [effectivePayload];
          const now = new Date().toISOString();
          for (const item of bulkItems) {
            const type: 'table' | 'dag' = ((item as any).entity_type || (item as any).type) === 'table' ? 'table' : 'dag';
            const displayName = (item.entity_display_name || item.dag_name || (item.schema_name && item.table_name ? `${item.schema_name}.${item.table_name}` : item.entity_name));
            const itemTeam = (item?.team_name || requestTeam || '').toString();
            
            // Resolve team_id for this specific item if not already resolved
            let itemTeamId = teamId;
            if (!itemTeamId && itemTeam) {
              try {
                const teams = await redisCache.getAllTeams();
                const teamMatch = Array.isArray(teams) ? teams.find((t: any) => (t.name || '').toLowerCase() === itemTeam.toLowerCase()) : null;
                if (teamMatch) {
                  itemTeamId = teamMatch.id ?? null;
                }
              } catch {}
            }
            
            // Build comprehensive slim object with all entity-specific fields
            const slim: any = {
              entity_type: type,
              tenant_name: tenantName,
              tenant_id: tenantId ?? undefined,
              team_name: itemTeam,
              team_id: itemTeamId ?? undefined,
              entity_name: (item as any)?.entity_name || (item as any)?.name || displayName,
              entity_display_name: displayName,
              entity_schedule: (item as any)?.entity_schedule || (item as any)?.dag_schedule || (item as any)?.table_schedule || null,
              expected_runtime_minutes: (item as any)?.expected_runtime_minutes ?? null,
              is_entity_owner: item?.is_entity_owner === true ? true : false,
              is_active: (typeof (item as any)?.is_active === 'boolean') ? (item as any).is_active : true,
              server_name: (item as any)?.server_name || serverName,
              last_reported_at: now,
              lastRefreshed: now, // Dashboard uses this for "recent" entity filtering
              updatedAt: now, // Also set updatedAt for consistency
            };
            
            // Add entity-type specific fields
            if (type === 'table') {
              slim.schema_name = item.schema_name ?? null;
              slim.table_name = item.table_name ?? displayName;
              slim.table_schedule = item.table_schedule || item.entity_schedule || null;
              slim.table_description = item.table_description ?? null;
              slim.table_dependency = item.table_dependency ?? null;
              slim.table_donemarker_location = item.table_donemarker_location ?? null;
              slim.owner_entity_ref_name = item.owner_entity_ref_name ?? null;
              slim.owner_email = item.owner_email ?? null;
              slim.donemarker_lookback = item.donemarker_lookback ?? null;
            } else {
              slim.dag_name = item.dag_name ?? displayName;
              slim.dag_schedule = item.dag_schedule || item.entity_schedule || null;
              slim.dag_description = item.dag_description ?? null;
              slim.dag_dependency = item.dag_dependency ?? null;
              slim.dag_donemarker_location = item.dag_donemarker_location ?? null;
              slim.owner_entity_ref_name = item.owner_entity_ref_name ?? null;
              slim.owner_email = item.owner_email ?? null;
              slim.donemarker_lookback = item.donemarker_lookback ?? null;
            }
            
            // For non-owner entities, resolve the owner reference to get schedule and runtime
            if (!slim.is_entity_owner && slim.owner_entity_ref_name) {
              try {
                const refName = typeof slim.owner_entity_ref_name === 'string' 
                  ? slim.owner_entity_ref_name.trim() 
                  : slim.owner_entity_ref_name;
                if (refName) {
                  const matches = await redisCache.findSlimEntitiesByNameCI(refName, type);
                  if (matches && matches.length > 0) {
                    const ownerEntity = matches[0];
                    // Enrich with owner details
                    slim.owner_entity_ref_name = {
                      entity_owner_name: ownerEntity.entity_name,
                      entity_owner_tenant_id: ownerEntity.tenant_id ?? null,
                      entity_owner_tenant_name: ownerEntity.tenant_name ?? null,
                      entity_owner_team_id: ownerEntity.team_id ?? null,
                      entity_owner_team_name: ownerEntity.team_name ?? null,
                    };
                    // Inherit schedule and runtime from owner
                    if (ownerEntity.entity_schedule) slim.entity_schedule = ownerEntity.entity_schedule;
                    if (ownerEntity.expected_runtime_minutes != null) slim.expected_runtime_minutes = ownerEntity.expected_runtime_minutes;
                    if (ownerEntity.entity_display_name) slim.entity_display_name = ownerEntity.entity_display_name;
                  }
                }
              } catch {}
            }
            
            await (redisCache as any).upsertSlimEntity(slim);
            if (slim.is_entity_owner && itemTeam) {
              try { await (redisCache as any).updateConflictIndexForOwner(slim); } catch {}
            }
            // Immediate team cache invalidate + entity broadcast to mirror add/edit
            try {
              if (itemTeam) {
                await redisCache.invalidateTeamData(itemTeam);
              }
              await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES, {
                action: 'upsert',
                entityType: type,
                entityName: displayName,
                teamName: itemTeam,
                tenantName,
                timestamp: new Date().toISOString(),
              });
            } catch {}
          }
        } else if (actionType === 'update') {
          // Update existing entity by composite identifiers
          const entityNameForWhere = (effectivePayload as any)?.entity_name || (conflict.record?.originalPayload as any)?.entity_name || conflict.record?.entityName || entityDisplayName;
          const updates: any = { entity_display_name: entityDisplayName, is_active: true };
          const hasEntitySchedule = Object.prototype.hasOwnProperty.call(effectivePayload || {}, 'entity_schedule')
            || Object.prototype.hasOwnProperty.call(effectivePayload || {}, 'dag_schedule')
            || Object.prototype.hasOwnProperty.call(effectivePayload || {}, 'table_schedule');
          if (hasEntitySchedule) {
            updates.entity_schedule = effectivePayload?.entity_schedule || (effectivePayload as any)?.dag_schedule || (effectivePayload as any)?.table_schedule || null;
          }
          if (Object.prototype.hasOwnProperty.call(effectivePayload || {}, 'expected_runtime_minutes')) {
            updates.expected_runtime_minutes = (effectivePayload as any).expected_runtime_minutes;
          }
          if (Object.prototype.hasOwnProperty.call(effectivePayload || {}, 'server_name')) {
            updates.server_name = serverName;
          }
          await (redisCache as any).updateSlimEntityByComposite({
            tenantName,
            teamName: requestTeam,
            entityType,
            entityName: entityNameForWhere,
            updates,
          });
          // Update conflict index for the shared display name
          const ownerSlim = {
            entity_type: entityType,
            tenant_name: tenantName,
            team_name: requestTeam,
            entity_display_name: entityDisplayName,
            server_name: serverName,
            is_entity_owner: true,
          } as any;
          try { if (requestTeam) await (redisCache as any).updateConflictIndexForOwner(ownerSlim); } catch {}
          // Broadcast entities-cache for UI refresh (summary, tables)
          try {
            await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES, {
              action: 'update',
              entityType,
              entityName: entityDisplayName,
              teamName: requestTeam,
              tenantName,
              timestamp: new Date().toISOString(),
            });
          } catch {}
        } else {
          // Default: add (single) - original slim upsert path with comprehensive fields
          const now = new Date().toISOString();
          const slim: any = {
            entity_type: entityType,
            tenant_name: tenantName,
            tenant_id: tenantId ?? undefined,
            team_name: requestTeam,
            team_id: teamId ?? undefined,
            entity_name: (effectivePayload as any)?.entity_name || (effectivePayload as any)?.name || entityDisplayName,
            entity_display_name: entityDisplayName,
            entity_schedule: effectivePayload?.entity_schedule || effectivePayload?.dag_schedule || effectivePayload?.table_schedule || null,
            expected_runtime_minutes: effectivePayload?.expected_runtime_minutes ?? null,
            is_entity_owner: effectivePayload?.is_entity_owner === true ? true : false,
            is_active: (typeof effectivePayload?.is_active === 'boolean') ? effectivePayload.is_active : true,
            server_name: serverName,
            last_reported_at: now,
            lastRefreshed: now, // Dashboard uses this for "recent" entity filtering
            updatedAt: now, // Also set updatedAt for consistency
          };
          
          // Add entity-type specific fields
          if (entityType === 'table') {
            slim.schema_name = effectivePayload.schema_name ?? null;
            slim.table_name = effectivePayload.table_name ?? entityDisplayName;
            slim.table_schedule = effectivePayload.table_schedule || effectivePayload.entity_schedule || null;
            slim.table_description = effectivePayload.table_description ?? null;
            slim.table_dependency = effectivePayload.table_dependency ?? null;
            slim.table_donemarker_location = effectivePayload.table_donemarker_location ?? null;
            slim.owner_entity_ref_name = effectivePayload.owner_entity_ref_name ?? null;
            slim.owner_email = effectivePayload.owner_email ?? null;
            slim.donemarker_lookback = effectivePayload.donemarker_lookback ?? null;
          } else {
            slim.dag_name = effectivePayload.dag_name ?? entityDisplayName;
            slim.dag_schedule = effectivePayload.dag_schedule || effectivePayload.entity_schedule || null;
            slim.dag_description = effectivePayload.dag_description ?? null;
            slim.dag_dependency = effectivePayload.dag_dependency ?? null;
            slim.dag_donemarker_location = effectivePayload.dag_donemarker_location ?? null;
            slim.owner_entity_ref_name = effectivePayload.owner_entity_ref_name ?? null;
            slim.owner_email = effectivePayload.owner_email ?? null;
            slim.donemarker_lookback = effectivePayload.donemarker_lookback ?? null;
          }
          
          await (redisCache as any).upsertSlimEntity(slim);
          if (slim.is_entity_owner && requestTeam) {
            try { await (redisCache as any).updateConflictIndexForOwner(slim); } catch {}
          }
        }
        // Notify clients that entities changed so team dashboards refresh
        try {
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES, {
            action: 'upsert',
            entityType,
            entityName: entityDisplayName,
            teamName: requestTeam,
            tenantName,
            timestamp: new Date().toISOString(),
          });
        } catch {}

        // Invalidate team caches and metrics to mimic add/edit behavior
        try {
          if (requestTeam && tenantName) {
            await redisCache.invalidateTeamData(requestTeam);
            await (redisCache as any).invalidateTeamMetricsCache(tenantName, requestTeam);
            await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.METRICS, {
              action: 'refresh',
              teamName: requestTeam,
              tenantName,
              timestamp: new Date().toISOString(),
            });
          }
        } catch {}
      }  // End of if (resolutionType === 'create_shared')

      await redisCache.patchConflict(notificationId, {
        status: (resolutionType === 'reject_shared') ? 'rejected' : 'resolved',
        resolutionType: resolutionType || 'create_shared',
        resolutionNotes: resolutionNotes || '',
        appliedPayload: effectivePayload,
        resolvedAt: new Date().toISOString(),
      });

      // Invalidate affected team caches so dashboards refresh (and metrics)
      try {
        const teamForInvalidate = (effectivePayload.team_name || (conflict.record as any)?.team_name || (conflict.record as any)?.conflictDetails?.requestedByTeam || null) as string | null;
        const tenantForInvalidate = (effectivePayload.tenant_name || (conflict.record as any)?.tenant_name || (conflict.record as any)?.conflictDetails?.tenantName || null) as string | null;
        if (teamForInvalidate) await redisCache.invalidateTeamData(teamForInvalidate);
        if (teamForInvalidate && tenantForInvalidate) {
          await (redisCache as any).invalidateTeamMetricsCache(tenantForInvalidate, teamForInvalidate);
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.METRICS, {
            action: 'refresh',
            teamName: teamForInvalidate,
            tenantName: tenantForInvalidate,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {}

      try {
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.CONFLICTS, {
          action: 'resolve',
          id: notificationId,
          timestamp: new Date().toISOString(),
        });
      } catch {}

      return res.json({ message: 'Conflict resolved (fallback)', notificationId });
    } catch (error) {
      return sendError(res, 500, 'Failed to resolve conflict');
    }
  });
  // Proxy-style route: POST /api/fastapi/conflicts/:notificationId/resolve
  // - If FastAPI is enabled and responds OK, proxy response back to client
  // - If FastAPI is disabled or responds non-2xx (e.g., 410 Gone), fall back to the same local resolution logic as /api/v1/conflicts/:id/resolve
  app.post('/api/fastapi/conflicts/:notificationId/resolve', async (req: Request, res: Response) => {
    const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
    const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
    const { notificationId } = req.params;
    const { resolutionType, resolutionNotes, payload } = req.body || {};
    try {
      if (USE_FASTAPI) {
        try {
          const resp = await fetch(`${FASTAPI_BASE_URL}/api/v1/conflicts/${notificationId}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolutionType, resolutionNotes, payload })
          });
          if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            return res.status(resp.status).json(data);
          }
          // Non-2xx: fall through to local fallback
        } catch {
          // Network/other error: fall through to local fallback
        }
      }

      // Local fallback resolution (same logic as /api/v1/conflicts/:id/resolve)
      const conflict = await redisCache.getConflictById(notificationId);
      if (!conflict) {
        return sendError(res, 404, 'Conflict not found');
      }

      const effectivePayload = payload || conflict.record.originalPayload || {};
      if (resolutionType === 'create_shared') {
        const entityType = (conflict.record.entityType || conflict.record.entity_type) as 'table' | 'dag';
        const requestTeam = (effectivePayload.team_name || effectivePayload.team || conflict.record.conflictDetails?.requestedByTeam || conflict.record.team_name || '').toString();
        const tenantName = (effectivePayload.tenant_name || conflict.record.conflictDetails?.tenantName || conflict.record.tenant_name || null) as string | null;
        const serverName = (effectivePayload.server_name || conflict.record.conflictDetails?.serverName || conflict.record.server_name || null) as string | null;
        const entityDisplayName = (effectivePayload.entity_display_name || effectivePayload.dag_name || (effectivePayload.schema_name && effectivePayload.table_name ? `${effectivePayload.schema_name}.${effectivePayload.table_name}` : undefined) || conflict.record.entityName || conflict.record.entity_display_name) as string;

        // Resolve numeric IDs for team and tenant from cache
        let teamId: number | null = null;
        let tenantId: number | null = null;
        try {
          const teams = await redisCache.getAllTeams();
          const tenants = await redisCache.getAllTenants();
          const teamMatch = Array.isArray(teams) ? teams.find((t: any) => (t.name || '').toLowerCase() === (requestTeam || '').toLowerCase()) : null;
          if (teamMatch) {
            teamId = teamMatch.id ?? null;
            tenantId = teamMatch.tenant_id ?? null;
          }
          if (!tenantId && tenantName && Array.isArray(tenants)) {
            const tenantMatch = tenants.find((tn: any) => (tn.name || '').toLowerCase() === (tenantName || '').toLowerCase());
            if (tenantMatch) tenantId = tenantMatch.id ?? null;
          }
        } catch {}

        const slim = {
          entity_type: entityType,
          tenant_name: tenantName,
          tenant_id: tenantId ?? undefined,
          team_name: requestTeam,
          team_id: teamId ?? undefined,
          entity_name: (effectivePayload as any)?.entity_name || (effectivePayload as any)?.name || entityDisplayName,
          entity_display_name: entityDisplayName,
          entity_schedule: effectivePayload?.entity_schedule || effectivePayload?.dag_schedule || effectivePayload?.table_schedule || null,
          expected_runtime_minutes: effectivePayload?.expected_runtime_minutes ?? null,
          is_entity_owner: true,
          is_active: true,
          server_name: serverName,
          last_reported_at: new Date().toISOString(),
        } as any;
        await (redisCache as any).upsertSlimEntity(slim, { broadcast: true });
        try { await (redisCache as any).updateConflictIndexForOwner(slim); } catch {}
        try {
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES, {
            action: 'upsert',
            entityType,
            entityName: entityDisplayName,
            teamName: requestTeam,
            tenantName,
            timestamp: new Date().toISOString(),
          });
        } catch {}
      }

      await redisCache.patchConflict(notificationId, {
        status: (resolutionType === 'reject_shared') ? 'rejected' : 'resolved',
        resolutionType: resolutionType || 'create_shared',
        resolutionNotes: resolutionNotes || '',
        appliedPayload: effectivePayload,
        resolvedAt: new Date().toISOString(),
      });

      return res.json({ message: 'Conflict resolved (fallback)', notificationId });
    } catch (error) {
      return sendError(res, 500, 'Failed to resolve conflict');
    }
  });

  // Express fallback endpoints for alerts (following the correct pattern)
  app.get("/api/alerts", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';
      
      if (redisConnected) {
        // Redis connected: return from Redis or empty if key missing
        const alerts = await redisCache.get('sla:alerts') || [];
        return res.json(alerts);
      }
      
      // Redis not available: return mock alerts from storage
      const alerts = await storage.getActiveAlerts();
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts via Express fallback:", error);
      return sendError(res, 500, 'Failed to fetch alerts');
    }
  });

  app.post("/api/alerts", requireActiveUser, async (req: Request, res: Response) => {
    try {
      
      const newAlert = await storage.createAlert(req.body);
      res.status(201).json({
        success: true,
        message: "Alert created successfully",
        alert: newAlert
      });
    } catch (error) {
      console.error("Error creating alert via Express fallback:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create alert",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.delete("/api/alerts/:id", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const alertId = parseInt(req.params.id);
      
      
      const success = await storage.deactivateAlert(alertId);
      if (!success) {
        return res.status(404).json({ 
          success: false,
          message: "Alert not found" 
        });
      }

      res.json({
        success: true,
        message: "Alert deactivated successfully"
      });
    } catch (error) {
      console.error("Error deactivating alert via Express fallback:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to deactivate alert",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Express fallback endpoints for broadcast messages
  app.post("/api/broadcast-messages", requireActiveUser, async (req: Request, res: Response) => {
    try {
      
      const newMessage = await storage.createAdminBroadcastMessage(req.body);

      // Broadcast to connected clients if delivery type is immediate
      if (newMessage.deliveryType === 'immediate') {
        await redisCache.broadcastAdminMessage({
          id: newMessage.id,
          message: newMessage.message,
          deliveryType: newMessage.deliveryType,
          createdAt: typeof newMessage.createdAt === 'string' ? new Date(newMessage.createdAt) : newMessage.createdAt,
          expiresAt: newMessage.expiresAt ? (typeof newMessage.expiresAt === 'string' ? new Date(newMessage.expiresAt) : newMessage.expiresAt) : null
        });
      }

      res.status(201).json({
        success: true,
        message: "Broadcast message created successfully",
        broadcastMessage: newMessage
      });
    } catch (error) {
      console.error("Error creating broadcast message via Express fallback:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to create broadcast message",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.delete("/api/broadcast-messages/:id", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.id);
      
      
      const success = await storage.deactivateAdminBroadcastMessage(messageId);
      if (!success) {
        return res.status(404).json({ 
          success: false,
          message: "Broadcast message not found" 
        });
      }

      res.json({
        success: true,
        message: "Broadcast message deactivated successfully"
      });
    } catch (error) {
      console.error("Error deactivating broadcast message via Express fallback:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to deactivate broadcast message",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Teams endpoints - using cache (includeInactive toggle for admin)
  app.get("/api/teams", async (req, res) => {
    try {
      const { teamName, includeInactive } = req.query as { teamName?: string; includeInactive?: string };
      const teams = await redisCache.getAllTeams();
      const tenants = await redisCache.getAllTenants();

      const shouldIncludeInactive = includeInactive === 'true';
      
      // Create a map of tenant ID to tenant for quick lookup
      const tenantMap = new Map(tenants.map(tenant => [tenant.id, tenant]));
      
      // Filter teams based on both team active status and tenant active status
      const filteredByActive = shouldIncludeInactive
        ? teams
        : teams.filter(team => {
            // Team must be active
            if (team.isActive === false) return false;
            
            // Team's tenant must also be active (unless includeInactive is true)
            const tenant = tenantMap.get(team.tenant_id);
            if (!tenant || (tenant as any).isActive === false) return false;
            
            return true;
          });

      // Add tenant_name to each team for display purposes
      const teamsWithTenantName = filteredByActive.map(team => {
        const tenant = tenantMap.get(team.tenant_id);
        return {
          ...team,
          tenant_name: tenant?.name || 'Unknown'
        };
      });

      if (teamName) {
        const filteredTeams = teamsWithTenantName.filter(team => team.name === teamName);
        return res.json(filteredTeams);
      }

      return res.json(teamsWithTenantName);
    } catch (error) {
      console.error('Error fetching teams:', error);
      return sendError(res, 500, 'Failed to fetch teams from cache');
    }
  });

  // Tenants endpoints - Redis-first: only show data from Redis when available; fallback to mock storage when Redis is unavailable
  app.get("/api/tenants", async (req, res) => {
    try {
      const { active_only } = req.query;
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';

      let tenants: any[] = [];
      if (redisConnected) {
        // Read strictly from Redis-backed getters; do not fall back to storage when Redis is connected
        tenants = await redisCache.getAllTenants();
      } else {
        // Redis not available: fall back to mock storage
        tenants = await storage.getTenants();
      }

      if (active_only === 'true') {
        tenants = (tenants || []).filter((tenant: any) => tenant.isActive === true);
      }

      res.json(tenants || []);
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch tenants');
    }
  });

  // FastAPI fallback route for admin tenants endpoint - Redis-first with HTTP headers; fallback to mock when Redis unavailable
  app.get("/api/v1/tenants", async (req, res) => {
    try {
      const { active_only } = req.query;
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';
      
      let tenants: any[] = [];
      if (redisConnected) {
        tenants = await redisCache.getAllTenants();
      } else {
        tenants = await storage.getTenants();
      }

      if (active_only === 'true') {
        tenants = (tenants || []).filter((tenant: any) => tenant.isActive === true);
      }

      const lastUpdatedRaw = await (redisCache as any).get ? await (redisCache as any).get('sla:LAST_UPDATED') : null;
      const lastUpdated = lastUpdatedRaw || new Date();
      const version = Date.now();
      res.set({
        'ETag': `W/"tenants:${version}"`,
        'Last-Modified': new Date(lastUpdated).toUTCString(),
        'Cache-Control': 'no-cache'
      });

      res.json(tenants || []);
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch tenants from FastAPI fallback');
    }
  });

  // FastAPI fallback route for creating new tenants
  app.post("/api/v1/tenants", requireActiveUser, async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = adminTenantSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { name, description } = validationResult.data;

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: generate ID from Redis (avoid storage mock counters)
        const existing = await redisCache.getAllTenants();
        const nextId = Array.isArray(existing) && existing.length > 0
          ? Math.max(...existing.map((t: any) => Number(t?.id) || 0)) + 1
          : 1;
        const now = new Date().toISOString();
        const newTenant = {
          id: nextId,
          name,
          description: description || '',
          isActive: true,
          teamsCount: 0,
          createdAt: now,
          updatedAt: now,
        };

        const updatedTenants = Array.isArray(existing) ? [...existing, newTenant] : [newTenant];
        await redisCache.set(CACHE_KEYS.TENANTS, updatedTenants, 6 * 60 * 60);

        // Optionally broadcast tenants cache update
        if (redisCache.broadcastCacheUpdate) {
          try {
            await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TENANTS ?? WEBSOCKET_CONFIG.cacheUpdateTypes.GENERAL, {
              timestamp: now
            });
          } catch {}
        }

        return res.status(201).json(newTenant);
      }

      // In-memory mode: create via storage
      const newTenant = await storage.createTenant({ name, description });

      await redisCache.invalidateCache({
        keys: ['all_tenants', 'tenants_summary'],
        patterns: [
          'tenant_details:*',
          'tenant_teams:*',
          'tenant_metrics:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        mainCacheKeys: ['TENANTS'],
        refreshAffectedData: true
      });

      res.status(201).json(newTenant);
    } catch (error) {
      console.error('Tenant creation error:', error);
      res.status(500).json(createErrorResponse("Failed to create tenant", "creation_error"));
    }
  });
  // FastAPI fallback route for updating tenants
  // PATCH endpoint for tenant updates (FastAPI)
  app.patch("/api/v1/tenants/:tenantId", requireActiveUser, async (req: Request, res: Response) => {
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

      // Update tenant (may cascade to teams if tenant becomes inactive)
      const updatedTenant = await storage.updateTenant(tenantId, updateData);
      if (!updatedTenant) {
        return res.status(404).json(createErrorResponse("Tenant not found", "not_found"));
      }

      // If tenant name changed, propagate to entities so fallback metrics filter by new name
      const beforeTenants = await redisCache.getAllTenants();
      const beforeTenant = beforeTenants.find((t: any) => t.id === tenantId);
      if (updateData.name && beforeTenant && updateData.name !== beforeTenant.name) {
        await storage.updateEntitiesTenantName(tenantId, updateData.name);
      }

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: write directly to Redis
        const existingTenants = await redisCache.getAllTenants();
        const updatedList = Array.isArray(existingTenants)
          ? existingTenants.map((t: any) => (t.id === updatedTenant.id ? updatedTenant : t))
          : [updatedTenant];
        await redisCache.set(CACHE_KEYS.TENANTS, updatedList, 6 * 60 * 60);

        // CASCADE: If tenant became inactive, also update teams in Redis
        let cascaded = false;
        if (beforeTenant && beforeTenant.isActive && updatedTenant.isActive === false) {
          const existingTeams = await redisCache.getAllTeams();
          const updatedTeams = Array.isArray(existingTeams)
            ? existingTeams.map((team: any) => 
                team.tenant_id === updatedTenant.id 
                  ? { ...team, isActive: false, updatedAt: new Date().toISOString() }
                  : team
              )
            : [];
          await redisCache.set(CACHE_KEYS.TEAMS, updatedTeams, 6 * 60 * 60);
          cascaded = true;
        }

        // Broadcast cache updates for tenants, and teams if cascade occurred
        try {
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TENANTS, {
            action: 'update',
            tenantId: updatedTenant.id,
            timestamp: new Date().toISOString()
          });
          if (cascaded) {
            await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_DETAILS, {
              action: 'cascade-inactivate',
              tenantId: updatedTenant.id,
              timestamp: new Date().toISOString()
            });
          }
        } catch {}
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateTenants();
      await redisCache.invalidateCache({
        keys: ['all_tenants', 'tenants_summary'],
        patterns: [
          'tenant_details:*',
          'tenant_teams:*',
          'tenant_metrics:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        // Rebuild TEAMS and METRICS so summaries for the new tenant name are immediately available
        mainCacheKeys: ['TEAMS', 'METRICS'],
        refreshAffectedData: true
      });

      // Broadcast general tenants update (and teams detail to be safe)
      try {
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TENANTS, {
          action: 'update',
          tenantId: updatedTenant.id,
          timestamp: new Date().toISOString()
        });
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_DETAILS, {
          action: 'cascade-inactivate',
          tenantId: updatedTenant.id,
          timestamp: new Date().toISOString()
        });
      } catch {}
      }

      res.json(updatedTenant);
    } catch (error) {
      console.error('Tenant update error:', error);
      res.status(500).json(createErrorResponse("Failed to update tenant", "update_error"));
    }
  });

  // PATCH endpoint for tenant updates (Express fallback)
  app.patch("/api/tenants/:tenantId", requireActiveUser, async (req: Request, res: Response) => {
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

      // Update tenant (may cascade to teams if tenant becomes inactive)
      const updatedTenant = await storage.updateTenant(tenantId, updateData);
      if (!updatedTenant) {
        return res.status(404).json(createErrorResponse("Tenant not found", "not_found"));
      }

      // If tenant name changed, propagate to entities so fallback metrics filter by new name
      const beforeTenants = await redisCache.getAllTenants();
      const beforeTenant = beforeTenants.find((t: any) => t.id === tenantId);
      if (updateData.name && beforeTenant && updateData.name !== beforeTenant.name) {
        await storage.updateEntitiesTenantName(tenantId, updateData.name);
      }

      // Invalidate both tenant and team caches since tenant status/name changes can affect teams
      await redisCache.invalidateTenants();
      await redisCache.invalidateCache({
        keys: ['all_tenants', 'tenants_summary'],
        patterns: [
          'tenant_details:*',
          'tenant_teams:*',
          'tenant_metrics:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        // Rebuild TEAMS and METRICS so summaries for the new tenant name are immediately available
        mainCacheKeys: ['TEAMS', 'METRICS'],
        refreshAffectedData: true
      });

      res.json(updatedTenant);
    } catch (error) {
      console.error('Tenant update error:', error);
      res.status(500).json(createErrorResponse("Failed to update tenant", "update_error"));
    }
  });

  // FastAPI fallback route for getting teams
  app.get("/api/v1/teams", async (req, res) => {
    try {
      const { teamName, includeInactive } = req.query as { teamName?: string; includeInactive?: string };
      const teams = await redisCache.getAllTeams();
      const tenants = await redisCache.getAllTenants();

      const shouldIncludeInactive = includeInactive === 'true';
      
      // Create a map of tenant ID to tenant for quick lookup
      const tenantMap = new Map(tenants.map(tenant => [tenant.id, tenant]));
      
      // Filter teams based on both team active status and tenant active status
      const filteredByActive = shouldIncludeInactive
        ? teams
        : teams.filter(team => {
            // Team must be active
            if (team.isActive === false) return false;
            
            // Team's tenant must also be active (unless includeInactive is true)
            const tenant = tenantMap.get(team.tenant_id);
            if (!tenant || (tenant as any).isActive === false) return false;
            
            return true;
          });

      // Add tenant_name to each team for display purposes
      const teamsWithTenantName = filteredByActive.map(team => {
        const tenant = tenantMap.get(team.tenant_id);
        return {
          ...team,
          tenant_name: tenant?.name || 'Unknown'
        };
      });

      if (teamName) {
        const filteredTeams = teamsWithTenantName.filter(team => team.name === teamName);
        return res.json(filteredTeams);
      }

      return res.json(teamsWithTenantName);
    } catch (error) {
      console.error('Error fetching teams (FastAPI fallback):', error);
      return sendError(res, 500, 'Failed to fetch teams from FastAPI fallback');
    }
  });

  // FastAPI fallback route for creating new teams (Redis-first write)
  app.post("/api/v1/teams", requireActiveUser, async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = insertTeamSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const payload = validationResult.data;

      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: allocate id from Redis
        const existingTeams = await redisCache.getAllTeams();
        const nextId = Array.isArray(existingTeams) && existingTeams.length > 0
          ? Math.max(...existingTeams.map((t: any) => Number(t?.id) || 0)) + 1
          : 1;
        const now = new Date().toISOString();
        const newTeam = {
          id: nextId,
          name: payload.name,
          description: payload.description || '',
          tenant_id: payload.tenant_id,
          isActive: payload.isActive ?? true,
          team_email: payload.team_email || [],
          team_slack: payload.team_slack || [],
          team_pagerduty: payload.team_pagerduty || [],
          team_members_ids: payload.team_members_ids || [],
          createdAt: now,
          updatedAt: now,
        } as any;

        const updatedTeams = Array.isArray(existingTeams) ? [...existingTeams, newTeam] : [newTeam];
        await redisCache.set(CACHE_KEYS.TEAMS, updatedTeams, 6 * 60 * 60);

        // Also update TENANTS cache teamsCount for the team's tenant
        const existingTenants = await redisCache.getAllTenants();
        if (Array.isArray(existingTenants) && existingTenants.length > 0) {
          const updatedTenants = existingTenants.map((t: any) =>
            t.id === newTeam.tenant_id
              ? { ...t, teamsCount: (t.teamsCount || 0) + 1 }
              : t
          );
          await redisCache.set(CACHE_KEYS.TENANTS, updatedTenants, 6 * 60 * 60);
        }

        // Broadcast cache updates inline with other components
        try {
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_DETAILS, {
            action: 'create',
            teamId: newTeam.id,
            teamName: newTeam.name,
            timestamp: new Date().toISOString()
          });
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TENANTS, {
            action: 'team-count-updated',
            tenantId: newTeam.tenant_id,
            timestamp: new Date().toISOString()
          });
        } catch {}

        return res.status(201).json(newTeam);
      }

      // In-memory mode: create via storage
      const newTeam = await storage.createTeam(payload);

      await redisCache.invalidateCache({
        keys: ['all_teams', 'teams_summary', 'all_tenants'],
        patterns: [
          'team_details_*',
          'team_members_*',
          'team_entities:*',
          'team_metrics:*',
          'team_trends:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        mainCacheKeys: ['TEAMS', 'TENANTS'],
        refreshAffectedData: true
      });

      res.status(201).json(newTeam);
    } catch (error) {
      console.error('Team creation error:', error);
      res.status(500).json(createErrorResponse("Failed to create team", "creation_error"));
    }
  });
  // FastAPI fallback route for updating teams (Redis-first write)
  app.put("/api/v1/teams/:teamId", ...(isDevelopment ? [checkActiveUserDev] : [requireActiveUser]), async (req: Request, res: Response) => {
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
      const status = await redisCache.getCacheStatus();

      if (status && status.mode === 'redis') {
        // Redis mode: update Redis directly
        const teams = await redisCache.get(CACHE_KEYS.TEAMS) || [];
        const idx = Array.isArray(teams) ? teams.findIndex((t: any) => t.id === teamId) : -1;
        
        if (idx === -1) {
          return res.status(404).json(createErrorResponse("Team not found", "not_found"));
        }

        const beforeTeam = teams[idx];
        const updatedTeam = {
          ...beforeTeam,
          ...updateData,
          updatedAt: new Date().toISOString()
        };

        // Update the team in Redis
        const newTeams = [...teams];
        newTeams[idx] = updatedTeam;
        await redisCache.set(CACHE_KEYS.TEAMS, newTeams, 6 * 60 * 60);

        // Broadcast WebSocket update
        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_DETAILS, {
          teamId,
          teamName: updatedTeam.name,
          action: 'update',
          timestamp: new Date().toISOString()
        });

        return res.json(updatedTeam);
      }

      // In-memory mode: use storage
      const beforeTeam = await storage.getTeam(teamId);
      const updatedTeam = await storage.updateTeam(teamId, updateData);
      if (!updatedTeam) {
        return res.status(404).json(createErrorResponse("Team not found", "not_found"));
      }

      // If team name changed, propagate to entities so fallback metrics (and Redis keys) match new name
      if (updateData.name && beforeTeam && updateData.name !== beforeTeam.name) {
        await storage.updateEntitiesTeamName(teamId, updateData.name);
        // Invalidate team members/details caches for both old and new names
        await redisCache.invalidateTeamData(beforeTeam.name);
        await redisCache.invalidateTeamData(updateData.name);
        // Invalidate team metrics/trends caches for both old and new names to avoid stale misses
        await redisCache.invalidateTeamMetricsCache(beforeTeam.tenant_id ? String(beforeTeam.tenant_id) : 'UnknownTenant', beforeTeam.name);
        await redisCache.invalidateTeamMetricsCache(beforeTeam.tenant_id ? String(beforeTeam.tenant_id) : 'UnknownTenant', updateData.name);
      }

      // In-memory mode: invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateCache({
        keys: ['all_teams', 'teams_summary', 'all_tenants'],
        patterns: [
            'team_details_*',
            'team_members_*',
          'team_entities:*',
          'team_metrics:*',
          'team_trends:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        mainCacheKeys: ['TEAMS', 'TENANTS'],
        refreshAffectedData: true
      });

      res.json(updatedTeam);
    } catch (error) {
      console.error('Team update error:', error);
      res.status(500).json(createErrorResponse("Failed to update team", "update_error"));
    }
  });
  // Express fallback route for updating teams (for frontend fallback mechanism)
  app.put("/api/teams/:teamId", ...(isDevelopment ? [checkActiveUserDev] : [requireActiveUser]), async (req: Request, res: Response) => {
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
      const beforeTeam2 = await storage.getTeam(teamId);
      const updatedTeam = await storage.updateTeam(teamId, updateData);
      if (!updatedTeam) {
        return res.status(404).json(createErrorResponse("Team not found", "not_found"));
      }

      // If team name changed, propagate to entities so fallback metrics (and Redis keys) match new name
      if (updateData.name && beforeTeam2 && updateData.name !== beforeTeam2.name) {
        await storage.updateEntitiesTeamName(teamId, updateData.name);
        await redisCache.invalidateTeamData(beforeTeam2.name);
        await redisCache.invalidateTeamData(updateData.name);
        await redisCache.invalidateTeamMetricsCache(beforeTeam2.tenant_id ? String(beforeTeam2.tenant_id) : 'UnknownTenant', beforeTeam2.name);
        await redisCache.invalidateTeamMetricsCache(beforeTeam2.tenant_id ? String(beforeTeam2.tenant_id) : 'UnknownTenant', updateData.name);
      }

      // Invalidate all team-related caches
      await redisCache.invalidateCache({
        keys: ['all_teams', 'teams_summary', 'all_tenants'],
        patterns: [
          'team_details_*',  // Fixed: use underscore to match actual cache keys
          'team_members_*',   // Fixed: use underscore to match actual cache keys
          'team_entities:*',
          'team_metrics:*',
          'team_trends:*',
          'dashboard_summary:*',
          'entities:*'
        ],
        mainCacheKeys: ['TEAMS', 'TENANTS'],
        refreshAffectedData: true
      });

      // Explicitly invalidate tenants cache to ensure team count updates
      await redisCache.invalidateTenants();

      res.json(updatedTeam);
    } catch (error) {
      console.error('Team update error:', error);
      res.status(500).json(createErrorResponse("Failed to update team", "update_error"));
    }
  });
  // FastAPI fallback route for getting entities (with teamId support)
  // 
  // ⚠️  FASTAPI SERVICE REQUIREMENT ⚠️
  // The external FastAPI service MUST implement this exact endpoint with identical filtering logic:
  // 
  // GET /api/v1/entities?teamId={teamId}
  // - Should return ALL entities for the team (both active and inactive entities)
  // - Team dashboard should show all entities for visibility and management
  // - This is used by Team Dashboard for entity counts and tables
  //
  // GET /api/v1/entities?tenant={tenant} (Summary Dashboard)
  // - Should filter by: WHERE tenant_name = {tenant} AND is_entity_owner = true AND is_active != false
  // - This is used by Summary Dashboard for entity counts
  //
  app.get("/api/v1/entities", async (req, res) => {
    try {
      
      
      const { teamId, type, tenant } = req.query;
      // Prevent stale 304 Not Modified responses for entity lists
      res.removeHeader('ETag');
      res.removeHeader('Last-Modified');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      // Force a unique ETag per response so conditional GETs don't return 304
      res.setHeader('ETag', `${Date.now()}`);
      
      let entities: any[];
      
      if (teamId) {
        const teamIdNum = parseInt(teamId as string);
        if (isNaN(teamIdNum)) {
          return res.status(400).json(createErrorResponse("Invalid team ID", "validation_error"));
        }
        entities = await redisCache.getEntitiesForApi({ teamId: teamIdNum });
        console.log(`GET /api/v1/entities - Parameters: teamId=${teamId} - status: 200`);
      } else if (type) {
        entities = await redisCache.getEntitiesForApi({ type: type as any });
        console.log(`GET /api/v1/entities - Parameters: type=${type} - status: 200`);
      } else if (tenant) {
        // Summary Dashboard: only active entity owners, and only from active teams
        const tenantNameStr = String(tenant);
        const [allEntities, teams] = await Promise.all([
          redisCache.getEntitiesForApi({ tenantName: tenantNameStr }),
          redisCache.getAllTeams(),
        ]);
          const activeTeamIds = new Set<number>(teams.filter((t: any) => (t as any).isActive !== false).map((t: any) => t.id));
        entities = allEntities.filter((e: any) => (
          e.tenant_name === tenantNameStr &&
          e.is_entity_owner === true &&
          e.is_active !== false &&
          activeTeamIds.has((e.teamId ?? e.team_id) as number)
        ));
          console.log(`GET /api/v1/entities - Parameters: tenant=${tenant} - status: 200`);
        } else {
        entities = await redisCache.getEntitiesForApi({});
          console.log(`GET /api/v1/entities - status: 200`);
      }
      
      res.json(entities);
    } catch (error) {
      console.error('FastAPI fallback GET /api/v1/entities error:', error);
      res.status(500).json(createErrorResponse("Failed to get entities", "server_error"));
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
      return sendError(res, 500, 'Failed to fetch teams for debug');
    }
  });

  // Scheduler endpoint for incremental entity updates
  app.post("/api/scheduler/entity-updates", validateSchedulerToken, async (req: Request, res: Response) => {
    try {
      const { changes } = req.body;
      
      if (!Array.isArray(changes) || changes.length === 0) {
        return res.status(400).json(createErrorResponse('Invalid payload: changes array required', 'validation_error'));
      }

      structuredLogger.info('SCHEDULER_UPDATE_RECEIVED', req.sessionContext, req.requestId, {
        logger: 'app.scheduler',
        status_code: 200
      });

      const updateResults: any[] = [];
      const affectedTeams = new Set<string>();

      // Process each entity change
      for (const change of changes) {
        const { entity_type, entity_name, ...updates } = change;
        
        if (!entity_type || !entity_name) {
          updateResults.push({ 
            entity_type, 
            entity_name, 
            status: 'skipped', 
            reason: 'Missing entity_type or entity_name' 
          });
          continue;
        }

        try {
          // Get all entities from cache
          const allEntities = await redisCache.getAllEntities();
          const entity = allEntities.find(
            (e: Entity) => e.type === entity_type && e.name === entity_name
          );

          if (!entity) {
            updateResults.push({ 
              entity_type, 
              entity_name, 
              status: 'not_found' 
            });
            continue;
          }

          // Update entity with new data + set lastRefreshed to trigger NEW badge
          const updatedEntity = await redisCache.updateEntityById(entity.id, {
            ...updates,
            lastRefreshed: new Date() // Triggers NEW badge for 6 hours
          });

          if (updatedEntity) {
            // Track affected team for cache invalidation
            if (entity.team_name) {
              affectedTeams.add(entity.team_name);
            }

            updateResults.push({ 
              entity_type, 
              entity_name, 
              status: 'updated',
              id: entity.id
            });
          } else {
            updateResults.push({ 
              entity_type, 
              entity_name, 
              status: 'update_failed' 
            });
          }
        } catch (error) {
          console.error(`Scheduler update error for ${entity_type}/${entity_name}:`, error);
          updateResults.push({ 
            entity_type, 
            entity_name, 
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Invalidate team caches for all affected teams
      const affectedTeamsArray = Array.from(affectedTeams);
      for (const teamName of affectedTeamsArray) {
        try {
          await redisCache.invalidateTeamData(teamName);
        } catch (error) {
          console.error(`Failed to invalidate team cache for ${teamName}:`, error);
        }
      }

      // Broadcast entity updates to all connected clients (reuse existing infrastructure)
      // Use the same pattern as rollback to notify all clients of entity changes
      const updatedResults = updateResults.filter(r => r.status === 'updated');
      for (const result of updatedResults) {
        const allEntities = await redisCache.getAllEntities();
        const entity = allEntities.find((e: Entity) => e.id === result.id);
        
        if (entity) {
          await redisCache.broadcastEntityRollback({
            entityId: result.id.toString(),
            entityName: result.entity_name,
            entityType: result.entity_type,
            teamName: entity.team_name || '',
            tenantName: entity.tenant_name || '',
            toVersion: 0, // Not applicable for scheduler updates
            userEmail: 'scheduler@system',
            reason: 'Scheduled incremental update'
          });
        }
      }

      structuredLogger.info('SCHEDULER_UPDATE_COMPLETED', req.sessionContext, req.requestId, {
        logger: 'app.scheduler',
        status_code: 200
      });

      res.json({
        success: true,
        processed: changes.length,
        results: updateResults,
        affectedTeams: Array.from(affectedTeams),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Scheduler update endpoint error:', error);
      structuredLogger.error('SCHEDULER_UPDATE_ERROR', req.sessionContext, req.requestId, {
        logger: 'app.scheduler'
      });
      res.status(500).json(createErrorResponse('Failed to process scheduler updates', 'server_error'));
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
      return sendError(res, 500, 'Failed to get cache status');
    }
  });

  app.post("/api/cache/refresh", checkActiveUserDev, async (req, res) => {
    try {
      await redisCache.forceRefresh();
      res.json({ message: "Cache refreshed successfully" });
    } catch (error) {
      return sendError(res, 500, 'Failed to refresh cache');
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
  //
  // ⚠️  FASTAPI SERVICE REQUIREMENT ⚠️
  // The external FastAPI service MUST implement this exact endpoint:
  // 
  // GET /api/dashboard/summary?tenant={tenant}&team={team}&startDate={date}&endDate={date}
  // 
  // Team Dashboard (team parameter provided):
  // - Should calculate metrics from ALL active entities: WHERE is_active != false
  // - Entity counts should include both entity owners and non-owners
  // 
  // Summary Dashboard (no team parameter):
  // - Should calculate metrics from entity owners only: WHERE is_entity_owner = true AND is_active != false
  // - Entity counts should include only active entity owners
  //
  app.get("/api/dashboard/summary", async (req, res) => {
    try {
      // Wait for cache initialization to prevent race conditions on startup
      await redisCache.waitForInitialization();
      
      const tenantName = req.query.tenant as string;
      const teamName = req.query.team as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!tenantName) {
        return sendError(res, 400, 'Tenant parameter is required');
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
          return sendError(res, 404, `No data found for the specified ${scope} and range`);
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
          return sendError(res, 404, `No data found for the specified ${scope} and date range`);
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
        return sendError(res, 404, 'No data found for the specified tenant');
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
  // GET /api/dashboard/presets - Load all preset ranges in one call for efficient caching
  app.get("/api/dashboard/presets", async (req, res) => {
    try {
      const tenantName = req.query.tenant as string;
      const teamName = req.query.team as string;
      
      if (!tenantName) {
        return sendError(res, 400, 'Tenant parameter is required');
      }
      
      const isTeamDashboard = teamName && teamName !== '0';
      
      // Import centralized preset configuration
      const { getPresetKeys } = await import('../shared/preset-ranges.js');
      const ranges = getPresetKeys();
      
      const presets: Record<string, { metrics: any; complianceTrends: any }> = {};
      
      // Load all preset ranges from cache
      for (const range of ranges) {
        let metrics, complianceTrends;
        
        if (isTeamDashboard) {
          // Team Dashboard: Get team-specific cached data for each range
          metrics = await redisCache.getTeamMetricsByRange(tenantName, teamName, range);
          complianceTrends = await redisCache.getTeamTrendsByRange(tenantName, teamName, range);
        } else {
          // Summary Dashboard: Get tenant-level cached data for each range
          metrics = await redisCache.getMetricsByTenantAndRange(tenantName, range);
          complianceTrends = await redisCache.getComplianceTrendsByTenantAndRange(tenantName, range);
        }
        
        presets[range] = {
          metrics: metrics || null,
          complianceTrends: complianceTrends || null
        };
      }
      
      const scope = isTeamDashboard ? `team=${teamName}` : 'tenant-wide';
      console.log(`GET /api/dashboard/presets - Loaded ${ranges.length} presets for tenant=${tenantName}, ${scope} - status: 200`);
      
      res.json({
        presets,
        lastUpdated: new Date(),
        cached: true,
        scope: isTeamDashboard ? 'team' : 'tenant'
      });
    } catch (error) {
      console.error('Dashboard presets error:', error);
      res.status(500).json({ 
        message: "Failed to fetch dashboard presets from cache",
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  // FastAPI-style alias: Get team members (development fallback) - Redis-first
  app.get("/api/v1/get_team_members/:teamName", async (req, res) => {
    try {
      const { teamName } = req.params;
      const status = await redisCache.getCacheStatus();

      if (status && status.mode === 'redis') {
        const tenantName = req.query.tenant as string;
        const teams = await redisCache.get(CACHE_KEYS.TEAMS) || [];
        const tenants = await redisCache.get(CACHE_KEYS.TENANTS) || [];
        const users = await redisCache.getAllUsersFromHash() || [];
        let team: any = null;
        if (tenantName && Array.isArray(tenants) && tenants.length > 0) {
          const tnt = tenants.find((tn: any) => tn?.name === tenantName);
          if (tnt) team = Array.isArray(teams) ? teams.find((t: any) => t?.name === teamName && t?.tenant_id === tnt.id) : null;
        }
        if (!team) team = Array.isArray(teams) ? teams.find((t: any) => t?.name === teamName) : null;

        const memberIds: string[] = (team?.team_members_ids && Array.isArray(team.team_members_ids))
          ? team.team_members_ids
          : [];

        const members = memberIds
          .map((memberKey: string) => {
            const u = Array.isArray(users)
              ? users.find((usr: any) => usr?.username === memberKey || String(usr?.id) === String(memberKey))
              : null;
            if (!u) return null; // drop unresolved mock references
            return {
              id: u.id,
              name: u.username,
              username: u.username,
              displayName: u.displayName || u.username,
              email: u.email || '',
              user_slack: u.user_slack || [],
              user_pagerduty: u.user_pagerduty || [],
              is_active: u.is_active !== false,
            };
          })
          .filter(Boolean);

        return res.json(members);
      }

      const members = await storage.getTeamMembers(teamName);
      res.json(members);
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch team members');
    }
  });

  // Get all users endpoint - Redis-first; fallback to mock when Redis unavailable
  app.get("/api/get_user", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      
      if (status.connected) {
        // Redis mode: read from users hash
        const cachedUsers = await redisCache.getAllUsersFromHash();
        res.json(cachedUsers || []);
      } else {
        // In-memory mode: fallback to storage
        const users = await storage.getUsers();
      res.json(users);
      }
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch users');
    }
  });

  // FastAPI-style alias: Get all users (development fallback) - Redis-first; fallback to mock when Redis unavailable
  app.get("/api/v1/get_user", async (req, res) => {
    try {
      const status = await redisCache.getCacheStatus();
      
      if (status.connected) {
        // Redis mode: read from users hash
        const cachedUsers = await redisCache.getAllUsersFromHash();
        res.json(cachedUsers || []);
      } else {
        // In-memory mode: fallback to storage
        const users = await storage.getUsers();
      res.json(users);
      }
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch users');
    }
  });

  // Team member management endpoints (development fallback, check active status only)
  app.post("/api/teams/:teamName/members", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { teamName } = req.params;
      const tenantFromQuery = req.query.tenant as string;
      
      // Simple validation for team member operations - match frontend exactly
      const memberSchema = z.object({
        action: z.enum(['add', 'remove', 'update']),
        memberId: z.union([z.string(), z.number()]).transform(String), // Accept both string and number, convert to string
        member: z.any().optional()
      });
      
      const result = memberSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid team member data", 
          errors: result.error.format() 
        });
      }
      
      const memberData = req.body;

      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: update Redis directly
        const teams = await redisCache.get(CACHE_KEYS.TEAMS) || [];
        const tenants = await redisCache.get(CACHE_KEYS.TENANTS) || [];
        let idx = -1;
        if (tenantFromQuery && Array.isArray(tenants) && tenants.length > 0) {
          const tnt = tenants.find((tn: any) => tn?.name === tenantFromQuery);
          if (tnt) idx = Array.isArray(teams) ? teams.findIndex((t: any) => t?.name === teamName && t?.tenant_id === tnt.id) : -1;
        }
        if (idx === -1) idx = Array.isArray(teams) ? teams.findIndex((t: any) => t?.name === teamName) : -1;
        if (idx === -1) return sendError(res, 404, 'Team not found');

        const team = teams[idx];
        const ids: string[] = Array.isArray(team.team_members_ids) ? [...team.team_members_ids] : [];
        let updated = ids;
        if (memberData.action === 'add') {
          if (!ids.includes(String(memberData.memberId))) updated = [...ids, String(memberData.memberId)];
        } else if (memberData.action === 'remove') {
          updated = ids.filter((id: string) => id !== String(memberData.memberId));
        }
        const newTeam = { ...team, team_members_ids: updated };
        const newTeams = [...teams];
        newTeams[idx] = newTeam;
        await redisCache.set(CACHE_KEYS.TEAMS, newTeams, 6 * 60 * 60);

        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_MEMBERS, {
          teamName,
          tenantName: tenantFromQuery || (team as any)?.tenant_name,
          action: memberData.action,
          memberId: memberData.memberId
        });

        return res.json({ success: true });
      }

      // In-memory mode: use storage
      const oauthContext = {
        team: teamName,
        tenant: tenantFromQuery || (Array.isArray(req.headers['x-tenant']) ? req.headers['x-tenant'][0] : req.headers['x-tenant']) || 'Data Engineering',
        username: (Array.isArray(req.headers['x-username']) ? req.headers['x-username'][0] : req.headers['x-username']) || 'azure_test_user'
      };

      const updatedTeam = await storage.updateTeamMembers(teamName, memberData, oauthContext);
      
      if (!updatedTeam) {
        return sendError(res, 404, 'Team not found');
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
      console.error('Team member update error:', error);
      console.error('Request body:', req.body);
      console.error('Team name:', req.params.teamName);
      res.status(500).json({ 
        message: "Failed to update team members", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  // FastAPI-style alias for team member management (v1)
  app.post("/api/v1/teams/:teamName/members", checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { teamName } = req.params;
      const tenantFromQuery = req.query.tenant as string;

      const memberSchema = z.object({
        action: z.enum(['add', 'remove', 'update']),
        memberId: z.union([z.string(), z.number()]).transform(String),
        member: z.any().optional()
      });

      const result = memberSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json(createValidationErrorResponse(result.error));
      }

      const memberData = req.body;

      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        const teams = await redisCache.get(CACHE_KEYS.TEAMS) || [];
        const tenants = await redisCache.get(CACHE_KEYS.TENANTS) || [];
        let idx = -1;
        if (tenantFromQuery && Array.isArray(tenants) && tenants.length > 0) {
          const tnt = tenants.find((tn: any) => tn?.name === tenantFromQuery);
          if (tnt) idx = Array.isArray(teams) ? teams.findIndex((t: any) => t?.name === teamName && t?.tenant_id === tnt.id) : -1;
        }
        if (idx === -1) idx = Array.isArray(teams) ? teams.findIndex((t: any) => t?.name === teamName) : -1;
        if (idx === -1) return sendError(res, 404, 'Team not found');

        const team = teams[idx];
        const ids: string[] = Array.isArray(team.team_members_ids) ? [...team.team_members_ids] : [];
        let updated = ids;
        if (memberData.action === 'add') {
          if (!ids.includes(String(memberData.memberId))) updated = [...ids, String(memberData.memberId)];
        } else if (memberData.action === 'remove') {
          updated = ids.filter((id: string) => id !== String(memberData.memberId));
        }
        const newTeam = { ...team, team_members_ids: updated };
        const newTeams = [...teams];
        newTeams[idx] = newTeam;
        await redisCache.set(CACHE_KEYS.TEAMS, newTeams, 6 * 60 * 60);

        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.TEAM_MEMBERS, {
          teamName,
          tenantName: tenantFromQuery || (team as any)?.tenant_name,
          action: memberData.action,
          memberId: memberData.memberId
        });

        return res.json({ success: true });
      }

      const updatedTeam = await storage.updateTeamMembers(teamName, memberData, {
        team: teamName,
        tenant: tenantFromQuery || 'Data Engineering',
        username: 'azure_test_user'
      });
      if (!updatedTeam) return sendError(res, 404, 'Team not found');
      await redisCache.invalidateTeamData(teamName, {
        action: memberData.action,
        memberId: memberData.memberId,
        memberName: memberData.member?.name || memberData.member?.username,
        tenantName: tenantFromQuery
      });
      return res.json({ success: true });
    } catch (error) {
      return sendError(res, 500, 'Failed to update team members');
    }
  });
  
  // Entities endpoint - Redis-first slim + compliance enriched
  app.get("/api/entities", async (req, res) => {
    try {
      res.removeHeader('ETag');
      res.removeHeader('Last-Modified');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      const teamId = req.query.teamId ? parseInt(String(req.query.teamId)) : undefined;
      const type = (req.query.type as 'table' | 'dag' | undefined) || undefined;
      const tenantName = (req.query.tenant as string | undefined) || undefined;
      const dateFilter = (req.query.date_filter as string | undefined) || undefined;

      const entities = await redisCache.getEntitiesForApi({
        tenantName,
        teamId,
        type,
        dateFilter,
      });

      if (req.query.include_metadata === 'true') {
        return res.json({ data: entities, meta: { count: entities.length } });
      }
      return res.json(entities);
    } catch (error) {
      return sendError(res, 500, 'Failed to fetch entities');
    }
  });

  // Search owner reference options from Redis index (Redis-first)
  app.get('/api/entities/owner-reference-options', async (req: Request, res: Response) => {
    try {
      const type = String(req.query.type || '').toLowerCase();
        if (type !== 'table' && type !== 'dag') {
        return sendError(res, 400, 'Invalid type. Expected "table" or "dag"');
      }
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : 50;
      const names = await redisCache.searchOwnerEntitiesByType(type as 'table' | 'dag', q, limit);
      // Prevent caching so newly created owners appear immediately
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      return res.json(names);
    } catch (error: any) {
      console.error('owner-reference-options error:', error);
      return sendError(res, 500, 'Failed to load owner reference options');
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
        return sendError(res, 400, 'Invalid team_id parameter');
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
      return sendError(res, 500, 'Failed to fetch entities for custom date range');
    }
  });
  // Create entity - bypass auth in development for testing
  app.post("/api/entities", ...(isDevelopment ? [checkActiveUserDev] : requireActiveUser), async (req: Request, res: Response) => {
    try {
      // For entity creation, prune client fluff to a canonical payload before validation
      const raw = req.body || {};
      // Accept entity_type or type
      const incomingType = ((raw as any).entity_type || raw.type) === 'dag' ? 'dag' : (((raw as any).entity_type || raw.type) === 'table' ? 'table' : 'dag');
      const canonical: any = {
        type: incomingType,
        tenant_name: raw.tenant_name,
        team_name: raw.team_name,
        is_entity_owner: raw.is_entity_owner !== false,
        expected_runtime_minutes: raw.expected_runtime_minutes ?? null,
        server_name: raw.server_name ?? null,
        owner_email: (raw.is_entity_owner === false) ? null : (raw.owner_email ?? raw.user_email ?? null),
        user_email: raw.user_email ?? null,
      };
      if (incomingType === 'dag') {
        canonical.entity_name = raw.entity_name || raw.name || raw.dag_name;
        canonical.entity_display_name = raw.entity_display_name || raw.dag_name || canonical.entity_name;
        canonical.dag_name = raw.dag_name || canonical.entity_display_name;
        canonical.dag_schedule = raw.dag_schedule || raw.entity_schedule || null;
        canonical.owner_entity_ref_name = raw.owner_entity_ref_name || raw.owner_entity_reference || '';
      } else {
        canonical.entity_name = raw.entity_name || raw.name || raw.table_name;
        canonical.entity_display_name = raw.entity_display_name || raw.table_name || canonical.entity_name;
        canonical.schema_name = raw.schema_name ?? null;
        canonical.table_name = raw.table_name || canonical.entity_display_name;
        canonical.table_schedule = raw.table_schedule || raw.entity_schedule || null;
        canonical.owner_entity_ref_name = raw.owner_entity_ref_name || raw.owner_entity_reference || '';
      }
      // Validate using lightweight API schema to avoid legacy fields
      const result = apiEntitySchema.safeParse({ ...canonical, entity_type: incomingType });
      
      if (!result.success) {
        return res.status(400).json(createValidationErrorResponse(result.error));
      }
      
      // Normalize payload with team/tenant metadata to avoid cross-team leakage
      const payload = { ...canonical } as any;
      const status = await redisCache.getCacheStatus();

      try {
        // Resolve team and tenant data from Redis or storage depending on mode
        if (status && status.mode === 'redis') {
          // Redis mode: resolve from Redis
          const teams = await redisCache.get(CACHE_KEYS.TEAMS) || [];
          const tenants = await redisCache.get(CACHE_KEYS.TENANTS) || [];

          // If teamId is missing but team_name provided, resolve teamId
          if (!payload.teamId && payload.team_name) {
            const teamByName = Array.isArray(teams) ? teams.find((t: any) => t.name === payload.team_name) : null;
            if (teamByName) {
              payload.teamId = teamByName.id;
              payload.team_name = teamByName.name;
              // Resolve tenant name from team
              const tenant = Array.isArray(tenants) ? tenants.find((t: any) => t.id === teamByName.tenant_id) : null;
              if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
            }
          }

          // If teamId exists, ensure team_name and tenant_name are set from canonical source
          if (payload.teamId) {
            const team = Array.isArray(teams) ? teams.find((t: any) => t.id === payload.teamId) : null;
            if (team) {
              payload.team_name = payload.team_name || team.name;
              const tenant = Array.isArray(tenants) ? tenants.find((t: any) => t.id === team.tenant_id) : null;
              if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
            }
          }
        } else {
          // In-memory mode: resolve from storage
        // If teamId is missing but team_name provided, resolve teamId
        if (!payload.teamId && payload.team_name) {
          const teamByName = await storage.getTeamByName(payload.team_name);
          if (teamByName) {
            payload.teamId = teamByName.id;
            payload.team_name = teamByName.name;
            // Resolve tenant name from team
            const tenants = await storage.getTenants();
            const tenant = tenants.find(t => t.id === teamByName.tenant_id);
            if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
          }
        }

        // If teamId exists, ensure team_name and tenant_name are set from canonical source
        if (payload.teamId) {
          const team = await storage.getTeam(payload.teamId);
          if (team) {
            payload.team_name = payload.team_name || team.name;
            const tenants = await storage.getTenants();
            const tenant = tenants.find(t => t.id === team.tenant_id);
            if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
            }
          }
        }
      } catch (_err) {
        // Non-fatal: if lookup fails we proceed with provided values
      }

      // If not entity owner, require and validate owner_entity_ref_name/owner_entity_reference strictly (entity_name + entity_type, case-insensitive)
      try {
        const isOwner = payload.is_entity_owner === true;
        const refName = typeof (payload as any).owner_entity_ref_name === 'string'
          ? (payload as any).owner_entity_ref_name.trim()
          : (typeof (payload as any).owner_entity_reference === 'string' ? (payload as any).owner_entity_reference.trim() : undefined);
        if (!isOwner) {
          if (!refName) {
            return sendError(res, 400, 'owner_entity_ref_name is required when is_entity_owner is false');
          }
          const refType: 'table' | 'dag' = ((payload as any).type === 'table' || (payload as any).entity_type === 'table') ? 'table' : 'dag';
          const matches = await redisCache.findSlimEntitiesByNameCI(refName, refType);
          if (!matches || matches.length === 0) {
            return sendError(res, 404, `Owner Entity Reference not found: ${refName}`);
          }
          // Populate owner_entity_ref_name from the first match (team/tenant context can refine later)
          const m = matches[0];
          payload.owner_entity_ref_name = {
            entity_owner_name: m.entity_name,
            entity_owner_tenant_id: m.tenant_id ?? null,
            entity_owner_tenant_name: m.tenant_name ?? null,
            entity_owner_team_id: m.team_id ?? null,
            entity_owner_team_name: m.team_name ?? null,
          };
          // Also carry through owner_entity_reference for downstream persistence/backward compatibility
          payload.owner_entity_reference = refName;
          // Always align schedule/runtime to the referenced owner entity for non-owners
          if ((m as any).entity_schedule) payload.entity_schedule = (m as any).entity_schedule;
          if ((m as any).expected_runtime_minutes != null) payload.expected_runtime_minutes = (m as any).expected_runtime_minutes;
        }
      } catch {}

      // Pre-check ownership conflict for owner entities (before creating)
      try {
        if (payload.is_entity_owner === true && payload.team_name && payload.tenant_name) {
          const serverName = payload.server_name ?? null;
          // Prefer schema.table form for tables to match conflict index keys
          const displayName = (
            (payload.schema_name && payload.table_name ? `${payload.schema_name}.${payload.table_name}` : undefined)
            || payload.dag_name
            || payload.entity_name
            || payload.entity_display_name
          );
          if (displayName) {
            const conflict = await redisCache.checkOwnershipConflict({
              tenant_name: payload.tenant_name,
              team_name: payload.team_name,
              entity_display_name: displayName,
              server_name: serverName
            });
            if (!conflict.allow) {
              // Attempt to POST conflict to FastAPI; on failure, append to Redis
              try {
                const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
                const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
                if (USE_FASTAPI) {
                  const entityType = (payload.type === 'table' ? 'table' : 'dag');
                  const owners = Array.isArray(conflict.owners) ? conflict.owners : [];
                  const conflictingTeams = [payload.team_name, ...owners].filter(Boolean);
                  const dedupTeams = conflictingTeams.filter((t: string, i: number, arr: string[]) => arr.findIndex(x => (x||'').toLowerCase() === (t||'').toLowerCase()) === i);
                  const body = {
                    entityType,
                    entityName: displayName,
                    conflictingTeams: dedupTeams,
                    originalPayload: { ...sanitizeEntityPayloadForConflict(req.body), action_type: 'add' },
                    conflictDetails: {
                      existingOwner: owners.join(', ') || 'Unknown',
                      requestedBy: req.user?.email || req.body?.action_by_user_email || req.body?.user_email || null,
                      tenantName: payload.tenant_name || null,
                      serverName: serverName ?? null,
                      reason: 'Ownership conflict detected',
                    },
                  };
                  // Optimistic temp ID: create a local temp record, then replace when FastAPI returns
                  const tempId = `temp-${Date.now()}`;
                  await redisCache.appendConflictRecord({
                    notificationId: tempId,
                    entity_type: entityType,
                    entity_display_name: displayName,
                    team_name: payload.team_name,
                    tenant_name: payload.tenant_name,
                    server_name: serverName,
                    owners,
                    originalPayload: { ...sanitizeEntityPayloadForConflict(req.body), action_type: 'add' },
                    action_by_user_email: req.user?.email || req.body?.action_by_user_email || req.body?.user_email || null,
                  });
                  // appendConflictRecord already broadcasts, no need for duplicate broadcast here
                  const resp = await fetch(`${FASTAPI_BASE_URL}/api/v1/conflicts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  if (resp.ok) {
                    const data = await resp.json().catch(() => null);
                    const officialId = data?.notificationId || data?.id || null;
                    if (officialId) {
                      await redisCache.replaceConflictNotificationId(tempId, officialId);
                      // Broadcast ID update after replacement
                      try {
                        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.CONFLICTS, {
                          action: 'update',
                          id: officialId,
                          timestamp: new Date().toISOString(),
                        });
                      } catch {}
                    }
                  }
                } else {
                  // Fallback to Redis-only recording
                  await redisCache.appendConflictRecord({
                    action: 'create',
                    tenant_name: payload.tenant_name,
                    team_name: payload.team_name,
                    entity_display_name: displayName,
                    server_name: serverName,
                    owners: conflict.owners,
                    entity_type: (payload.type === 'table' ? 'table' : 'dag'),
                    action_by_user_email: req.user?.email || req.body?.action_by_user_email || req.body?.user_email || null,
                    originalPayload: { ...sanitizeEntityPayloadForConflict(req.body), action_type: 'add' },
                  });
                  // appendConflictRecord already broadcasts
                }
              } catch {
                // Best-effort fallback to Redis log
                await redisCache.appendConflictRecord({
                  action: 'create',
                  tenant_name: payload.tenant_name,
                  team_name: payload.team_name,
                  entity_display_name: displayName,
                  server_name: serverName,
                  owners: conflict.owners,
                  entity_type: (payload.type === 'table' ? 'table' : 'dag'),
                  action_by_user_email: req.user?.email || req.body?.action_by_user_email || req.body?.user_email || null,
                  originalPayload: { ...sanitizeEntityPayloadForConflict(req.body), action_type: 'add' },
                });
                // appendConflictRecord already broadcasts
              }
              const ownersList = (conflict.owners || []).join(', ');
              return res.status(409).json(createErrorResponse(`Ownership conflict detected. Current owner(s): ${ownersList}. Please contact an admin for resolution.`, 'conflict'));
            }
          }
        }
      } catch {}

      // Create entity (automatically handles Redis vs storage based on mode)
      const entity = await redisCache.createEntity(payload);
      
      // Update cache based on mode
      if (status && status.mode === 'redis') {
        // Redis mode: entity is already in Redis, just clear derived caches and broadcast
      await redisCache.invalidateCache({
        keys: ['all_entities', 'entities_summary'],
        patterns: [
          'entity_details:*',
          'team_entities:*',
          'entities_team_*',
          'dashboard_summary:*'
        ],
          mainCacheKeys: [], // Don't refresh main cache in Redis mode
          refreshAffectedData: false
        });
      } else {
        // In-memory mode: invalidate and refresh from storage
        await redisCache.invalidateCache({
          keys: ['all_entities', 'entities_summary'],
          patterns: [
            'entity_details:*',
            'team_entities:*',
            'entities_team_*',
            'dashboard_summary:*'
          ],
        mainCacheKeys: ['ENTITIES', 'METRICS'],
        refreshAffectedData: true
      });
      
      // Force immediate cache refresh for this team's entities
      if (entity.teamId) {
        await redisCache.invalidateCache({
          patterns: [`entities_team_${entity.teamId}:*`],
          refreshAffectedData: true
        });
        }
      }
      
      // Clear ETag cache for team-specific queries
      res.removeHeader('ETag');
      res.removeHeader('Last-Modified');
      
      res.status(201).json(entity);
    } catch (error) {
      return sendError(res, 500, 'Failed to create entity');
    }
  });
  // Transactional bulk create (all-or-nothing) for Express fallback - bypass auth in development
  app.post('/api/entities/bulk', ...(isDevelopment ? [checkActiveUserDev] : requireActiveUser), async (req: Request, res: Response) => {
    try {
      const items = Array.isArray(req.body) ? req.body : [];
      if (items.length === 0) {
        return sendError(res, 400, 'Invalid payload - expected non-empty array');
      }

      const created: any[] = [];
      const status = await redisCache.getCacheStatus();

      for (const raw of items) {
        // Build the same canonical payload as single create endpoint
        const incomingType = ((raw as any).entity_type || (raw as any).type) === 'dag' ? 'dag' : (((raw as any).entity_type || (raw as any).type) === 'table' ? 'table' : 'dag');
        const canonical: any = {
          type: incomingType,
          tenant_name: (raw as any).tenant_name,
          team_name: (raw as any).team_name,
          is_entity_owner: (raw as any).is_entity_owner !== false,
          expected_runtime_minutes: (raw as any).expected_runtime_minutes ?? null,
          server_name: (raw as any).server_name ?? null,
          owner_email: ((raw as any).is_entity_owner === false) ? null : ((raw as any).owner_email ?? (raw as any).user_email ?? null),
          user_email: (raw as any).action_by_user_email ?? (raw as any).user_email ?? null,
          is_active: (raw as any).is_active ?? true,
        };
        if (incomingType === 'dag') {
          canonical.entity_name = (raw as any).entity_name || (raw as any).name || (raw as any).dag_name;
          canonical.entity_display_name = (raw as any).entity_display_name || (raw as any).dag_name || canonical.entity_name;
          canonical.dag_name = (raw as any).dag_name || canonical.entity_display_name;
          canonical.dag_schedule = (raw as any).dag_schedule || (raw as any).entity_schedule || null;
          canonical.dag_description = (raw as any).dag_description ?? null;
          canonical.dag_dependency = Array.isArray((raw as any).dag_dependency) ? (raw as any).dag_dependency : ((raw as any).dag_dependency ? String((raw as any).dag_dependency).split(',').map((s: string) => s.trim()) : null);
          canonical.dag_donemarker_location = (() => {
            const v = (raw as any).dag_donemarker_location ?? (raw as any).donemarker_location;
            if (v === undefined || v === null || v === '') return null;
            if (Array.isArray(v)) return v.map((x: any) => String(x).trim()).filter((s: string) => s.length > 0);
            const s = String(v).trim();
            if (s.includes(',')) return s.split(',').map((x) => x.trim()).filter((t) => t.length > 0);
            return s || null;
          })();
          canonical.owner_entity_ref_name = (raw as any).is_entity_owner === true ? null : ((raw as any).owner_entity_ref_name ?? (raw as any).owner_entity_reference ?? '');
        } else {
          canonical.entity_name = (raw as any).entity_name || (raw as any).name || (raw as any).table_name;
          canonical.entity_display_name = (raw as any).entity_display_name || (raw as any).table_name || canonical.entity_name;
          canonical.schema_name = (raw as any).schema_name ?? null;
          canonical.table_name = (raw as any).table_name || canonical.entity_display_name;
          canonical.table_schedule = (raw as any).table_schedule || (raw as any).entity_schedule || null;
          canonical.table_description = (raw as any).table_description ?? null;
          canonical.table_dependency = Array.isArray((raw as any).table_dependency) ? (raw as any).table_dependency : ((raw as any).table_dependency ? String((raw as any).table_dependency).split(',').map((s: string) => s.trim()) : null);
          canonical.table_donemarker_location = (() => {
            const v = (raw as any).table_donemarker_location ?? (raw as any).donemarker_location;
            if (v === undefined || v === null || v === '') return null;
            if (Array.isArray(v)) return v.map((x: any) => String(x).trim()).filter((s: string) => s.length > 0);
            const s = String(v).trim();
            if (s.includes(',')) return s.split(',').map((x) => x.trim()).filter((t) => t.length > 0);
            return s || null;
          })();
          canonical.owner_entity_ref_name = (raw as any).is_entity_owner === true ? null : ((raw as any).owner_entity_ref_name ?? (raw as any).owner_entity_reference ?? '');
        }

        // donemarker lookback parsing (number or list)
        canonical.donemarker_lookback = (() => {
          const v = (raw as any).donemarker_lookback;
          if (v === undefined || v === null || v === '') return null;
          if (Array.isArray(v)) {
            const nums = v.map((x: any) => parseInt(String(x), 10)).filter((n: number) => !isNaN(n) && n >= 0);
            return nums.length > 0 ? nums : null;
          }
          const s = String(v);
          if (s.includes(',')) {
            const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 0);
            return nums.length > 0 ? nums : null;
          }
          const n = parseInt(s, 10);
          return isNaN(n) ? null : n;
        })();

        // Validate with lightweight API schema
        const result = apiEntitySchema.safeParse({ ...canonical, entity_type: incomingType });
        if (!result.success) {
          return res.status(400).json(createValidationErrorResponse(result.error));
        }

        // Resolve team/tenant context similar to single create
        const payload = { ...canonical } as any;
        try {
          if (status && status.mode === 'redis') {
            const teams = await redisCache.get(CACHE_KEYS.TEAMS) || [];
            const tenants = await redisCache.get(CACHE_KEYS.TENANTS) || [];
            if (!payload.teamId && payload.team_name) {
              const teamByName = Array.isArray(teams) ? teams.find((t: any) => t.name === payload.team_name) : null;
              if (teamByName) {
                payload.teamId = teamByName.id;
                payload.team_name = teamByName.name;
                const tenant = Array.isArray(tenants) ? tenants.find((t: any) => t.id === teamByName.tenant_id) : null;
                if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
              }
            }
            if (payload.teamId) {
              const team = Array.isArray(teams) ? teams.find((t: any) => t.id === payload.teamId) : null;
              if (team) {
                payload.team_name = payload.team_name || team.name;
                const tenant = Array.isArray(tenants) ? tenants.find((t: any) => t.id === team.tenant_id) : null;
                if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
              }
            }
          } else {
            if (!payload.teamId && payload.team_name) {
              const teamByName = await storage.getTeamByName(payload.team_name);
              if (teamByName) {
                payload.teamId = teamByName.id;
                payload.team_name = teamByName.name;
                const tenants = await storage.getTenants();
                const tenant = tenants.find(t => t.id === teamByName.tenant_id);
                if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
              }
            }
            if (payload.teamId) {
              const team = await storage.getTeam(payload.teamId);
              if (team) {
                payload.team_name = payload.team_name || team.name;
                const tenants = await storage.getTenants();
                const tenant = tenants.find(t => t.id === team.tenant_id);
                if (tenant) payload.tenant_name = payload.tenant_name || tenant.name;
              }
            }
          }
        } catch {}

        // If non-owner, resolve owner reference name details
        try {
          const isOwner = payload.is_entity_owner === true;
          const refName = typeof (payload as any).owner_entity_ref_name === 'string'
            ? (payload as any).owner_entity_ref_name.trim()
            : (typeof (payload as any).owner_entity_reference === 'string' ? (payload as any).owner_entity_reference.trim() : undefined);
          if (!isOwner && refName) {
            const refType: 'table' | 'dag' = (payload.type === 'table' || payload.entity_type === 'table') ? 'table' : 'dag';
            const matches = await redisCache.findSlimEntitiesByNameCI(refName, refType);
            if (matches && matches.length > 0) {
              const m = matches[0];
              payload.owner_entity_ref_name = {
                entity_owner_name: m.entity_name,
                entity_owner_tenant_id: m.tenant_id ?? null,
                entity_owner_tenant_name: m.tenant_name ?? null,
                entity_owner_team_id: m.team_id ?? null,
                entity_owner_team_name: m.team_name ?? null,
              };
              payload.owner_entity_reference = refName;
              if ((m as any).entity_schedule) payload.entity_schedule = (m as any).entity_schedule;
              if ((m as any).expected_runtime_minutes != null) payload.expected_runtime_minutes = (m as any).expected_runtime_minutes;
            }
          }
        } catch {}

        // Pre-check ownership conflict for owner entities (before creating)
        try {
          if (payload.is_entity_owner === true && payload.team_name && payload.tenant_name) {
            const serverName = payload.server_name ?? null;
            const displayName = (
              (payload.schema_name && payload.table_name ? `${payload.schema_name}.${payload.table_name}` : undefined)
              || payload.dag_name
              || payload.entity_name
              || payload.entity_display_name
            );
            if (displayName) {
              const conflict = await redisCache.checkOwnershipConflict({
                tenant_name: payload.tenant_name,
                team_name: payload.team_name,
                entity_display_name: displayName,
                server_name: serverName
              });
              if (!conflict.allow) {
                // Roll back any previously created items in this bulk request
                for (const createdEntity of created.reverse()) {
                  try {
                    await redisCache.deleteEntityByName({ name: createdEntity.entity_name || createdEntity.name, type: createdEntity.type, teamName: createdEntity.team_name });
                  } catch {}
                }
                // Record conflict with action_type bulk_add
                try {
                  const owners = Array.isArray(conflict.owners) ? conflict.owners : [];
                  const bulkRequest = items.map((it: any) => ({ ...sanitizeEntityPayloadForConflict(it), action_type: 'bulk_add' }));
                  await redisCache.appendConflictRecord({
                    entity_type: (payload.type === 'table' ? 'table' : 'dag'),
                    tenant_name: payload.tenant_name,
                    team_name: payload.team_name,
                    entity_display_name: displayName,
                    server_name: serverName,
                    owners,
                    originalPayload: { action_type: 'bulk_add', bulkRequest, failedItem: { ...sanitizeEntityPayloadForConflict(raw), action_type: 'bulk_add' } },
                    action_by_user_email: payload.user_email,
                  });
                } catch {}
                return sendError(res, 409, `Ownership conflict detected for ${displayName}`);
              }
            }
          }
        } catch {}

        // Ensure lastRefreshed is set for immediate dashboard visibility
        if (!payload.lastRefreshed) {
          payload.lastRefreshed = new Date();
        }
        const entity = await redisCache.createEntity(payload);
        created.push(entity);
        // Immediate broadcast so dashboards update without waiting for cache refresh cycles
        try {
          const entityTypeForWs = (payload.type === 'table' ? 'table' : 'dag');
          const displayForWs = (
            (payload.schema_name && payload.table_name ? `${payload.schema_name}.${payload.table_name}` : undefined)
            || payload.dag_name
            || payload.entity_name
            || payload.entity_display_name
          );
          // Invalidate team caches immediately (like add/edit path)
          if (payload.team_name) {
            await redisCache.invalidateTeamData(payload.team_name);
          }
          await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.ENTITIES, {
            action: 'create',
            entityType: entityTypeForWs,
            entityName: displayForWs || (entity as any)?.name || (entity as any)?.entity_name,
            teamName: payload.team_name,
            tenantName: payload.tenant_name,
            timestamp: new Date().toISOString(),
          });
        } catch {}
      }

      // Per-item invalidation and broadcasts already handled above, no need for heavy cache refresh

      res.removeHeader('ETag');
      res.removeHeader('Last-Modified');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('ETag', `${Date.now()}`);

      res.status(201).json(created);
    } catch (error) {
      return sendError(res, 500, 'Bulk create failed');
    }
  });

  // Delete entity by name (slim/Redis-first) - bypass auth in development for testing
  app.delete('/api/entities/by-name/:entityType/:entityName', ...(isDevelopment ? [] : requireActiveUser), async (req: Request, res: Response) => {
    try {
      const { entityType, entityName } = req.params;
      const teamName = typeof req.query.teamName === 'string' ? req.query.teamName : undefined;
      let tenantName = typeof req.query.tenantName === 'string' ? req.query.tenantName : undefined;

      const normalizedType = (entityType === 'table' || entityType === 'dag') ? (entityType as Entity['type']) : undefined;
      if (!teamName || !normalizedType) {
        return sendError(res, 400, 'teamName and valid entityType (table|dag) are required');
      }

      // Resolve tenantName if not provided (needed to build entities hash field)
      if (!tenantName) {
        try {
          const teams = await redisCache.getAllTeams();
          const tenants = await redisCache.getAllTenants();
          const matches = teams.filter((t: any) => (t.name || '') === teamName);
          if (matches.length > 0) {
            const tenantIds = Array.from(new Set(matches.map((t: any) => t.tenant_id)));
            if (tenantIds.length === 1) {
              const tn = tenants.find((t: any) => t.id === tenantIds[0]);
              tenantName = tn ? tn.name : undefined;
            }
          }
        } catch {}
      }

      // Slim-only delete by composite identifiers (now includes tenantName when resolvable)
      const removed = await redisCache.deleteSlimEntityByComposite({
        tenantName,
        teamName,
        entityType: normalizedType as 'table' | 'dag',
        entityName,
      });
      if (!removed) {
        return sendError(res, 404, 'Entity not found');
      }
      return res.status(204).end();
    } catch (error) {
      return sendError(res, 500, 'Failed to delete entity');
    }
  });

  // Update entity by-name (PATCH) - bypass auth in development for testing
  app.patch('/api/entities/by-name/:entityType/:entityName', ...(isDevelopment ? [] : requireActiveUser), async (req: Request, res: Response) => {
    try {
      const { entityType, entityName } = req.params;
      const teamName = typeof req.query.teamName === 'string' ? req.query.teamName : undefined;
      let tenantName = typeof req.query.tenantName === 'string' ? req.query.tenantName : undefined;

      const normalizedType = (entityType === 'table' || entityType === 'dag') ? (entityType as Entity['type']) : undefined;

      // Require teamName and entityType
      if (!teamName || !normalizedType) {
        return sendError(res, 400, 'teamName and valid entityType (table|dag) are required');
      }

      // If tenantName not provided, attempt to resolve from teams; if ambiguous, require it
      if (!tenantName) {
        try {
          const teams = await redisCache.getAllTeams();
          const tenants = await redisCache.getAllTenants();
          const matches = teams.filter((t: any) => t.name === teamName);
          if (matches.length === 0) {
            return sendError(res, 404, `Team not found: ${teamName}`);
          }
          const tenantIds = Array.from(new Set(matches.map((t: any) => t.tenant_id)));
          if (tenantIds.length > 1) {
            return sendError(res, 400, 'Multiple tenants found for team name. Provide tenantName to disambiguate.');
          }
          const tenant = tenants.find(t => t.id === tenantIds[0]);
          tenantName = tenant ? tenant.name : undefined;
        } catch {}
      }

      // If turning into non-owner with owner reference, validate reference exists before update
      try {
        const isOwner = req.body?.is_entity_owner === true ? true : (req.body?.is_entity_owner === false ? false : undefined);
        const refName = typeof req.body?.owner_entity_ref_name === 'string'
          ? (req.body.owner_entity_ref_name as string).trim()
          : (typeof req.body?.owner_entity_reference === 'string' ? (req.body.owner_entity_reference as string).trim() : undefined);
        if (isOwner === false) {
          if (!refName) {
            return sendError(res, 400, 'owner_entity_ref_name is required when is_entity_owner is false');
          }
          const matches = await redisCache.findSlimEntitiesByNameCI(refName, normalizedType as 'table' | 'dag');
          if (!matches || matches.length === 0) {
            return sendError(res, 404, `Owner Entity Reference not found: ${refName}`);
          }
          const m = matches[0];
          // Prepare owner ref object and merge into updates payload
          req.body.owner_entity_ref_name = {
            entity_owner_name: m.entity_name,
            entity_owner_tenant_id: m.tenant_id ?? null,
            entity_owner_tenant_name: m.tenant_name ?? null,
            entity_owner_team_id: m.team_id ?? null,
            entity_owner_team_name: m.team_name ?? null,
          };
          req.body.owner_entity_reference = refName;
          // Always align schedule/runtime to the referenced owner entity for non-owners
          if ((m as any).entity_schedule) req.body.entity_schedule = (m as any).entity_schedule;
          if ((m as any).expected_runtime_minutes != null) req.body.expected_runtime_minutes = (m as any).expected_runtime_minutes;
        }
      } catch {}

      // Pre-check ownership conflict for owner entities (before updating)
      try {
        const isOwner = req.body?.is_entity_owner === true || req.body?.is_entity_owner === undefined; // default assume owner unless explicitly false
        if (isOwner && teamName && tenantName) {
          const serverName = (req.body?.server_name ?? null) as string | null;
          const displayCandidate = (
            (normalizedType === 'table' && req.body?.schema_name && req.body?.table_name) ? `${req.body.schema_name}.${req.body.table_name}` : undefined
          ) || req.body?.dag_name || req.body?.entity_display_name || entityName;
          if (displayCandidate) {
            const conflict = await redisCache.checkOwnershipConflict({
              tenant_name: tenantName,
              team_name: teamName,
              entity_display_name: displayCandidate,
              server_name: serverName
            });
            if (!conflict.allow) {
              // Attempt to POST conflict to FastAPI; on failure, append to Redis
              try {
                const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
                const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
                if (USE_FASTAPI) {
                  const entityType = normalizedType as 'table' | 'dag';
                  const owners = Array.isArray(conflict.owners) ? conflict.owners : [];
                  const conflictingTeams = [teamName, ...owners].filter(Boolean);
                  const dedupTeams = conflictingTeams.filter((t: string, i: number, arr: string[]) => arr.findIndex(x => (x||'').toLowerCase() === (t||'').toLowerCase()) === i);
                  const body = {
                    entityType,
                    entityName: displayCandidate,
                    conflictingTeams: dedupTeams,
                    originalPayload: { ...req.body, action_type: 'update', entity_name: entityName, team_name: teamName, tenant_name: tenantName },
                    conflictDetails: {
                      existingOwner: owners.join(', ') || 'Unknown',
                      requestedBy: req.user?.email || req.body?.action_by_user_email || req.body?.user_email || null,
                      tenantName: tenantName || null,
                      serverName: serverName ?? null,
                      reason: 'Ownership conflict detected',
                    },
                  };
                  const tempId = `temp-${Date.now()}`;
                  await redisCache.appendConflictRecord({
                    notificationId: tempId,
                    entity_type: entityType,
                    entity_display_name: displayCandidate,
                    team_name: teamName,
                    tenant_name: tenantName,
                    server_name: serverName,
                    owners,
                    originalPayload: { ...req.body, action_type: 'update', entity_name: entityName, team_name: teamName, tenant_name: tenantName },
                    action_by_user_email: req.user?.email || req.body?.action_by_user_email || req.body?.user_email || null,
                  });
                  // appendConflictRecord already broadcasts
                  const resp = await fetch(`${FASTAPI_BASE_URL}/api/v1/conflicts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  if (resp.ok) {
                    const data = await resp.json().catch(() => null);
                    const officialId = data?.notificationId || data?.id || null;
                    if (officialId) {
                      await redisCache.replaceConflictNotificationId(tempId, officialId);
                      // Broadcast ID update after replacement
                      try {
                        await redisCache.broadcastCacheUpdate(WEBSOCKET_CONFIG.cacheUpdateTypes.CONFLICTS, {
                          action: 'update',
                          id: officialId,
                          timestamp: new Date().toISOString(),
                        });
                      } catch {}
                    }
                  }
                } else {
                  await redisCache.appendConflictRecord({
                    action: 'update',
                    tenant_name: tenantName,
                    team_name: teamName,
                    entity_display_name: displayCandidate,
                    server_name: serverName,
                    owners: conflict.owners,
                    entity_type: normalizedType,
                    user_email: req.user?.email || req.body?.user_email || null,
                    originalPayload: { ...req.body, action_type: 'update', entity_name: entityName, team_name: teamName, tenant_name: tenantName },
                  });
                  // appendConflictRecord already broadcasts
                }
              } catch {
                await redisCache.appendConflictRecord({
                  action: 'update',
                  tenant_name: tenantName,
                  team_name: teamName,
                  entity_display_name: displayCandidate,
                  server_name: serverName,
                  owners: conflict.owners,
                  entity_type: normalizedType,
                  action_by_user_email: req.user?.email || req.body?.action_by_user_email || req.body?.user_email || null,
                  originalPayload: { ...req.body, action_type: 'update', entity_name: entityName, team_name: teamName, tenant_name: tenantName },
                });
                // appendConflictRecord already broadcasts
              }
              const ownersList2 = (conflict.owners || []).join(', ');
              return res.status(409).json(createErrorResponse(`Ownership conflict detected. Current owner(s): ${ownersList2}. Please contact an admin for resolution.`, 'conflict'));
            }
          }
        }
      } catch {}

      // Redis-first slim update attempt by composite identifiers (tenantName + teamName + type + name)
      const slimUpdated = await redisCache.updateSlimEntityByComposite({
        tenantName,
        teamName,
        entityType: normalizedType as 'table' | 'dag',
        entityName,
        updates: req.body || {}
      });
      if (!slimUpdated) {
        return sendError(res, 404, 'Entity not found');
      }
      return res.json(slimUpdated);
    } catch (error) {
      return sendError(res, 500, 'Failed to update entity');
    }
  });
  app.put("/api/issues/:id/resolve", checkActiveUserDev, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, 400, 'Invalid issue ID');
      }
      
      const resolvedIssue = await storage.resolveIssue(id);
      if (!resolvedIssue) {
        return sendError(res, 404, 'Issue not found');
      }
      
      res.json(resolvedIssue);
    } catch (error) {
      return sendError(res, 500, 'Failed to resolve issue');
    }
  });

  // Notification Timeline endpoints

  // Get notification timelines for an entity by name - bypass auth in development
  app.get("/api/entities/:entityType/:entityName/notification-timelines", ...(isDevelopment ? [] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const { entityType, entityName } = req.params;
      const teamName = typeof req.query.teamName === 'string' ? req.query.teamName : undefined;
      
      const normalizedType = (entityType === 'table' || entityType === 'dag') ? (entityType as Entity['type']) : undefined;
      
      const entity = await redisCache.getEntityByName({ name: entityName, type: normalizedType, teamName });
      if (!entity) {
        return sendError(res, 404, 'Entity not found');
      }
      
      const timelines = await storage.getNotificationTimelines(entity.id);
      res.json(timelines);
    } catch (error) {
      console.error("Error fetching notification timelines:", error);
      return sendError(res, 500, 'Failed to fetch notification timelines');
    }
  });

  // Get current DAG settings by team name and entity name
  app.get("/api/dags/current-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { team, name } = req.query;
      
      if (!team || !name) {
        return sendError(res, 400, 'Missing required parameters: team, name');
      }
      
      // Find the DAG entity by team name and entity name
      const entities = await storage.getEntities();
      const teams = await storage.getTeams();
      
      const teamObj = teams.find(t => t.name === team);
      if (!teamObj) {
        return sendError(res, 404, 'Team not found');
      }
      
      const entity = entities.find(e => e.name === name && e.type === 'dag' && e.teamId === teamObj.id);
      if (!entity) {
        return sendError(res, 404, 'DAG not found');
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
      return sendError(res, 500, 'Failed to fetch current DAG settings');
    }
  });

  // Get current Table settings by team name and entity name
  app.get("/api/tables/current-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { team, name } = req.query;
      
      if (!team || !name) {
        return sendError(res, 400, 'Missing required parameters: team, name');
      }
      
      // Find the Table entity by team name and entity name
      const entities = await storage.getEntities();
      const teams = await storage.getTeams();
      
      const teamObj = teams.find(t => t.name === team);
      if (!teamObj) {
        return sendError(res, 404, 'Team not found');
      }
      
      const entity = entities.find(e => e.name === name && e.type === 'table' && e.teamId === teamObj.id);
      if (!entity) {
        return sendError(res, 404, 'Table not found');
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
      return sendError(res, 500, 'Failed to fetch current Table settings');
    }
  });

  // Get entity-specific compliance trend from 6-hour cache
  app.get("/api/entities/compliance-trend/:entityType/:entityName", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { entityType, entityName } = req.params;
      const teamName = typeof req.query.teamName === 'string' ? req.query.teamName : undefined;
      
      const normalizedType = (entityType === 'table' || entityType === 'dag') ? (entityType as Entity['type']) : undefined;
      
      // Get entity from cache
      const entity = await redisCache.getEntityByName({ name: entityName, type: normalizedType, teamName });
      if (!entity) {
        return sendError(res, 404, 'Entity not found');
      }
      
      // Generate 30-day compliance trend data based on entity's current SLA
      const trendData = [];
      const now = new Date();
      const baseCompliance = entity.currentSla || 0;
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        
        // Add realistic fluctuations around the entity's current SLA
        const dayVariation = Math.sin(i * 0.15) * 3;
        const randomNoise = (Math.random() - 0.5) * 2;
        const trendImpact = (29 - i) * 0.05;
        
        const compliance = Math.max(0, Math.min(100, 
          baseCompliance + dayVariation + randomNoise + trendImpact * 0.3
        ));
        
        trendData.push({
          date: date.toISOString().split('T')[0],
          dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
          compliance: parseFloat(compliance.toFixed(1))
        });
      }
      
      res.json({
        entityName: entity.name,
        entityType: entity.type,
        currentSla: entity.currentSla,
        status: entity.status,
        lastRefreshed: entity.lastRefreshed,
        trend: trendData,
        lastUpdated: new Date()
      });
    } catch (error) {
      console.error("Error fetching entity compliance trend:", error);
      return sendError(res, 500, 'Failed to fetch entity compliance trend');
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
      return sendError(res, 500, 'Failed to fetch 30-day trends');
    }
  });

  // Alias route to support /api/v1 path used by clients
  app.get("/api/v1/entities/trends/30-day", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const entities = await storage.getEntities();

      const trends = entities.map(entity => {
        const seed = entity.id * 7919;
        const rand = () => {
          const x = Math.sin(seed) * 10000;
          return (x - Math.floor(x)) * 4 - 2;
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

      res.json(trends);
    } catch (error) {
      console.error("Error fetching 30-day trends (v1):", error);
      return sendError(res, 500, 'Failed to fetch 30-day trends');
    }
  });

  // Create notification timeline - bypass auth in development
  app.post("/api/notification-timelines", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const validatedData = insertNotificationTimelineSchema.parse(req.body);
      const timeline = await storage.createNotificationTimeline(validatedData);
      res.status(201).json(timeline);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json(createValidationErrorResponse(error));
      }
      console.error("Error creating notification timeline:", error);
      return sendError(res, 500, 'Failed to create notification timeline');
    }
  });

  // Get notification timeline by ID - bypass auth in development
  app.get("/api/notification-timelines/:id", ...(isDevelopment ? [] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const timelineId = req.params.id;
      // Implementation would retrieve timeline by ID from storage
      res.json({ message: "Timeline retrieval not yet implemented" });
    } catch (error) {
      console.error("Error fetching notification timeline:", error);
      return sendError(res, 500, 'Failed to fetch notification timeline');
    }
  });

  // Update notification timeline - bypass auth in development
  app.put("/api/notification-timelines/:id", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
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
        return sendError(res, 404, 'Notification timeline not found');
      }
      
      res.json(timeline);
    } catch (error) {
      console.error("Error updating notification timeline:", error);
      return sendError(res, 500, 'Failed to update notification timeline');
    }
  });
  // Delete notification timeline - bypass auth in development
  app.delete("/api/notification-timelines/:id", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const timelineId = req.params.id;
      const deleted = await storage.deleteNotificationTimeline(timelineId);
      
      if (!deleted) {
        return sendError(res, 404, 'Notification timeline not found');
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting notification timeline:", error);
      return sendError(res, 500, 'Failed to delete notification timeline');
    }
  });

  // Entity subscription routes
  // Subscribe to a notification timeline - bypass auth in development
  app.post("/api/subscriptions", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return sendError(res, 401, 'User not authenticated');
      }

      const subscriptionData = {
        ...req.body,
        userId: req.user.id
      };
      
      const validatedData = insertEntitySubscriptionSchema.parse(subscriptionData);
      const subscription = await storage.subscribeToNotificationTimeline(validatedData);
      res.status(201).json(subscription);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json(createValidationErrorResponse(error));
      }
      console.error("Error creating subscription:", error);
      return sendError(res, 500, 'Failed to create subscription');
    }
  });

  // Unsubscribe from a notification timeline - bypass auth in development
  app.delete("/api/subscriptions/:timelineId", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return sendError(res, 401, 'User not authenticated');
      }

      const timelineId = req.params.timelineId;
      const unsubscribed = await storage.unsubscribeFromNotificationTimeline(req.user.id, timelineId);
      
      if (!unsubscribed) {
        return sendError(res, 404, 'Subscription not found');
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error removing subscription:", error);
      return sendError(res, 500, 'Failed to remove subscription');
    }
  });

  // Get user's subscriptions
  app.get("/api/me/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return sendError(res, 401, 'User not authenticated');
      }

      const subscriptions = await storage.getUserSubscriptions(req.user.id);
      res.json(subscriptions);
    } catch (error) {
      console.error("Error fetching user subscriptions:", error);
      return sendError(res, 500, 'Failed to fetch subscriptions');
    }
  });

  // Get subscriptions for a specific timeline (with count and user details) - bypass auth in development
  app.get("/api/notification-timelines/:id/subscriptions", ...(isDevelopment ? [] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const timelineId = req.params.id;
      const subscriptions = await storage.getTimelineSubscriptions(timelineId);
      const count = await storage.getSubscriptionCount(timelineId);
      
      // Fetch user details for each subscription
      const subscriptionsWithUserDetails = await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            // Get user from storage
            const user = await storage.getUser(sub.userId);
            if (user) {
              return {
                id: sub.id,
                userId: sub.userId,
                email: user.email,
                slackHandles: user.user_slack || [],
                createdAt: sub.createdAt
              };
            }
            
            // User not found, return basic info
            return {
              id: sub.id,
              userId: sub.userId,
              email: `User${sub.userId}`,
              slackHandles: [],
              createdAt: sub.createdAt
            };
          } catch (error) {
            console.warn(`Failed to fetch user details for userId ${sub.userId}:`, error);
            return {
              id: sub.id,
              userId: sub.userId,
              email: `User${sub.userId}`,
              slackHandles: [],
              createdAt: sub.createdAt
            };
          }
        })
      );
      
      res.json({
        count,
        subscriptions: subscriptionsWithUserDetails
      });
    } catch (error) {
      console.error("Error fetching timeline subscriptions:", error);
      return sendError(res, 500, 'Failed to fetch timeline subscriptions');
    }
  });

  // Task API routes
  // Get tasks for a specific DAG by entity name (FastAPI-style)
  app.get("/api/v1/dags/:entityName/tasks", async (req: Request, res: Response) => {
    try {
      const entityName = req.params.entityName;
      
      if (!entityName) {
        return sendError(res, 400, 'Invalid entity name');
      }

      // Find the DAG entity by name to get its ID for mock service
      const entities = await storage.getEntities();
      const dagEntity = entities.find(e => e.name === entityName && e.type === 'dag');
      
      if (!dagEntity) {
        return sendError(res, 404, 'DAG entity not found');
      }

      // Use mock service to generate tasks (imports mockTaskService for consistency)
      const { mockTaskService } = await import('../client/src/features/sla/mockService.js');
      const tasks = mockTaskService.getDagTasks(dagEntity.id, entityName);
      
      // Transform to API format with task_type field for frontend compatibility
      const formattedTasks = tasks.map(task => ({
        id: task.id,
        name: task.name,
        description: task.description,
        status: task.status,
        duration: task.duration,
        dependencies: task.dependencies,
        task_type: task.priority === 'high' ? 'AI' : 'regular', // Map priority to task_type
        priority: task.priority
      }));

      res.json(formattedTasks);
    } catch (error) {
      console.error("Error fetching DAG tasks by entity name:", error);
      return sendError(res, 500, 'Failed to fetch DAG tasks');
    }
  });
  // Get tasks for a specific DAG
  app.get("/api/dags/:dagId/tasks", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const dagId = parseInt(req.params.dagId);
      if (isNaN(dagId)) {
        return sendError(res, 400, 'Invalid DAG ID');
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
      return sendError(res, 500, 'Failed to fetch DAG tasks');
    }
  });

  // Mock FastAPI endpoint for all tasks data (fallback when FastAPI unavailable)
  app.get("/api/v1/sla/all_tasks", async (req: Request, res: Response) => {
    try {
      // Use mock service to get all tasks data in the expected format
      const { mockTaskService } = await import('../client/src/features/sla/mockService.js');
      const allTasksData = mockTaskService.getAllTasksData();
      
      res.json(allTasksData.dagTasks); // Return just the dagTasks array
    } catch (error) {
      console.error("Error fetching all tasks data:", error);
      return sendError(res, 500, 'Failed to fetch all tasks data');
    }
  });
  // GET endpoint for team-scoped AI task priorities - FastAPI compatible endpoint
  app.get("/api/v1/get_dag_task_priority/:entity_name", ...(isDevelopment ? [] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const entityName = req.params.entity_name;
      const teamName = req.query.team as string;

      if (!entityName) {
        return sendError(res, 400, 'Entity name is required');
      }

      if (!teamName) {
        return sendError(res, 400, 'team parameter is required');
      }

      // Get AI tasks from Redis cache using team-scoped key
      const cacheKey = `ai_tasks:${teamName}:${entityName}`;
      const cachedAiTasks = await redisCache.get(cacheKey);

      if (cachedAiTasks) {
        console.log(`[AI Tasks Cache Hit] ${cacheKey}`);
        return res.json({
          dag_name: entityName,
          ai_tasks: JSON.parse(cachedAiTasks)
        });
      }

      // Cache miss - return empty AI tasks list (all tasks are regular by default)
      console.log(`[AI Tasks Cache Miss] ${cacheKey} - returning empty list`);
      res.json({
        dag_name: entityName,
        ai_tasks: []
      });
    } catch (error) {
      console.error("Error fetching AI task priorities:", error);
      return sendError(res, 500, 'Failed to fetch AI task priorities');
    }
  });

  // Express fallback endpoint for development
  app.get("/api/get_dag_task_priority/:entity_name", ...(isDevelopment ? [] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const entityName = req.params.entity_name;
      const teamName = req.query.team as string;

      if (!entityName) {
        return sendError(res, 400, 'Entity name is required');
      }

      if (!teamName) {
        return sendError(res, 400, 'team parameter is required');
      }

      // Get AI tasks from Redis cache using team-scoped key
      const cacheKey = `ai_tasks:${teamName}:${entityName}`;
      const cachedAiTasks = await redisCache.get(cacheKey);

      if (cachedAiTasks) {
        return res.json({
          dag_name: entityName,
          ai_tasks: JSON.parse(cachedAiTasks)
        });
      }

      // Cache miss - return empty AI tasks list
      res.json({
        dag_name: entityName,
        ai_tasks: []
      });
    } catch (error) {
      console.error("Error fetching AI task priorities:", error);
      return sendError(res, 500, 'Failed to fetch AI task priorities');
    }
  });

  // PATCH API for bulk task priority updates at entity level - Team-scoped with user context
  app.patch("/api/v1/entities/:entity_name/tasks/priorities", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const entityName = req.params.entity_name;
      if (!entityName) {
        return sendError(res, 400, 'Entity name is required');
      }

      const { tasks, team_name, tenant_name, user } = req.body;
      
      // Validation
      if (!Array.isArray(tasks)) {
        return sendError(res, 400, 'Tasks array is required');
      }
      
      if (!team_name || !tenant_name) {
        return sendError(res, 400, 'team_name and tenant_name are required');
      }

      // Validate each task priority
      for (const task of tasks) {
        if (!task.task_name || !task.priority || !["high", "normal"].includes(task.priority)) {
          return res.status(400).json({ 
            message: `Invalid task format. Each task must have task_name and priority ('high' or 'normal')` 
          });
        }
      }

      // Get logged-in user from session
      const sessionUser = req.session ? (req.session as any).user : undefined;
      const loggedInUser = sessionUser || req.user || { 
        email: user?.email || 'unknown@example.com',
        name: user?.name || 'Unknown User'
      };

      // Actually update the mock service data so changes persist
      const { mockTaskService } = await import('../client/src/features/sla/mockService.js');
      
      // Find the DAG entity to get its ID
      const entities = await storage.getEntities();
      const dagEntity = entities.find(e => e.name === entityName && e.type === 'dag');
      
      if (dagEntity) {
        // Update each task's priority in the mock service
        tasks.forEach(task => {
          mockTaskService.updateTaskPriorityByName(dagEntity.id, task.task_name, task.priority);
        });
      }

      // Update the 6-hour Redis cache with new allTasksData
      const updatedAllTasksData = mockTaskService.getAllTasksData();
      await redisCache.setAllTasksData(updatedAllTasksData);

      // Store team-scoped AI tasks in Redis cache
      const aiTasks = tasks
        .filter(task => task.priority === 'high')
        .map(task => task.task_name);
      
      const cacheKey = `ai_tasks:${team_name}:${entityName}`;
      await redisCache.set(cacheKey, JSON.stringify(aiTasks), 21600); // 6 hour TTL
      console.log(`[AI Tasks Cache Set] ${cacheKey}: [${aiTasks.join(', ')}]`);

      // Process bulk task priority updates with team context
      const updatedTasks = tasks.map(task => ({
        task_name: task.task_name,
        priority: task.priority,
        task_type: task.priority === 'high' ? 'AI' : 'regular',
        entity_name: entityName,
        team_name: team_name,
        tenant_name: tenant_name,
        updated_by: loggedInUser.email,
        updated_by_name: loggedInUser.name,
        updatedAt: new Date().toISOString()
      }));

      console.log(`[Bulk Task Priority Update] Entity: ${entityName}, Team: ${team_name}, Tenant: ${tenant_name}`);
      console.log(`[Bulk Task Priority Update] Updated ${tasks.length} tasks by user: ${loggedInUser.email}`);
      
      // Log each task update for audit trail
      tasks.forEach(task => {
        console.log(`[Task Update] ${task.task_name}: ${task.priority} (${task.priority === 'high' ? 'AI' : 'regular'})`);
      });

      // Force cache invalidation for team-scoped data
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      
      res.json({
        success: true,
        entity_name: entityName,
        team_name: team_name,
        tenant_name: tenant_name,
        updated_by: loggedInUser.email,
        tasks_updated: updatedTasks.length,
        tasks: updatedTasks,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating task priorities:", error);
      return sendError(res, 500, 'Failed to update task priorities');
    }
  });

  // Express fallback for bulk task priority updates with entity_name pattern
  app.patch("/api/entities/:entity_name/tasks/priorities", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const entityName = req.params.entity_name;
      if (!entityName) {
        return sendError(res, 400, 'Entity name is required');
      }

      const { tasks, team_name, tenant_name, user } = req.body;
      
      // Validation
      if (!Array.isArray(tasks)) {
        return sendError(res, 400, 'Tasks array is required');
      }
      
      if (!team_name || !tenant_name) {
        return sendError(res, 400, 'team_name and tenant_name are required');
      }

      // Validate each task priority
      for (const task of tasks) {
        if (!task.task_name || !task.priority || !["high", "normal"].includes(task.priority)) {
          return res.status(400).json({ 
            message: `Invalid task format. Each task must have task_name and priority ('high' or 'normal')` 
          });
        }
      }

      // Get logged-in user from session
      const sessionUser = req.session ? (req.session as any).user : undefined;
      const loggedInUser = sessionUser || req.user || { 
        email: user?.email || 'unknown@example.com',
        name: user?.name || 'Unknown User'
      };

      // Update the mock service data
      const { mockTaskService } = await import('../client/src/features/sla/mockService.js');
      
      // Find the DAG entity to get its ID
      const entities = await storage.getEntities();
      const dagEntity = entities.find(e => e.name === entityName && e.type === 'dag');
      
      if (dagEntity) {
        // Update each task's priority in the mock service
        tasks.forEach(task => {
          mockTaskService.updateTaskPriorityByName(dagEntity.id, task.task_name, task.priority);
        });
      }

      // Update the 6-hour Redis cache with new allTasksData
      const updatedAllTasksData = mockTaskService.getAllTasksData();
      await redisCache.setAllTasksData(updatedAllTasksData);

      // Store team-scoped AI tasks in Redis cache
      const aiTasks = tasks
        .filter(task => task.priority === 'high')
        .map(task => task.task_name);
      
      const cacheKey = `ai_tasks:${team_name}:${entityName}`;
      await redisCache.set(cacheKey, JSON.stringify(aiTasks), 21600); // 6 hour TTL
      console.log(`[Express Fallback] AI Tasks Cache Set - ${cacheKey}: [${aiTasks.join(', ')}]`);

      // Process bulk task priority updates with team context
      const updatedTasks = tasks.map(task => ({
        task_name: task.task_name,
        priority: task.priority,
        task_type: task.priority === 'high' ? 'AI' : 'regular',
        entity_name: entityName,
        team_name: team_name,
        tenant_name: tenant_name,
        updated_by: loggedInUser.email,
        updated_by_name: loggedInUser.name,
        updatedAt: new Date().toISOString()
      }));

      console.log(`[Express Fallback] Bulk Update - Entity: ${entityName}, Team: ${team_name}`);
      console.log(`[Express Fallback] Updated ${tasks.length} tasks by user: ${loggedInUser.email}`);
      
      res.json({
        success: true,
        entity_name: entityName,
        team_name: team_name,
        tenant_name: tenant_name,
        updated_by: loggedInUser.email,
        tasks_updated: updatedTasks.length,
        tasks: updatedTasks,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating task priorities (Express fallback):", error);
      return sendError(res, 500, 'Failed to update task priorities');
    }
  });

  // ============================================
  // AGENT WORKSPACE ENDPOINTS (Express Fallback)
  // ============================================
  
  // POST /api/v1/agent/chat/:entity_name - Send message to agent with entity context
  app.post("/api/v1/agent/chat/:entity_name", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const { entity_name } = req.params;
      const { dag_name, task_name, date } = req.query;
      const { message, context } = req.body;
      
      console.log(`[Agent Chat Fallback] Entity: ${entity_name}, DAG: ${dag_name}, Task: ${task_name}, Date: ${date}`);
      
      // Mock response for development
      res.json({
        response: `Agent response for ${entity_name}`,
        conversation_id: `conv_${Date.now()}`,
        entity_name,
        dag_name: dag_name || null,
        task_name: task_name || null,
        date: date || null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error in agent chat:", error);
      return sendError(res, 500, 'Failed to process agent chat');
    }
  });
  
  // GET /api/v1/agent/conversations/:entity_name/recent - Load recent conversation history
  app.get("/api/v1/agent/conversations/:entity_name/recent", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { entity_name } = req.params;
      const { dag_name, task_name, date, limit = '10' } = req.query;
      
      console.log(`[Agent History Fallback] Entity: ${entity_name}, Limit: ${limit}`);
      
      // Mock response for development
      res.json({
        messages: [],
        entity_name,
        dag_name: dag_name || null,
        task_name: task_name || null,
        date: date || null
      });
    } catch (error) {
      console.error("Error loading agent conversation:", error);
      return sendError(res, 500, 'Failed to load conversation history');
    }
  });
  
  // POST /api/v1/agent/conversations/:entity_name/save - Save conversation history
  app.post("/api/v1/agent/conversations/:entity_name/save", ...(isDevelopment ? [checkActiveUserDev] : [isAuthenticated]), async (req: Request, res: Response) => {
    try {
      const { entity_name } = req.params;
      const { dag_name, task_name, date } = req.query;
      const { messages, user_context } = req.body;
      
      console.log(`[Agent Save Fallback] Entity: ${entity_name}, Messages: ${messages?.length || 0}`);
      
      res.json({
        success: true,
        entity_name,
        saved_count: messages?.length || 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error saving agent conversation:", error);
      return sendError(res, 500, 'Failed to save conversation');
    }
  });

  // ============================================
  // ADMIN TENANT MANAGEMENT ENDPOINTS
  // ============================================
  
  // Get all tenants for admin (with caching)
  app.get("/api/admin/tenants", async (req, res) => {
    try {
      res.status(410).json({
        error: 'LEGACY_ENDPOINT_DISABLED',
        message: 'Legacy Express endpoint /admin/tenants is disabled. Use FastAPI /api/v1/* endpoints instead.',
        fastapi_endpoint: '/admin/tenants',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Admin tenants fetch error:', error);
      return sendError(res, 500, 'Failed to fetch tenants');
    }
  });

  // Create new tenant with optimistic update support
  app.post("/api/admin/tenants", requireActiveUser, async (req: Request, res: Response) => {
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
          // legacy admin_tenants key removed
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
      return sendError(res, 500, 'Failed to create tenant');
    }
  });
  // Update tenant with optimistic update support
  // ============================================
  // ADMIN USER MANAGEMENT ENDPOINTS
  // ============================================
  
  // Get all users for admin panel
  app.get("/api/admin/users", async (req, res) => {
    try {
      // Prevent HTTP caching to ensure fresh data for expired user indicators
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Redis-first: check cache mode
      const status = await redisCache.getCacheStatus();
      const redisConnected = status && status.mode === 'redis';
      
      let users;
      if (redisConnected) {
        // Redis mode: read from users hash
        users = await redisCache.getAllUsersFromHash() || [];
      } else {
        // In-memory mode: return mock users from storage
        users = await storage.getUsers();
      }
      
      // Transform to admin format expected by frontend
      const adminUsers = Array.isArray(users) ? users.map((user: any) => ({
        user_id: user.id,
        user_name: user.username,
        user_email: user.email || '',
        user_slack: user.user_slack || null,
        user_pagerduty: user.user_pagerduty || null,
        is_active: user.is_active ?? true
      })) : [];

      res.json(adminUsers);
    } catch (error) {
      console.error('Admin users fetch error:', error);
      res.status(500).json(createErrorResponse("Failed to fetch users"));
    }
  });

  // Create new user from admin panel
  app.post("/api/admin/users", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const result = adminUserSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json(createValidationErrorResponse(result.error, "Invalid user data"));
      }
      
      const adminUserData = result.data;
      
      // Check if username already exists (in storage for in-memory mode)
      const existingUser = await storage.getUserByUsername(adminUserData.user_name);
      if (existingUser) {
        return res.status(409).json(createErrorResponse("Username already exists", "duplicate_username"));
      }
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: O(1) create in users hash
        const created = await redisCache.createUserInHash(adminUserData);
        return res.status(201).json({
          user_id: created.id,
          user_name: created.username,
          user_email: created.email || '',
          user_slack: created.user_slack || null,
          user_pagerduty: created.user_pagerduty || null,
          is_active: created.is_active ?? true
        });
      }

      // In-memory mode: create via storage
      const user = await storage.createUser({
        username: adminUserData.user_name,
        password: "default-password",
        email: adminUserData.user_email,
        displayName: adminUserData.user_name,
        user_slack: adminUserData.user_slack || null,
        user_pagerduty: adminUserData.user_pagerduty || null,
        is_active: adminUserData.is_active ?? true,
        role: "user" as const
      });
      await redisCache.invalidateUserData();
      
      return res.status(201).json({
        user_id: user.id,
        user_name: user.username,
        user_email: user.email || '',
        user_slack: user.user_slack || null,
        user_pagerduty: user.user_pagerduty || null,
        is_active: user.is_active ?? true
      });
    } catch (error) {
      console.error('Admin user creation error:', error);
      res.status(500).json(createErrorResponse("Failed to create user"));
    }
  });
  // Update existing user from admin panel
  app.put("/api/admin/users/:id", requireActiveUser, async (req: Request, res: Response) => {
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
      
      // Persist user update in storage so is_active changes are saved
      let updatedUser: any = await storage.updateUser(userId, updateData) || {
        ...existingUser,
        ...updateData
      };

      // If the user was active and is now deactivated → remove from all teams
      const wasActive = existingUser.is_active ?? true;
      const isNowInactive = updateData.is_active === false && wasActive;

      if (isNowInactive) {
        try {
          const allTeams = await storage.getTeams();
          const username = existingUser.username;
          const userEmail = existingUser.email || '';
          const displayName = existingUser.displayName || '';
          const teamsWithUser = allTeams.filter(t => 
            Array.isArray(t.team_members_ids) && 
            t.team_members_ids.some(m => m === username || m === userEmail || m === displayName)
          );

          // Helper: best-effort FastAPI update, fallback to local storage update
          const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
          const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
          const sessionIdHeader = (Array.isArray(req.headers['x-session-id']) ? req.headers['x-session-id'][0] : req.headers['x-session-id']) as string | undefined;

          for (const team of teamsWithUser) {
            const newMembers = (team.team_members_ids || []).filter(m => (m !== username && m !== userEmail && m !== displayName));

            let updated = false;
            if (USE_FASTAPI) {
              try {
                const fastApiUrl = `${FASTAPI_BASE_URL}/api/v1/teams/${team.id}`;
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (sessionIdHeader) headers['X-Session-ID'] = sessionIdHeader;
                const resp = await fetch(fastApiUrl, {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({ team_members_ids: newMembers })
                });
                if (resp.ok) updated = true;
              } catch (_err) {
                // Ignore and fallback
              }
            }

            if (!updated) {
              // Fallback to local storage update
              await storage.updateTeam(team.id, { team_members_ids: newMembers });
              updated = true;
            }

            if (updated) {
              // Invalidate caches and broadcast members-updated event
              try {
                const tenants = await redisCache.getAllTenants();
                const tenantName = tenants.find((t: any) => t.id === team.tenant_id)?.name || 'Unknown';
                await redisCache.invalidateTeamData(team.name, {
                  action: 'remove',
                  memberId: String(existingUser.id),
                  memberName: username,
                  tenantName
                });
              } catch (_e) {
                // Non-fatal
              }
            }
          }
        } catch (_err) {
          // Non-fatal: if bulk removal fails, continue with user update response
        }
      }
      
      // Update cache based on mode
      const status = await redisCache.getCacheStatus();
      if (status && status.mode === 'redis') {
        // Redis mode: O(1) update by id in users hash
        const next = await redisCache.updateUserByIdInHash(userId, adminUserData);
        if (!next) {
          return res.status(404).json(createErrorResponse("User not found"));
        }
        updatedUser = next;
      } else {
        // In-memory mode: invalidate cache so next GET fetches fresh data from storage
      await redisCache.invalidateUserData();
      }
      
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
  // FastAPI-style: Update existing user (fallback handler)
  app.put("/api/v1/users/:id", checkActiveUserDev, async (req, res) => {
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

      // Load existing user
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json(createErrorResponse("User not found", "user_not_found"));
      }

      // Prepare update data
      const updateData: any = {};
      if (adminUserData.user_name) updateData.username = adminUserData.user_name;
      if (adminUserData.user_email) updateData.email = adminUserData.user_email;
      if (adminUserData.user_slack !== undefined) updateData.user_slack = adminUserData.user_slack;
      if (adminUserData.user_pagerduty !== undefined) updateData.user_pagerduty = adminUserData.user_pagerduty;
      if (adminUserData.is_active !== undefined) updateData.is_active = adminUserData.is_active;

      const updatedUser = await storage.updateUser(userId, updateData) || {
        ...existingUser,
        ...updateData
      };

      // Handle deactivation: remove user from all teams (FastAPI-first, fallback to storage)
      const wasActive = existingUser.is_active ?? true;
      const isNowInactive = updateData.is_active === false && wasActive;
      if (isNowInactive) {
        try {
          const allTeams = await storage.getTeams();
          const username = existingUser.username;
          const userEmail = existingUser.email || '';
          const displayName = existingUser.displayName || '';
          const teamsWithUser = allTeams.filter(t => Array.isArray(t.team_members_ids) && t.team_members_ids.some(m => m === username || m === userEmail || m === displayName));

          const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
          const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
          const sessionIdHeader = (Array.isArray(req.headers['x-session-id']) ? req.headers['x-session-id'][0] : req.headers['x-session-id']) as string | undefined;

          for (const team of teamsWithUser) {
            const newMembers = (team.team_members_ids || []).filter(m => (m !== username && m !== userEmail && m !== displayName));
            let updated = false;
            if (USE_FASTAPI) {
              try {
                const fastApiUrl = `${FASTAPI_BASE_URL}/api/v1/teams/${team.id}`;
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (sessionIdHeader) headers['X-Session-ID'] = sessionIdHeader;
                const resp = await fetch(fastApiUrl, {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({ team_members_ids: newMembers })
                });
                if (resp.ok) updated = true;
              } catch (_err) {}
            }
            if (!updated) {
              await storage.updateTeam(team.id, { team_members_ids: newMembers });
              updated = true;
            }
            if (updated) {
              try {
                const tenants = await redisCache.getAllTenants();
                const tenantName = tenants.find((t: any) => t.id === team.tenant_id)?.name || 'Unknown';
                await redisCache.invalidateTeamData(team.name, {
                  action: 'remove',
                  memberId: String(existingUser.id),
                  memberName: username,
                  tenantName
                });
              } catch (_e) {}
            }
          }
        } catch (_err) {}
      }

      await redisCache.invalidateUserData();

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
      console.error('FastAPI-style user update error:', error);
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
      return sendError(res, 500, 'Failed to fetch dashboard summary');
    }
  });
  
  // Get all DAGs endpoint
  app.get("/api/dags", async (req, res) => {
    try {
      const dags = await storage.getEntitiesByType('dag');
      res.json(dags);
    } catch (error) {
      console.error("Error fetching DAGs:", error);
      return sendError(res, 500, 'Failed to fetch DAGs');
    }
  });

  // Create DAG endpoint (development fallback)
  app.post("/api/dags", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const result = insertEntitySchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid DAG data", errors: result.error.format() });
      }
      
      // Ensure this is a DAG entity
      const payload = { ...result.data, type: 'dag' } as any;

      // Create DAG entity using the same logic as entities endpoint
      const newDag = await storage.createEntity(payload);
      
      // Invalidate relevant caches
      await redisCache.invalidateCache({
        keys: [
          'entities_all',
          `entities_team_${newDag.teamId}`,
          `entities_tenant_${payload.tenant_name || 'default'}`,
        ],
        patterns: [
          'dashboard_*',
          'summary_*',
          'teams_*'
        ]
      });

      res.status(201).json(newDag);
    } catch (error) {
      console.error("Error creating DAG:", error);
      return sendError(res, 500, 'Failed to create DAG');
    }
  });

  // Get all Tables endpoint
  app.get("/api/tables", async (req, res) => {
    try {
      const tables = await storage.getEntitiesByType('table');
      res.json(tables);
    } catch (error) {
      console.error("Error fetching Tables:", error);
      return sendError(res, 500, 'Failed to fetch Tables');
    }
  });
  // Create Table endpoint (development fallback)
  app.post("/api/tables", requireActiveUser, async (req: Request, res: Response) => {
    try {
      const result = insertEntitySchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid table data", errors: result.error.format() });
      }
      
      // Ensure this is a table entity
      const payload = { ...result.data, type: 'table' } as any;

      // Create table entity using the same logic as entities endpoint
      const newTable = await storage.createEntity(payload);
      
      // Invalidate relevant caches
      await redisCache.invalidateCache({
        keys: [
          'entities_all',
          `entities_team_${newTable.teamId}`,
          `entities_tenant_${payload.tenant_name || 'default'}`,
        ],
        patterns: [
          'dashboard_*',
          'summary_*',
          'teams_*'
        ]
      });

      res.status(201).json(newTable);
    } catch (error) {
      console.error("Error creating Table:", error);
      return sendError(res, 500, 'Failed to create table');
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
      return sendError(res, 500, 'Failed to create test user');
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
        return sendError(res, 404, 'Test user not found');
      }
    } catch (error) {
      console.error("Error checking test user:", error);
      return sendError(res, 500, 'Error checking test user');
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
      return sendError(res, 500, 'Error resetting test user');
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
      return sendError(res, 500, 'Failed to update cache');
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
      return sendError(res, 500, 'Failed to fetch recent changes');
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
        return sendError(res, 404, 'Entity not found');
      }
      
      // Lookup owner's is_active status from users table
      const ownerEmail = entity.ownerEmail || entity.owner_email || 'owner@company.com';
      let ownerIsActive = true; // Default to active if not found
      
      try {
        const users = await storage.getUsers();
        const ownerUser = users.find(u => u.email === ownerEmail);
        if (ownerUser) {
          ownerIsActive = ownerUser.is_active !== undefined && ownerUser.is_active !== null ? ownerUser.is_active : true;
        }
      } catch (userLookupError) {
        console.warn('Failed to lookup owner active status:', userLookupError);
        // Continue with default ownerIsActive = true
      }
      
      // Return owner and SLA settings data
      res.json({
        owner: entity.owner || 'Unknown Owner',
        ownerEmail: ownerEmail,
        ownerIsActive: ownerIsActive, // NEW: Include owner's active status
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
      return sendError(res, 500, 'Failed to fetch owner and SLA settings');
    }
  });

  // FastAPI-style owner update by entity name for tables
  app.patch('/api/v1/tables/:entityName/owner', checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { entityName } = req.params;
      
      // Find entity by name and type with case-insensitive matching
      const entities = await redisCache.getAllEntities();
      const entity = entities.find(e => 
        (e.name?.toLowerCase() === entityName.toLowerCase() || 
         (e as any).entity_name?.toLowerCase() === entityName.toLowerCase()) && 
        e.type === 'table'
      );
      
      if (!entity) {
        return res.status(404).json(createErrorResponse('Table not found', 'not_found'));
      }

      const { owner_email, ownerEmail, owners } = req.body || {};
      // Normalize owners to a comma-separated string stored in ownerEmail/owner_email
      let emails: string[] = [];
      if (Array.isArray(owners)) emails = owners;
      else if (typeof owner_email === 'string') emails = owner_email.split(',');
      else if (typeof ownerEmail === 'string') emails = ownerEmail.split(',');
      emails = emails.map((e: string) => e.trim()).filter((e: string) => e.length > 0);

      const updates: any = {};
      const normalized = emails.join(',');
      updates.owner_email = normalized;
      updates.ownerEmail = normalized;

      // Update via redis cache helper
      const updated = await redisCache.updateEntityById(entity.id, updates);
      if (!updated) {
        return res.status(404).json(createErrorResponse('Failed to update table', 'update_error'));
      }

      // Invalidate caches
      await redisCache.invalidateEntityData((updated as any).teamId);

      return res.json({ success: true, owner_email: (updated as any).owner_email || (updated as any).ownerEmail || null });
    } catch (error) {
      console.error('Update table owner error:', error);
      return res.status(500).json(createErrorResponse('Failed to update owner', 'update_error'));
    }
  });

  // FastAPI-style owner update by entity name for DAGs
  app.patch('/api/v1/dags/:entityName/owner', checkActiveUserDev, async (req: Request, res: Response) => {
    try {
      const { entityName } = req.params;
      
      // Find entity by name and type with case-insensitive matching
      const entities = await redisCache.getAllEntities();
      const entity = entities.find(e => 
        (e.name?.toLowerCase() === entityName.toLowerCase() || 
         (e as any).entity_name?.toLowerCase() === entityName.toLowerCase()) && 
        e.type === 'dag'
      );
      
      if (!entity) {
        return res.status(404).json(createErrorResponse('DAG not found', 'not_found'));
      }

      const { owner_email, ownerEmail, owners } = req.body || {};
      // Normalize owners to a comma-separated string stored in ownerEmail/owner_email
      let emails: string[] = [];
      if (Array.isArray(owners)) emails = owners;
      else if (typeof owner_email === 'string') emails = owner_email.split(',');
      else if (typeof ownerEmail === 'string') emails = ownerEmail.split(',');
      emails = emails.map((e: string) => e.trim()).filter((e: string) => e.length > 0);

      const updates: any = {};
      const normalized = emails.join(',');
      updates.owner_email = normalized;
      updates.ownerEmail = normalized;

      // Update via redis cache helper
      const updated = await redisCache.updateEntityById(entity.id, updates);
      if (!updated) {
        return res.status(404).json(createErrorResponse('Failed to update DAG', 'update_error'));
      }

      // Invalidate caches
      await redisCache.invalidateEntityData((updated as any).teamId);

      return res.json({ success: true, owner_email: (updated as any).owner_email || (updated as any).ownerEmail || null });
    } catch (error) {
      console.error('Update DAG owner error:', error);
      return res.status(500).json(createErrorResponse('Failed to update owner', 'update_error'));
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
      return sendError(res, 500, 'Failed to fetch SLA status data');
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
      return sendError(res, 500, 'Failed to fetch settings changes');
    }
  });

  // --- FastAPI-style aliases for the above endpoints (client expects /api/v1 prefix) ---
  app.get('/api/v1/teams/:teamName/:entityType/:entityName/owner_sla_settings', async (req: Request, res: Response) => {
    try {
      // Reuse same logic by delegating to the non-v1 route
      const { teamName, entityType, entityName } = req.params;
      req.url = `/api/teams/${teamName}/${entityType}/${entityName}/owner_sla_settings`;
      // Manually invoke the handler by performing an internal redirect
      res.redirect(307, req.url);
    } catch (error) {
      console.error('Owner SLA settings v1 alias error:', error);
      return sendError(res, 500, 'Failed to fetch owner and SLA settings');
    }
  });

  app.get('/api/v1/teams/:teamName/:entityType/:entityName/sla_status_30days', async (req: Request, res: Response) => {
    try {
      const { teamName, entityType, entityName } = req.params;
      req.url = `/api/teams/${teamName}/${entityType}/${entityName}/sla_status_30days`;
      res.redirect(307, req.url);
    } catch (error) {
      console.error('SLA status 30 days v1 alias error:', error);
      return sendError(res, 500, 'Failed to fetch SLA status data');
    }
  });

  app.get('/api/v1/teams/:teamName/:entityType/:entityName/settings_changes', async (req: Request, res: Response) => {
    try {
      const { teamName, entityType, entityName } = req.params;
      req.url = `/api/teams/${teamName}/${entityType}/${entityName}/settings_changes`;
      res.redirect(307, req.url);
    } catch (error) {
      console.error('Settings changes v1 alias error:', error);
      return sendError(res, 500, 'Failed to fetch settings changes');
    }
  });

  // ===== AUDIT ENDPOINTS FOR ROLLBACK MANAGEMENT =====

  // Zod validation schemas for audit endpoints
  const auditEntityNameSchema = z.object({
    entity_name: z.string().min(1, "Entity name is required")
  });

  const auditTeamTenantSchema = z.object({
    tenant_id: z.union([z.string(), z.number()]).transform(val => parseInt(val.toString())),
    team_id: z.union([z.string(), z.number()]).transform(val => parseInt(val.toString()))
  });

  const auditRollbackSchema = z.object({
    entity_id: z.string().min(1, "Entity ID is required"),
    entity_name: z.string().min(1, "Entity name is required"), 
    entity_type: z.enum(['dag', 'table']),
    tenant_id: z.string().min(1, "Tenant ID is required"),
    team_id: z.string().min(1, "Team ID is required"),
    user_email: z.string().email("Valid email is required"),
    reason: z.string().optional().default("")
  });
  // Mock audit data matching the DeletedEntity interface expected by the frontend
  const MOCK_DELETED_ENTITIES = [
    {
      id: '1',
      entity_name: 'user_analytics_pipeline',
      entity_type: 'dag' as const,
      tenant_name: 'Data Engineering123',
      team_name: 'Analytics Team', 
      deleted_date: '2025-09-15T10:30:00Z',
      deleted_by: 'john.doe@company.com',
      entity_id: 'dag_123',
      tenant_id: '1',
      team_id: '1'
    },
    {
      id: '2',
      entity_name: 'customer_data_table',
      entity_type: 'table' as const,
      tenant_name: 'Marketing Ops',
      team_name: 'Customer Insights',
      deleted_date: '2025-09-14T15:45:00Z',
      deleted_by: 'jane.smith@company.com',
      entity_id: 'table_456',
      tenant_id: '2',
      team_id: '2'
    },
    {
      id: '3',
      entity_name: 'sales_reporting_dag',
      entity_type: 'dag' as const,
      tenant_name: 'Sales Operations',
      team_name: 'Sales Analytics',
      deleted_date: '2025-09-13T09:15:00Z',
      deleted_by: 'mike.wilson@company.com',
      entity_id: 'dag_789',
      tenant_id: '3',
      team_id: '3'
    },
    {
      id: '4',
      entity_name: 'inventory_tracking_table',
      entity_type: 'table' as const,
      tenant_name: 'Operations',
      team_name: 'Supply Chain',
      deleted_date: '2025-09-12T14:20:00Z',
      deleted_by: 'sarah.johnson@company.com',
      entity_id: 'table_101',
      tenant_id: '4',
      team_id: '4'
    },
    {
      id: '5',
      entity_name: 'user_analytics_daily',
      entity_type: 'table' as const,
      tenant_name: 'Data Engineering123',
      team_name: 'Analytics Team',
      deleted_date: '2025-09-10T14:15:00Z',
      deleted_by: 'sarah.analytics@company.com',
      entity_id: 'table_567',
      tenant_id: '1',
      team_id: '1'
    }
  ];

  // GET /api/audit/entity-name - Fetch audit history by entity name (Express)
  app.get("/api/audit/entity-name", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const validationResult = auditEntityNameSchema.safeParse(req.query);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { entity_name } = validationResult.data;
      
      structuredLogger.info('AUDIT_ENTITY_NAME_SEARCH', req.sessionContext, req.requestId, {
        logger: 'app.audit.search'
      });
      console.log(`🔍 Audit entity name search: ${entity_name}`);

      // Get actual deleted entities by name from storage
      const matchingEntities = await storage.getDeletedEntitiesByName(entity_name);

      res.json({
        entities: matchingEntities,
        total: matchingEntities.length,
        search_term: entity_name,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Audit entity name search error:', error);
      res.status(500).json(createErrorResponse('Failed to fetch audit history by entity name', 'search_error'));
    }
  });

  // GET /api/v1/audit/entity-name - FastAPI fallback pattern
  app.get("/api/v1/audit/entity-name", async (req: Request, res: Response) => {
    try {
      const validationResult = auditEntityNameSchema.safeParse(req.query);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { entity_name } = validationResult.data;
      
      structuredLogger.info('AUDIT_ENTITY_NAME_SEARCH_V1', req.sessionContext, req.requestId, {
        logger: 'app.audit.search.fastapi'
      });
      console.log(`🔍 Audit entity name search V1: ${entity_name}`);

      // Get actual deleted entities by name from storage
      const matchingEntities = await storage.getDeletedEntitiesByName(entity_name);

      res.json({
        entities: matchingEntities,
        total: matchingEntities.length,
        search_term: entity_name,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Audit entity name search V1 error:', error);
      res.status(500).json(createErrorResponse('Failed to fetch audit history by entity name', 'search_error'));
    }
  });

  // GET /api/audit/team-tenant - Fetch all deleted entities for team/tenant (Express)
  app.get("/api/audit/team-tenant", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const validationResult = auditTeamTenantSchema.safeParse(req.query);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { tenant_id, team_id } = validationResult.data;
      
      structuredLogger.info('AUDIT_TEAM_TENANT_SEARCH', req.sessionContext, req.requestId, {
        logger: 'app.audit.search'
      });
      console.log(`🔍 Audit team/tenant search: tenant_id=${tenant_id}, team_id=${team_id}`);

      // Get actual deleted entities by team/tenant from storage
      const matchingEntities = await storage.getDeletedEntitiesByTeamTenant(tenant_id, team_id);

      res.json({
        entities: matchingEntities,
        total: matchingEntities.length,
        tenant_id,
        team_id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Audit team tenant search error:', error);
      res.status(500).json(createErrorResponse('Failed to fetch deleted entities by team/tenant', 'search_error'));
    }
  });

  // GET /api/v1/audit/team-tenant - FastAPI fallback pattern  
  app.get("/api/v1/audit/team-tenant", async (req: Request, res: Response) => {
    try {
      const validationResult = auditTeamTenantSchema.safeParse(req.query);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { tenant_id, team_id } = validationResult.data;
      
      structuredLogger.info('AUDIT_TEAM_TENANT_SEARCH_V1', req.sessionContext, req.requestId, {
        logger: 'app.audit.search.fastapi'
      });
      console.log(`🔍 Audit team/tenant search V1: tenant_id=${tenant_id}, team_id=${team_id}`);

      // Get actual deleted entities by team/tenant from storage
      const matchingEntities = await storage.getDeletedEntitiesByTeamTenant(tenant_id, team_id);

      res.json({
        entities: matchingEntities,
        total: matchingEntities.length,
        tenant_id,
        team_id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Audit team tenant search V1 error:', error);
      res.status(500).json(createErrorResponse('Failed to fetch deleted entities by team/tenant', 'search_error'));
    }
  });

  // POST /api/audit/rollback - Perform rollback operation (Express)
  app.post("/api/audit/rollback", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const validationResult = auditRollbackSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { entity_id, entity_name, entity_type, tenant_id, team_id, user_email, reason } = validationResult.data;
      
      // Create rollback audit log
      const auditLog = createRollbackAuditLog('ROLLBACK_INITIATED', req, {
        entity_id,
        entity_name,
        entity_type,
        tenant_id,
        team_id,
        user_email,
        reason
      });
      
      structuredLogger.info('AUDIT_ROLLBACK_INITIATED', req.sessionContext, req.requestId, auditLog);

      // Perform actual entity rollback using storage
      // Find the audit record ID first based on entity_id and entity_type
      const auditId = entity_id; // The storage method expects auditId
      const rolledBackEntity = await storage.performEntityRollback(auditId, entity_type);
      
      if (!rolledBackEntity) {
        return res.status(404).json(createErrorResponse('Deleted entity not found in audit history or rollback failed', 'not_found'));
      }

      // Invalidate relevant caches after rollback using conditional patterns
      await invalidateRollbackCaches(rolledBackEntity);

      // Broadcast rollback event to all connected clients for real-time updates
      await redisCache.broadcastEntityRollback({
        entityId: rolledBackEntity.id.toString(),
        entityName: rolledBackEntity.name,
        entityType: rolledBackEntity.type,
        teamName: rolledBackEntity.team_name || 'Unknown',
        tenantName: rolledBackEntity.tenant_name || 'Unknown',
        toVersion: 1, // Entity restored to active state
        userEmail: user_email,
        reason: reason || 'Rollback requested via admin interface',
        originUserId: req.user?.id?.toString() || user_email
      });

      structuredLogger.info('AUDIT_ROLLBACK_COMPLETED', req.sessionContext, req.requestId, {
        ...auditLog,
        entity_id: rolledBackEntity.id,
        entity_name: rolledBackEntity.name
      });

      res.json({
        success: true,
        message: `Entity ${entity_name} has been successfully restored`,
        entity: rolledBackEntity,
        cache_invalidated: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Audit rollback error:', error);
      structuredLogger.error('AUDIT_ROLLBACK_ERROR', req.sessionContext, req.requestId, {
        logger: 'app.audit.rollback'
      });
      console.error('🚨 Audit rollback error:', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json(createErrorResponse('Failed to perform rollback operation', 'rollback_error'));
    }
  });

  // POST /api/v1/audit/rollback - FastAPI fallback pattern  
  app.post("/api/v1/audit/rollback", async (req: Request, res: Response) => {
    try {
      const validationResult = auditRollbackSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json(createValidationErrorResponse(validationResult.error));
      }

      const { entity_id, entity_name, entity_type, tenant_id, team_id, user_email, reason } = validationResult.data;
      
      structuredLogger.info('AUDIT_ROLLBACK_V1_INITIATED', req.sessionContext, req.requestId, {
        logger: 'app.audit.rollback.fastapi'
      });
      console.log(`🔄 Audit rollback V1 initiated: entity=${entity_name} (${entity_type}), user=${user_email}`);

      // Perform actual entity rollback using storage
      const auditId = entity_id; // The storage method expects auditId
      const rolledBackEntity = await storage.performEntityRollback(auditId, entity_type);
      
      if (!rolledBackEntity) {
        return res.status(404).json(createErrorResponse('Deleted entity not found in audit history or rollback failed', 'not_found'));
      }

      // Invalidate relevant caches using conditional patterns
      await invalidateRollbackCaches(rolledBackEntity);

      // Broadcast rollback event to all connected clients for real-time updates
      await redisCache.broadcastEntityRollback({
        entityId: rolledBackEntity.id.toString(),
        entityName: rolledBackEntity.name,
        entityType: rolledBackEntity.type,
        teamName: rolledBackEntity.team_name || 'Unknown',
        tenantName: rolledBackEntity.tenant_name || 'Unknown',
        toVersion: 1, // Entity restored to active state
        userEmail: user_email,
        reason: reason || 'Rollback requested via admin interface',
        originUserId: 'api-v1-user' // FastAPI fallback identifier
      });

      res.json({
        success: true,
        message: `Entity ${entity_name} has been successfully restored`,
        entity: rolledBackEntity,
        cache_invalidated: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Audit rollback V1 error:', error);
      res.status(500).json(createErrorResponse('Failed to perform rollback operation', 'rollback_error'));
    }
  });

  // ===== END AUDIT ENDPOINTS =====
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
      
      // Apply rollback cache invalidation using conditional patterns
      // Note: This endpoint broadcasts rollback but doesn't perform actual storage rollback
      // Apply same cache invalidation logic for consistency
      await invalidateRollbackCaches(entity);
      
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
  // Using shared SocketData type for consistency with redis-cache.ts
  const authenticatedSockets: Map<WebSocket, SocketData> = new Map();
  
  // Initialize WebSocket in cache system with the authenticatedSockets map
  redisCache.setupWebSocket(wss, authenticatedSockets as any);
  // Heartbeat configuration
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds
  const IDLE_TIMEOUT = 60000; // 60 seconds
  const CLEANUP_INTERVAL = 10000; // 10 seconds

  wss.on('connection', (ws, req) => {
    let socketData: SocketData | null = null;

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle authentication
        if (data.type === 'authenticate') {
          const { sessionId } = data;
          
          // In development mode, allow dummy authentication
          const isDevelopment = process.env.NODE_ENV !== 'production';
          const effectiveSessionId = sessionId || (isDevelopment ? 'dev-session' : null);
          
          if (!effectiveSessionId) {
            ws.send(JSON.stringify({ type: 'auth-error', message: 'Session ID required' }));
            ws.close(4001, 'Authentication failed');
            return;
          }

          // Validate session ID (basic validation for now)
          // In production, validate against session store
          socketData = {
            sessionId: effectiveSessionId,
            userId: data.userId || 'anonymous',
            componentType: data.componentType || 'unknown',
            subscriptions: new Set(),
            lastPong: Date.now(),
            isAlive: true
          };
          
          authenticatedSockets.set(ws, socketData);
          ws.send(JSON.stringify({ type: 'auth-success', message: 'Authenticated' }));
          return;
        }

        // Allow team member updates to bypass authentication (they're broadcast-only cache invalidation)
        if (data.event === 'team-members-updated') {
          // Process immediately without authentication check
          const changeData = data.data;
          if (changeData && changeData.teamName && changeData.tenantName) {
            try {
              
              // Use existing cache invalidation system to trigger proper WebSocket broadcasting
              await redisCache.invalidateTeamData(changeData.teamName, {
                action: changeData.type === 'member-added' ? 'add' : 'remove',
                memberId: changeData.memberId,
                memberName: changeData.memberName,
                tenantName: changeData.tenantName
              });
              
            } catch (error) {
              console.error('⚠️ Server: Error processing team member update:', error);
            }
          } else {
            console.warn('⚠️ Server: Invalid team member data received:', changeData);
          }
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
        if (socketData.lastPong && now - socketData.lastPong > IDLE_TIMEOUT) {
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
      if (!socketData.isAlive && socketData.lastPong && now - socketData.lastPong > IDLE_TIMEOUT) {
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
    
    // Log active connection count
    console.log(`Active WebSocket connections: ${authenticatedSockets.size}`);
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

  return httpServer;
}