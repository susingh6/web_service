/**
 * Example of how the structured logging would work with actual FastAPI session data
 * This demonstrates the enriched logging format when FastAPI is available
 */

// Example FastAPI session response (from your curl example)
const exampleFastApiResponse = {
  user: {
    user_id: 1,
    email: "sunpreet.saluja@gmail.com",
    name: "Sunpreet Singh",
    roles: ["sla-admin"],
    type: "client_credentials",
    notification_id: null
  },
  session: {
    session_id: "f7e215b0-c8a6-452b-90e7-a3e59015032e",
    session_type: "api",
    created_at: "2025-07-11T16:15:06.427394+00:00",
    expires_at: "2025-07-11T17:15:06.427436+00:00",
    last_activity: "2025-07-11T16:15:06.431220+00:00",
    storage_type: "redis"
  }
};

// Example of how the structured log would look with FastAPI session enrichment
const exampleEnrichedLog = {
  event: "GET /api/dashboard/summary - Parameters: tenant=Data Engineering, startDate=2025-06-01 - status: 200",
  session_id: "f7e215b0-c8a6-452b-90e7-a3e59015032e",
  notification_id: null,
  user_id: 1,
  email: "sunpreet.saluja@gmail.com",
  session_type: "client_credentials",
  roles: "sla-admin",
  request_id: "85acf96f-3833-4976-8372-0c471e49cb49",
  logger: "app.express.server",
  level: "info",
  timestamp: "2025-07-11T16:19:53.604Z",
  duration_ms: 4,
  status_code: 200
};

/**
 * When FastAPI is available and returns session data, the login process will:
 * 1. Authenticate with FastAPI using basic auth
 * 2. Receive session data with user context
 * 3. Store session data in the Express user object
 * 4. All subsequent requests will have enriched logging with:
 *    - Real session_id from FastAPI
 *    - user_id from FastAPI
 *    - email from FastAPI
 *    - session_type from FastAPI
 *    - roles from FastAPI
 *    - notification_id from FastAPI
 * 
 * The logging format matches your FastAPI structlog implementation perfectly.
 */