import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEntitySchema, insertTeamSchema, insertEntityHistorySchema, insertIssueSchema, insertUserSchema, insertNotificationTimelineSchema } from "@shared/schema";
import { z } from "zod";
import { setupSimpleAuth } from "./simple-auth";
import { setupTestRoutes } from "./test-routes";

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

  // Teams endpoints
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Debug endpoint to check team data
  app.get("/api/debug/teams", async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json({
        total: teams.length,
        teams: teams.map(t => ({ id: t.id, name: t.name, description: t.description })),
        message: "Debug: All teams with IDs"
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams for debug" });
    }
  });
  
  app.post("/api/teams", async (req, res) => {
    try {
      const result = insertTeamSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid team data", errors: result.error.format() });
      }
      
      const team = await storage.createTeam(result.data);
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
  
  // Entities endpoints
  app.get("/api/entities", async (req, res) => {
    try {
      let entities;
      
      if (req.query.teamId) {
        const teamId = parseInt(req.query.teamId as string);
        if (isNaN(teamId)) {
          return res.status(400).json({ message: "Invalid team ID" });
        }
        entities = await storage.getEntitiesByTeam(teamId);
      } else if (req.query.type) {
        const type = req.query.type as string;
        if (type !== 'table' && type !== 'dag') {
          return res.status(400).json({ message: "Type must be 'table' or 'dag'" });
        }
        entities = await storage.getEntitiesByType(type);
      } else {
        entities = await storage.getEntities();
      }
      
      res.json(entities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch entities" });
    }
  });
  
  app.post("/api/entities", async (req, res) => {
    try {
      const result = insertEntitySchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid entity data", errors: result.error.format() });
      }
      
      const entity = await storage.createEntity(result.data);
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
      
      const entity = await storage.getEntity(id);
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
      
      const entity = await storage.getEntity(id);
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
      });
      
      const result = updateSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: "Invalid entity data", errors: result.error.format() });
      }
      
      const updatedEntity = await storage.updateEntity(id, result.data);
      if (!updatedEntity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
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
      
      const success = await storage.deleteEntity(id);
      if (!success) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
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

  // Get AI tasks for an entity
  app.get("/api/entities/:id/ai-tasks", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const entityId = parseInt(req.params.id);
      // Return AI monitored tasks that match the task names from the View Tasks modal
      const mockAiTasks = [
        { id: 1, name: "Task1", description: "AI monitoring for Task1" },
        { id: 2, name: "Task2", description: "AI monitoring for Task2" },
        { id: 3, name: "Task3", description: "AI monitoring for Task3" }
      ];
      res.json(mockAiTasks);
    } catch (error) {
      console.error("Error fetching AI tasks:", error);
      res.status(500).json({ message: "Failed to fetch AI tasks" });
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
        isActive: entity.status === 'healthy' || entity.status === 'warning',
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
        isActive: entity.status === 'healthy' || entity.status === 'warning',
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
      
      console.log(`Generated 30-day trends for ${trends.length} entities`);
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
      const timeline = await storage.updateNotificationTimeline(timelineId, req.body);
      
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

      console.log(`Task ${taskId} priority updated to ${priority}`);
      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task priority:", error);
      res.status(500).json({ message: "Failed to update task priority" });
    }
  });
  
  // Dashboard summary endpoint
  app.get("/api/dashboard/summary", async (req, res) => {
    try {
      const entities = await storage.getEntities();
      
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
        console.log("Test user found with hash:", user.password);
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
        console.log("Found existing user, will recreate with new password");
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
      console.log("Created test user with ID:", user.id);
      
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

  const httpServer = createServer(app);
  return httpServer;
}
