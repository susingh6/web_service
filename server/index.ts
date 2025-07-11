import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { sessionContextMiddleware, structuredLogger } from "./middleware/structured-logging";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add session context middleware for structured logging
app.use(sessionContextMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Check if we have structured logging context
      if (req.sessionContext && req.requestId) {
        // Use structured logging with parameters
        const queryParams = Object.keys(req.query).length > 0 
          ? ` - Parameters: ${Object.entries(req.query).map(([key, value]) => `${key}=${value}`).join(', ')}`
          : '';
        
        // Log response with parameters
        const responseEvent = `${req.method} ${path}${queryParams} - status: ${res.statusCode}`;
        structuredLogger.info(
          responseEvent,
          req.sessionContext,
          req.requestId,
          { 
            duration_ms: duration,
            status_code: res.statusCode
          }
        );
      } else {
        // Fallback to existing logging
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
