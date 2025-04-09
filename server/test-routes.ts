import type { Express } from "express";
import { storage } from "./storage";
import { hashPassword } from "./auth";

export function setupTestRoutes(app: Express) {
  // Special endpoint to force-create a test user with a working password
  app.get("/api/dev/force-create-test-user", async (req, res) => {
    try {
      // Direct password hash without scrypt for testing
      const passwordHash = await hashPassword("Azure123!");
      console.log("Created test user with password hash:", passwordHash);
      
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
        console.log("Existing test user found with ID:", existingUser.id);
        // We don't have a delete method, so we'll just overwrite
      }
      
      const user = await storage.createUser(testUser);
      console.log("Created/updated test user with ID:", user.id);
      
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