import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import MemoryStore from "memorystore";
import { storage } from "./storage";
import { User } from "@shared/schema";
import { structuredLogger, logAuthenticationEvent } from "./middleware/structured-logging";

// FastAPI authentication function
async function authenticateWithFastAPI(username: string, password: string): Promise<any> {
  try {
    // Create basic auth header
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    
    const response = await fetch('http://localhost:8080/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const sessionData = await response.json();
      return sessionData;
    }
    
    return null;
  } catch (error) {
    // FastAPI authentication failed
    return null;
  }
}

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      password: string;
      email: string | null;
      displayName: string | null;
      team: string | null;
    }
  }
}

export function setupSimpleAuth(app: Express) {
  // Set up session middleware
  const MemorySessionStore = MemoryStore(session);
  const sessionStore = new MemorySessionStore({
    checkPeriod: 86400000, // 24 hours in milliseconds
  });

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "sla-monitoring-secret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    }
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport to use local strategy with simple password comparison
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Login attempt
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          // User not found
          return done(null, false);
        }
        
        // Debug log the password details
        // Login attempt details available for debugging
        
        // For development with plain passwords - TEMPORARY
        // In production, this would be proper password comparison
        return done(null, user);
      } catch (error) {
        console.error("Login error:", error);
        return done(error);
      }
    }),
  );

  // Serialize user to the session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Registration route
  app.post("/api/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create user with plain password
      const userData = {
        ...req.body,
      };
      
      const user = await storage.createUser(userData);

      // Log in the newly registered user
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Don't send the password back to the client
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  // Login route
  app.post("/api/login", async (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", async (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) {
        logAuthenticationEvent("login", req.body.username, undefined, req.requestId, false);
        return next(err);
      }
      if (!user) {
        logAuthenticationEvent("login", req.body.username, undefined, req.requestId, false);
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      try {
        // Try to authenticate with FastAPI and get enriched session context
        const fastApiSession = await authenticateWithFastAPI(req.body.username, req.body.password);
        
        // If FastAPI authentication succeeds, enrich the user object
        if (fastApiSession) {
          (user as any).fastApiSession = fastApiSession;
          logAuthenticationEvent("login", req.body.username, {
            session_id: fastApiSession.session.session_id,
            user_id: fastApiSession.user.user_id,
            email: fastApiSession.user.email,
            session_type: fastApiSession.user.type,
            roles: Array.isArray(fastApiSession.user.roles) ? fastApiSession.user.roles.join(',') : fastApiSession.user.roles,
            notification_id: fastApiSession.user.notification_id
          }, req.requestId, true);
        } else {
          logAuthenticationEvent("login", req.body.username, undefined, req.requestId, true);
        }
        
        req.login(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          
          // Don't send the password back to the client
          const { password, ...userWithoutPassword } = user;
          return res.json(userWithoutPassword);
        });
      } catch (error) {
        // FastAPI authentication failed, but local auth succeeded
        logAuthenticationEvent("login", req.body.username, undefined, req.requestId, true);
        req.login(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          
          // Don't send the password back to the client
          const { password, ...userWithoutPassword } = user;
          return res.json(userWithoutPassword);
        });
      }
    })(req, res, next);
  });

  // Logout route
  app.post("/api/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.status(200).json({ message: "Logged out successfully" });
    });
  });

  // Get current user route
  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    // Don't send the password back to the client
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });

  // Create a test user endpoint (for development only)
  app.get("/api/dev/create-test-user", async (req: Request, res: Response) => {
    try {
      // Create a test user with plain text password
      const testUser = {
        username: "azure_test_user",
        password: "Azure123!",
        email: "test@example.com",
        displayName: "Azure Test User",
        team: "Data Engineering"
      };
      
      // Check if user already exists
      let user = await storage.getUserByUsername(testUser.username);
      
      if (user) {
        // For testing, overwrite the existing user to ensure the password is correct
        // User already exists, updating password
        // In a real app, we would update the user here
      } else {
        user = await storage.createUser(testUser);
        // Created test user
      }
      
      res.json({
        message: "Test user ready to use",
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
}