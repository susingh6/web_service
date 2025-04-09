import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEntitySchema, insertTeamSchema, insertEntityHistorySchema, insertIssueSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
  
  // API Routes
  
  // Teams endpoints
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
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

  const httpServer = createServer(app);
  return httpServer;
}
