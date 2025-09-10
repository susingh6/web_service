import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { redisCache } from "./redis-cache";
import { insertEntitySchema, insertTeamSchema, insertEntityHistorySchema, insertIssueSchema, insertUserSchema, insertNotificationTimelineSchema } from "@shared/schema";
import { z } from "zod";
import { setupSimpleAuth } from "./simple-auth";
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
      
      // If team name is provided, filter teams or log the specific team request
      if (teamName) {
        const filteredTeams = teams.filter(team => team.name === teamName);
        res.json(filteredTeams);
      } else {
        res.json(teams);
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

      res.json(tenants);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenants" });
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
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!tenantName) {
        return res.status(400).json({ message: "Tenant parameter is required" });
      }

      // Determine if this is a predefined range or custom range
      const isPredefinedRange = !startDate || !endDate || isDateRangePredefined(startDate, endDate);
      const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';
      
      if (isPredefinedRange && !USE_FASTAPI) {
        // Use cached data for predefined ranges when FastAPI is disabled
        const rangeType = startDate && endDate ? determinePredefinedRange(startDate, endDate) : 'last30Days';
        const metrics = await redisCache.getMetricsByTenantAndRange(tenantName, rangeType);
        const complianceTrends = await redisCache.getComplianceTrendsByTenantAndRange(tenantName, rangeType);
        
        if (!metrics) {
          return res.status(404).json({ message: "No data found for the specified tenant and range" });
        }
        
        console.log(`GET /api/dashboard/summary - Parameters: tenant=${tenantName}, range=${rangeType} (cached) - status: 200`);
        
        return res.json({
          metrics,
          complianceTrends,
          lastUpdated: new Date(),
          cached: true,
          dateRange: rangeType
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
        const metrics = await redisCache.calculateMetricsForDateRange(tenantName, start, end);
        
        if (!metrics) {
          return res.status(404).json({ message: "No data found for the specified tenant and date range" });
        }
        
        console.log(`GET /api/dashboard/summary - Parameters: tenant=${tenantName}, custom range=${startDate} to ${endDate} - status: 200`);
        
        return res.json({ 
          metrics,
          complianceTrends: null, // No trends for custom date ranges yet
          lastUpdated: new Date(),
          cached: false,
          dateRange: { startDate, endDate }
        });
      }
      
      // Default: get 30-day cached metrics (backward compatibility)
      const metrics = await redisCache.getDashboardMetrics(tenantName);
      const complianceTrends = await redisCache.getComplianceTrends(tenantName);
      
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
        error: error.message 
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
      
      // Invalidate team data after creation
      await redisCache.invalidateTeamData();
      
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
        tenant: req.headers['x-tenant'] || 'Data Engineering',
        username: req.headers['x-username'] || 'azure_test_user'
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
      
      const updatedEntity = await redisCache.updateEntityById(id, result.data);
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
      
      const timeline = await storage.updateNotificationTimeline(timelineId, result.data);
      
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

  // Rollback endpoint for entity details modal
  app.post('/api/teams/:teamName/:entityType/:entityName/rollback', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { teamName, entityType, entityName } = req.params;
      const { toVersion, user_email, reason } = req.body;
      
      // Validate required fields
      if (!toVersion || !user_email) {
        return res.status(400).json({ 
          message: 'Missing required fields: toVersion and user_email' 
        });
      }
      
      // Get all entities from cache to find the target entity
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
      
      // Validate toVersion (should be a positive integer)
      const rollbackVersion = parseInt(toVersion.toString());
      if (isNaN(rollbackVersion) || rollbackVersion < 1) {
        return res.status(400).json({ 
          message: 'Invalid toVersion: must be a positive integer' 
        });
      }
      
      // Broadcast rollback event using the existing pattern
      await redisCache.broadcastEntityRollback({
        entityId: entity.id.toString(),
        entityName: entity.name,
        entityType: entity.type,
        teamName: teamName,
        tenantName: entity.tenant_name || 'Unknown',
        toVersion: rollbackVersion,
        userEmail: user_email,
        reason: reason || `Rollback to version ${rollbackVersion}`,
        originUserId: user_email
      });
      
      res.json({ 
        success: true,
        message: `Successfully initiated rollback for ${entityName} to version ${rollbackVersion}`,
        entityName,
        entityType,
        teamName,
        toVersion: rollbackVersion,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Rollback endpoint error:', error);
      res.status(500).json({ message: 'Failed to process rollback request' });
    }
  });



  const httpServer = createServer(app);

  // Setup WebSocket server with authentication and subscriptions
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track authenticated connections with heartbeat monitoring
  const authenticatedSockets = new Map<WebSocket, {
    sessionId: string;
    userId: string;
    subscriptions: Set<string>; // tenant:team format
    lastPong: number; // Last pong response timestamp
    isAlive: boolean; // Heartbeat status
  }>();

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
  redisCache.setupWebSocket(wss, authenticatedSockets);

  return httpServer;
}
