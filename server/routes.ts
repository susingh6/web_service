import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { insertEntitySchema, insertTeamSchema, insertEntityHistorySchema, insertIssueSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./unified-auth";
import { setupTestRoutes } from "./test-routes";
import { 
  sendSuccess, 
  sendError, 
  sendServerError, 
  sendValidationError, 
  sendNotFound, 
  sendPaginated 
} from './utils/api-responses';

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication with unified system
  const isDevelopment = process.env.NODE_ENV !== "production";
  setupAuth(app, { isDevelopment });
  
  // Set up test routes for development
  if (isDevelopment) {
    setupTestRoutes(app);
    
    // Add a route to serve our test login page
    app.get("/test-login", (req, res) => {
      res.sendFile(path.resolve(import.meta.dirname, "public", "test-login.html"));
    });
  }
  
  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    sendError(res, "Unauthorized", 401, undefined, "UNAUTHORIZED");
  };
  
  // API Routes
  
  // Teams endpoints
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeams();
      sendSuccess(res, teams);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.post("/api/teams", async (req, res) => {
    try {
      const result = insertTeamSchema.safeParse(req.body);
      
      if (!result.success) {
        return sendValidationError(res, result.error);
      }
      
      const team = await storage.createTeam(result.data);
      sendSuccess(res, team, "Team created successfully", 201);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.get("/api/teams/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, "Invalid team ID", 400);
      }
      
      const team = await storage.getTeam(id);
      if (!team) {
        return sendNotFound(res, "Team");
      }
      
      sendSuccess(res, team);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  // Entities endpoints
  app.get("/api/entities", async (req, res) => {
    try {
      let entities;
      
      if (req.query.teamId) {
        const teamId = parseInt(req.query.teamId as string);
        if (isNaN(teamId)) {
          return sendError(res, "Invalid team ID", 400);
        }
        entities = await storage.getEntitiesByTeam(teamId);
      } else if (req.query.type) {
        const type = req.query.type as string;
        if (type !== 'table' && type !== 'dag') {
          return sendError(res, "Type must be 'table' or 'dag'", 400);
        }
        entities = await storage.getEntitiesByType(type);
      } else {
        entities = await storage.getEntities();
      }
      
      sendSuccess(res, entities);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.post("/api/entities", async (req, res) => {
    try {
      const result = insertEntitySchema.safeParse(req.body);
      
      if (!result.success) {
        return sendValidationError(res, result.error);
      }
      
      const entity = await storage.createEntity(result.data);
      sendSuccess(res, entity, "Entity created successfully", 201);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.get("/api/entities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, "Invalid entity ID", 400);
      }
      
      const entity = await storage.getEntity(id);
      if (!entity) {
        return sendNotFound(res, "Entity");
      }
      
      sendSuccess(res, entity);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.put("/api/entities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, "Invalid entity ID", 400);
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
        return sendValidationError(res, result.error);
      }
      
      const updatedEntity = await storage.updateEntity(id, result.data);
      if (!updatedEntity) {
        return sendNotFound(res, "Entity");
      }
      
      sendSuccess(res, updatedEntity, "Entity updated successfully");
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.delete("/api/entities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, "Invalid entity ID", 400);
      }
      
      const success = await storage.deleteEntity(id);
      if (!success) {
        return sendNotFound(res, "Entity");
      }
      
      // For DELETE operations, return 204 No Content with no body
      res.status(204).end();
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  // Entity History endpoints
  app.get("/api/entities/:id/history", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, "Invalid entity ID", 400);
      }
      
      const history = await storage.getEntityHistory(id);
      sendSuccess(res, history);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.post("/api/entities/:id/history", async (req, res) => {
    try {
      const entityId = parseInt(req.params.id);
      if (isNaN(entityId)) {
        return sendError(res, "Invalid entity ID", 400);
      }
      
      const data = { ...req.body, entityId };
      const result = insertEntityHistorySchema.safeParse(data);
      
      if (!result.success) {
        return sendValidationError(res, result.error);
      }
      
      const history = await storage.addEntityHistory(result.data);
      sendSuccess(res, history, "History record added successfully", 201);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  // Issues endpoints
  app.get("/api/entities/:id/issues", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, "Invalid entity ID", 400);
      }
      
      const issues = await storage.getIssues(id);
      sendSuccess(res, issues);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.post("/api/entities/:id/issues", async (req, res) => {
    try {
      const entityId = parseInt(req.params.id);
      if (isNaN(entityId)) {
        return sendError(res, "Invalid entity ID", 400);
      }
      
      const data = { ...req.body, entityId };
      const result = insertIssueSchema.safeParse(data);
      
      if (!result.success) {
        return sendValidationError(res, result.error);
      }
      
      const issue = await storage.addIssue(result.data);
      sendSuccess(res, issue, "Issue created successfully", 201);
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  app.put("/api/issues/:id/resolve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return sendError(res, "Invalid issue ID", 400);
      }
      
      const resolvedIssue = await storage.resolveIssue(id);
      if (!resolvedIssue) {
        return sendNotFound(res, "Issue");
      }
      
      sendSuccess(res, resolvedIssue, "Issue resolved successfully");
    } catch (error) {
      sendServerError(res, error);
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
      const metrics = {
        overallCompliance: overallSla,
        tablesCompliance: tablesSla,
        dagsCompliance: dagsSla,
        entitiesCount: entities.length,
        tablesCount: tables.length,
        dagsCount: dags.length
      };
      
      sendSuccess(res, { metrics }, "Dashboard summary fetched successfully");
    } catch (error) {
      sendServerError(res, error);
    }
  });
  
  // DEVELOPMENT ONLY - Create a test user
  // This would typically be handled by Azure AD in a production environment
  app.get("/api/dev/create-test-user", async (req, res) => {
    try {
      // Check if the test user already exists
      const existingUser = await storage.getUserByUsername("azure_test_user");
      
      if (existingUser) {
        return sendSuccess(res, { 
          credentials: { 
            username: "azure_test_user", 
            password: "Azure123!" 
          } 
        }, "Test user already exists");
      }
      
      // Create a test user (with plain text password for testing purposes)
      const testUser = {
        username: "azure_test_user",
        password: "Azure123!",
        email: "test@example.com",
        displayName: "Azure Test User",
        team: "Data Engineering"
      };
      
      await storage.createUser(testUser);
      
      sendSuccess(res, { 
        credentials: { 
          username: testUser.username, 
          password: "Azure123!" // Return the non-hashed password for testing
        } 
      }, "Test user created successfully", 201);
    } catch (error) {
      console.error("Failed to create test user:", error);
      sendServerError(res, error);
    }
  });
  
  // TEST ONLY - Check if test user exists (for debugging)
  app.get("/api/test/user-check", async (req, res) => {
    try {
      const user = await storage.getUserByUsername("azure_test_user");
      if (user) {
        // For debugging, we'll actually show the password hash
        console.log("Test user found with hash:", user.password);
        
        sendSuccess(res, {
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
        }, "Test user exists");
      } else {
        sendNotFound(res, "Test user");
      }
    } catch (error) {
      console.error("Error checking test user:", error);
      sendServerError(res, error);
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
      
      sendSuccess(res, {
        credentials: {
          username: "azure_test_user",
          password: "Azure123!"
        }
      }, "Test user created/reset successfully");
    } catch (error) {
      console.error("Error resetting test user:", error);
      sendServerError(res, error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
