import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import path from "path";

export function setupTestRoutes(app: Express) {
  // Routes to serve test HTML files from their categorized directories
  // Provide a tests index page for developer convenience
  app.get("/tests", (req: Request, res: Response) => {
    const indexPath = path.join(import.meta.dirname, "public", "tests", "index.html");
    res.sendFile(indexPath);
  });
  
  // Legacy redirects to maintain backward compatibility
  app.get("/test", (req: Request, res: Response) => {
    res.redirect("/tests/api-demos/test.html");
  });
  
  app.get("/test-login", (req: Request, res: Response) => {
    res.redirect("/tests/auth/test-login.html");
  });
  
  app.get("/standalone-login", (req: Request, res: Response) => {
    res.redirect("/tests/auth/standalone-login.html");
  });
  
  // Shortcut redirects for convenience 
  app.get("/tests/test.html", (req: Request, res: Response) => {
    res.redirect("/tests/api-demos/test.html");
  });
  
  app.get("/tests/test-login.html", (req: Request, res: Response) => {
    res.redirect("/tests/auth/test-login.html");
  });
  
  app.get("/tests/standalone-login.html", (req: Request, res: Response) => {
    res.redirect("/tests/auth/standalone-login.html");
  });
  
  // Serve from subdirectories with proper nested path resolution
  app.get("/tests/:category/:file", (req: Request, res: Response) => {
    const { category, file } = req.params;
    const filePath = path.join(import.meta.dirname, "public", "tests", category, file);
    res.sendFile(filePath);
  });
  // Special endpoint to force-create a test user with a working password
  app.get("/api/dev/force-create-test-user", async (req, res) => {
    try {
      // Direct password hash without scrypt for testing
      const passwordHash = await hashPassword("Azure123!");
      // Created test user with password hash
      
      // Create or update test user with known fixed hash
      const testUser = {
        username: "azure_test_user",
        password: passwordHash,
        email: "test@example.com",
        displayName: "Azure Test User",
        team: "Data Engineering"
      };
      
      // Delete existing user if any
      let existingUser = await storage.getUserByUsername("azure_test_user");
      if (existingUser) {
        // Existing test user found
        // We don't have a delete method, so we'll just overwrite
      }
      
      const user = await storage.createUser(testUser);
      // Created/updated test user
      
      res.json({
        message: "Test user created successfully",
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          team: user.team
        },
        credentials: {
          username: "azure_test_user",
          password: "Azure123!"
        }
      });
    } catch (error) {
      console.error("Error creating test user:", error);
      res.status(500).json({ message: "Error creating test user" });
    }
  });
  
  // Show current auth status
  app.get("/api/dev/auth-status", (req, res) => {
    res.json({
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
        team: req.user.team
      } : null
    });
  });
}