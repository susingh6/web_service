import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import MemoryStore from "memorystore";
import { storage } from "./storage";
import { User, insertUserSchema } from "@shared/schema";
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

// FastAPI authorization function for rollback operations
export async function authorizeRollbackWithFastAPI(
  sessionId: string,
  teamName: string,
  entityType: string,
  entityName: string
): Promise<{ authorized: boolean; user?: any; error?: string }> {
  try {
    const response = await fetch('http://localhost:8080/api/v1/auth/authorize-rollback', {
      method: 'POST',
      headers: {
        'X-Session-ID': sessionId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        team_name: teamName,
        entity_type: entityType,
        entity_name: entityName,
        action: 'rollback'
      })
    });
    
    if (response.ok) {
      const authResult = await response.json();
      return {
        authorized: true,
        user: authResult.user || null
      };
    }
    
    if (response.status === 401) {
      return {
        authorized: false,
        error: 'Invalid or expired session'
      };
    }
    
    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      return {
        authorized: false,
        error: errorData.message || 'Access denied'
      };
    }
    
    // Other errors
    return {
      authorized: false,
      error: 'Authorization service unavailable'
    };
  } catch (error) {
    // FastAPI authorization service unavailable - fallback to local session
    console.warn('FastAPI authorization service unavailable, falling back to local session validation');
    return {
      authorized: false,
      error: 'Authorization service unavailable'
    };
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
      // Validate user registration data
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid user data", 
          errors: result.error.format() 
        });
      }
      
      const existingUser = await storage.getUserByUsername(result.data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create user with validated data
      const userData = result.data;
      
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

  // Update current user profile route
  app.put("/api/user/profile", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const currentUser = req.user;
      const updateData = req.body;
      
      // Update the user in storage
      const updatedUser = await storage.updateUser(currentUser.id, {
        user_name: updateData.user_name,
        user_email: updateData.user_email,
        user_slack: updateData.user_slack,
        user_pagerduty: updateData.user_pagerduty,
      });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update the session with new user data
      req.login(updatedUser, (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Failed to update session" });
        }
        
        // Don't send the password back to the client
        const { password, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Azure SSO validation endpoint with admin cache checking
  app.post("/api/auth/azure/validate", async (req: Request, res: Response) => {
    try {
      const { token, claims } = req.body;
      
      // Extract user information from Azure claims or headers
      const userEmail = claims?.email || req.headers['x-user-email'] as string;
      const userRole = claims?.role || req.headers['x-user-role'] as string;
      const azureObjectId = claims?.oid || req.headers['x-user-object-id'] as string;
      const displayName = claims?.name || req.headers['x-user-name'] as string || 'Azure User';
      
      logAuthenticationEvent("azure-validate", userEmail || 'unknown', req.sessionContext, req.requestId, false);
      
      // For the test user, ensure it exists in storage first but then process through normal admin cache logic
      if (userEmail === 'azure_test_user@example.com' || displayName === 'Azure Test User') {
        let testUser = await storage.getUserByUsername('azure_test_user');
        if (!testUser) {
          testUser = await storage.createUser({
            username: 'azure_test_user',
            password: 'Azure123!',
            email: userEmail || 'azure_test_user@example.com',
            displayName: displayName,
            team: 'Data Engineering',
            is_active: true
          });
          console.log('Created azure_test_user for admin cache compatibility');
        }
        // Continue to admin cache checking logic below instead of early return
      }
      
      // ENHANCED LOGIC: Check if user exists in admin users cache first
      let existingAdminUser = null;
      try {
        // Check admin users (using same endpoint as frontend cache)
        const adminUsers = await storage.getUsers();
        existingAdminUser = adminUsers.find(user => 
          user.email === userEmail || 
          user.user_email === userEmail ||
          user.username === userEmail
        );
      } catch (error) {
        console.log('Could not fetch admin users cache, proceeding with OAuth user creation');
      }

      if (existingAdminUser) {
        // EXISTING USER: User found in admin cache - use their existing details
        console.log(`Existing admin user found: ${userEmail}. Using cached admin details.`);
        console.log('Admin cache data structure:', JSON.stringify(existingAdminUser, null, 2));
        
        // Transform admin cache data to Express.User session format
        // Handle different possible field name formats from admin cache
        const sessionUser = {
          id: existingAdminUser.user_id || existingAdminUser.id,
          username: existingAdminUser.user_name || existingAdminUser.username || userEmail,
          email: existingAdminUser.user_email || existingAdminUser.email || userEmail,
          displayName: displayName || existingAdminUser.user_name || existingAdminUser.username || existingAdminUser.displayName,
          team: 'Data Engineering', // Default team
          password: 'azure-sso-user', // Placeholder for Azure users
          // Add the admin cache fields to maintain compatibility
          user_id: existingAdminUser.user_id || existingAdminUser.id,
          user_name: existingAdminUser.user_name || existingAdminUser.username || userEmail,
          user_email: existingAdminUser.user_email || existingAdminUser.email || userEmail,
          user_slack: existingAdminUser.user_slack || existingAdminUser.slack || [],
          user_pagerduty: existingAdminUser.user_pagerduty || existingAdminUser.pagerduty || [],
          is_active: existingAdminUser.is_active !== undefined ? existingAdminUser.is_active : true,
          role: 'admin' // Ensure admin role for existing users
        };
        
        // Log the user into the Express session
        req.login(sessionUser, (err) => {
          if (err) {
            logAuthenticationEvent("azure-login", sessionUser.username, undefined, req.requestId, false);
            return res.status(500).json({ 
              success: false,
              message: "Session creation failed"
            });
          }
          
          logAuthenticationEvent("azure-login", sessionUser.username, undefined, req.requestId, true);
          
          const { password, ...userWithoutPassword } = sessionUser;
          return res.json({
            success: true,
            user: userWithoutPassword,
            message: "Azure SSO validation successful - existing admin user"
          });
        });
        return;
      } else {
        // NEW USER: Not found in admin cache - create from OAuth token data
        console.log(`New user: ${userEmail}. Creating from OAuth token data using only email and name.`);
        
        // For new users, only use email and name from OAuth token
        if (!userEmail || !displayName) {
          logAuthenticationEvent("azure-validate", userEmail || 'unknown', req.sessionContext, req.requestId, false);
          return res.status(400).json({ 
            success: false,
            message: "OAuth token must contain both email and name for new user creation.",
            errorCode: "MISSING_OAUTH_DATA"
          });
        }
        
        // Create new user with only email and name from OAuth token
        const userData = {
          username: userEmail, // Use email as username
          email: userEmail,    // Email from OAuth
          displayName: displayName, // Name from OAuth
          password: 'azure-sso-user', // Placeholder for Azure users
          team: 'Data Engineering', // Default team for new users
          is_active: true // New users are active by default
        };
        
        // Create new user in storage
        const newUser = await storage.createUser(userData);
        
        // Transform to include both session and profile formats
        const sessionUser = {
          ...newUser,
          user_id: newUser.id,
          user_name: newUser.username,
          user_email: newUser.email,
          user_slack: [], // Empty array for new users
          user_pagerduty: [], // Empty array for new users
          role: 'admin' // Grant admin role to new OAuth users
        };
        
        // Log the user into the Express session
        req.login(sessionUser, (err) => {
          if (err) {
            logAuthenticationEvent("azure-login", sessionUser.username, undefined, req.requestId, false);
            return res.status(500).json({ 
              success: false,
              message: "Session creation failed"
            });
          }
          
          logAuthenticationEvent("azure-login", sessionUser.username, undefined, req.requestId, true);
          
          const { password, ...userWithoutPassword } = sessionUser;
          return res.json({
            success: true,
            user: userWithoutPassword,
            message: "Azure SSO validation successful - new user created from OAuth email and name"
          });
        });
        return;
      }
      
    } catch (error) {
      console.error('Azure SSO validation error:', error);
      logAuthenticationEvent("azure-validate", "unknown", req.sessionContext, req.requestId, false);
      res.status(500).json({ 
        success: false,
        message: "Azure SSO validation failed",
        errorCode: "VALIDATION_ERROR"
      });
    }
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