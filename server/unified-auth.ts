import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, type InsertUser } from "@shared/schema";
import MemoryStore from "memorystore";

// Define types for our authentication system
declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Convert scrypt callback to Promise-based function
const scryptAsync = promisify(scrypt);

/**
 * Hash a password with a random salt
 * @param password The plain text password to hash
 * @returns The hashed password with salt in format `hash.salt`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * Compare a supplied password with a stored hashed password
 * @param supplied The plain text password to check
 * @param stored The stored password hash with salt
 * @returns True if passwords match, false otherwise
 */
export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  // Handle the case where the stored password might be plain text (for development/testing)
  if (!stored.includes(".")) {
    console.warn("Using insecure plain text password comparison - FOR DEVELOPMENT ONLY");
    return supplied === stored;
  }

  // Normal secure password comparison
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

/**
 * Setup authentication for the application
 * @param app Express application
 * @param options Configuration options 
 */
export function setupAuth(app: Express, options: { 
  isDevelopment?: boolean 
} = {}): void {
  const isDevelopment = options.isDevelopment || process.env.NODE_ENV === "development";
  
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
      // In production, should set secure: true and sameSite: 'strict'
      ...(isDevelopment ? {} : { 
        secure: true, 
        sameSite: 'strict' 
      })
    }
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport to use local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Login attempt for user: ${username}`);
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          console.log(`User not found: ${username}`);
          return done(null, false);
        }
        
        console.log(`Login attempt details (username: ${username})`);
        const passwordsMatch = await comparePasswords(password, user.password);
        console.log(`Password match result: ${passwordsMatch}`);
        
        if (!passwordsMatch) {
          return done(null, false);
        } else {
          return done(null, user);
        }
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
      if (!user) {
        return done(null, false);
      }
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
        return res.status(400).json({ 
          success: false,
          message: "Username already exists" 
        });
      }

      // Create user with hashed password
      let userData: InsertUser;
      if (isDevelopment && req.body.skipPasswordHashing) {
        // Special case for development/testing
        userData = { ...req.body };
        console.warn("Creating user with unhashed password - FOR DEVELOPMENT ONLY");
      } else {
        // Normal secure user creation with password hashing
        const hashedPassword = await hashPassword(req.body.password);
        userData = {
          ...req.body,
          password: hashedPassword,
        };
      }
      
      const user = await storage.createUser(userData);

      // Login the newly registered user
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Don't send the password back to the client
        const { password, ...userWithoutPassword } = user;
        res.status(201).json({
          success: true,
          user: userWithoutPassword
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        success: false,
        message: "Registration failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Login route
  app.post("/api/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) {
        console.error("Authentication error:", err);
        return res.status(500).json({
          success: false,
          message: "Authentication error",
          error: err.message
        });
      }
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid username or password"
        });
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.status(500).json({
            success: false,
            message: "Login failed",
            error: loginErr.message
          });
        }
        
        // Don't send the password back to the client
        const { password, ...userWithoutPassword } = user;
        return res.json({
          success: true,
          user: userWithoutPassword
        });
      });
    })(req, res, next);
  });

  // Logout route
  app.post("/api/logout", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(200).json({
        success: true,
        message: "No active session to logout"
      });
    }
    
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({
          success: false,
          message: "Logout failed",
          error: err.message
        });
      }
      
      res.status(200).json({
        success: true,
        message: "Logged out successfully"
      });
    });
  });

  // Get current user route
  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }
    
    // Don't send the password back to the client
    const { password, ...userWithoutPassword } = req.user;
    res.json({
      success: true,
      user: userWithoutPassword
    });
  });

  // Development routes
  if (isDevelopment) {
    setupDevAuthRoutes(app);
  }
}

/**
 * Setup development-only authentication routes
 * @param app Express application
 */
function setupDevAuthRoutes(app: Express): void {
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
        // For testing, recreate the user to ensure the password is correct
        console.log("User already exists, recreating with correct password");
        
        // In a real app with proper user management, we would update the user here
        // For the demo app, we'll just recreate it
        user = await storage.createUser(testUser);
        console.log("Updated test user with ID:", user.id);
      } else {
        user = await storage.createUser(testUser);
        console.log("Created new test user with ID:", user.id);
      }
      
      res.json({
        success: true,
        message: "Test user ready to use",
        credentials: {
          username: "azure_test_user",
          password: "Azure123!"
        }
      });
    } catch (error) {
      console.error("Error creating test user:", error);
      res.status(500).json({
        success: false,
        message: "Error creating test user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test endpoint to check if test user exists (for debugging)
  app.get("/api/test/user-check", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("azure_test_user");
      if (user) {
        console.log("Test user found with stored password:", user.password);
        res.status(200).json({
          success: true,
          message: "Test user exists",
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            team: user.team,
            password: user.password // WARNING: Only for debugging!
          },
          credentials: {
            username: "azure_test_user",
            password: "Azure123!"
          }
        });
      } else {
        res.status(404).json({
          success: false,
          message: "Test user not found"
        });
      }
    } catch (error) {
      console.error("Error checking test user:", error);
      res.status(500).json({
        success: false,
        message: "Error checking test user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}