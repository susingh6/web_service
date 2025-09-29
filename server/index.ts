import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { sessionContextMiddleware, structuredLogger } from "./middleware/structured-logging";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// TLS enforcement for staging and production environments only
const environment = process.env.NODE_ENV || 'development';
if (environment === 'staging' || environment === 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Check if request is HTTPS
    const isHttps = req.secure || 
                   req.get('x-forwarded-proto') === 'https' ||
                   req.get('x-forwarded-ssl') === 'on';
    
    if (!isHttps) {
      // Redirect HTTP to HTTPS
      const httpsUrl = `https://${req.get('host')}${req.url}`;
      return res.redirect(301, httpsUrl);
    }
    
    // Add security headers for HTTPS requests
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Forwarded-Proto', 'https');
    
    next();
  });
}

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

  // Terminal API 404 handler - prevents unhandled API routes from falling through to SPA fallback
  // But allow FastAPI fallback routes to pass through first
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Only catch routes that don't match expected patterns
    if (req.originalUrl.startsWith('/api/v1/') || req.originalUrl.startsWith('/api/entities') || 
        req.originalUrl.startsWith('/api/dashboard') || req.originalUrl.startsWith('/api/teams') ||
        req.originalUrl.startsWith('/api/tenants') || req.originalUrl.startsWith('/api/users') ||
        req.originalUrl.startsWith('/api/auth') || req.originalUrl.startsWith('/api/health') ||
        req.originalUrl.startsWith('/api/cache') || req.originalUrl.startsWith('/api/debug')) {
      // These should have been handled by actual routes - if we get here, they're truly missing
      return res.status(404).json({ 
        error: 'NOT_FOUND', 
        message: `API endpoint ${req.originalUrl} not found`,
        method: req.method,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    }
    // Let other /api/* routes fall through to potential handlers
    next();
  });

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
  // CRITICAL FIX: Bind to 0.0.0.0 instead of 127.0.0.1 to allow external WebSocket connections
  server.listen(port, '0.0.0.0', () => {
    log(`serving on port ${port} (binding to 0.0.0.0 for WebSocket support)`);
  });
})();
