import { Worker } from 'worker_threads';
import { parentPort, workerData } from 'worker_threads';
import { storage } from './storage';
import { Entity, Team } from '@shared/schema';
import { DashboardMetrics, CacheRefreshData, calculateMetrics, ComplianceTrendData, ComplianceTrendPoint, SlimEntity, EntitiesComplianceData } from '@shared/cache-types';

// FastAPI configuration
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';

// Service account credentials for authentication
// In production (K8s), these should be mounted from K8s secrets:
// kubectl create secret generic fastapi-service-account \
//   --from-literal=client-id=<your-client-id> \
//   --from-literal=client-secret=<your-client-secret>
// Then reference in deployment.yaml:
//   env:
//     - name: SERVICE_CLIENT_ID
//       valueFrom:
//         secretKeyRef:
//           name: fastapi-service-account
//           key: client-id
//     - name: SERVICE_CLIENT_SECRET
//       valueFrom:
//         secretKeyRef:
//           name: fastapi-service-account
//           key: client-secret
const SERVICE_CLIENT_ID = process.env.SERVICE_CLIENT_ID;
const SERVICE_CLIENT_SECRET = process.env.SERVICE_CLIENT_SECRET;

// Service session management
interface ServiceSession {
  sessionId: string;
  loginTime: Date;
  expiresAt: Date;
  isValid: boolean;
}

let serviceSession: ServiceSession | null = null;

// Service account authentication function
async function authenticateServiceAccount(): Promise<string | null> {
  try {
    if (!SERVICE_CLIENT_ID || !SERVICE_CLIENT_SECRET) {
      console.warn('[Cache Worker] SERVICE_CLIENT_ID and SERVICE_CLIENT_SECRET environment variables are required for FastAPI authentication');
      console.warn('[Cache Worker] In production, these should be mounted from K8s secrets as environment variables');
      return null;
    }

    // Create basic auth header for service account (client credentials)
    const credentials = Buffer.from(`${SERVICE_CLIENT_ID}:${SERVICE_CLIENT_SECRET}`).toString('base64');
    
    console.log('[Cache Worker] Authenticating service account with FastAPI using client credentials');
    const response = await fetch(`${FASTAPI_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`[Cache Worker] Service account authentication failed: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const sessionData = await response.json();
    const sessionId = sessionData.session?.session_id;
    
    if (!sessionId) {
      console.error('[Cache Worker] No session ID received from FastAPI authentication');
      return null;
    }
    
    // Use expiry time from FastAPI response if available, otherwise fallback to 1 hour
    const loginTime = new Date();
    let expiresAt: Date;
    
    if (sessionData.session?.expires_at) {
      expiresAt = new Date(sessionData.session.expires_at);
      console.log(`[Cache Worker] Using session expiry from FastAPI: ${expiresAt.toISOString()}`);
    } else {
      // Fallback: Client credential sessions typically expire after 1 hour
      expiresAt = new Date(loginTime.getTime() + (55 * 60 * 1000)); // 55 minutes (refresh before 1hr expiry)
      console.log(`[Cache Worker] No expiry in response, using 55-minute fallback: ${expiresAt.toISOString()}`);
    }
    
    serviceSession = {
      sessionId,
      loginTime,
      expiresAt,
      isValid: true
    };
    
    console.log(`[Cache Worker] Service account authenticated successfully, session expires at: ${expiresAt.toISOString()}`);
    return sessionId;
    
  } catch (error) {
    console.error('[Cache Worker] Service account authentication error:', error);
    return null;
  }
}

// Get valid service session ID (with automatic refresh)
async function getServiceSessionId(): Promise<string | null> {
  const now = new Date();
  
  // Check if we have a valid session that's not near expiry
  if (serviceSession && serviceSession.isValid && serviceSession.expiresAt > now) {
    return serviceSession.sessionId;
  }
  
  // Session is missing, invalid, or near expiry - authenticate
  console.log('[Cache Worker] Service session missing or expired, re-authenticating...');
  serviceSession = null; // Clear existing session
  
  return await authenticateServiceAccount();
}

// FastAPI client functions with timeout, retry, and authentication
async function fastApiRequest(endpoint: string, queryParams?: Record<string, string>, retries = 2): Promise<any> {
  // Build URL with query parameters if provided
  let url = `${FASTAPI_BASE_URL}${endpoint}`;
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams(queryParams);
    url += `?${params.toString()}`;
  }
  console.log(`[Cache Worker] FastAPI request: ${url}`);
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Get authentication session ID
      const sessionId = await getServiceSessionId();
      if (!sessionId) {
        throw new Error('Failed to obtain service account session for FastAPI authentication');
      }
      
      // Add timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId, // CRITICAL: Add authentication header for RBAC
      };
      
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        console.warn(`[Cache Worker] Authentication failed (${response.status}), invalidating session and retrying...`);
        serviceSession = null; // Force re-authentication
        
        if (attempt < retries) {
          continue; // Retry with fresh authentication
        } else {
          throw new Error(`FastAPI authentication failed: ${response.status} ${response.statusText}`);
        }
      }

      if (!response.ok) {
        throw new Error(`FastAPI request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[Cache Worker] FastAPI response from ${endpoint} (${attempt + 1}/${retries + 1}): Success`);
      return data;
      
    } catch (error) {
      const isLastAttempt = attempt === retries;
      
      if ((error as Error).name === 'AbortError') {
        console.error(`[Cache Worker] FastAPI request to ${endpoint} timed out (attempt ${attempt + 1}/${retries + 1})`);
      } else {
        console.error(`[Cache Worker] FastAPI request to ${endpoint} failed (attempt ${attempt + 1}/${retries + 1}):`, error);
      }
      
      if (isLastAttempt) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`[Cache Worker] Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}

// FastAPI endpoint functions - Updated to use /api/v1/ with RBAC
async function fetchTenantsFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any[]> {
  return await fastApiRequest('/api/v1/tenants', { cache_build_type: buildType });
}

async function fetchTeamsFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any[]> {
  return await fastApiRequest('/api/v1/teams', { cache_build_type: buildType });
}

async function fetchPresetsFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any> {
  return await fastApiRequest('/api/v1/presets', { cache_build_type: buildType });
}

async function fetchComplianceFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<EntitiesComplianceData[]> {
  const data = await fastApiRequest('/api/v1/compliance', { cache_build_type: buildType });
  return Array.isArray(data) ? data as EntitiesComplianceData[] : [];
}

async function fetchSlaFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<SlimEntity[]> {
  const data = await fastApiRequest('/api/v1/sla', { cache_build_type: buildType });
  // Map to slim entities projection expected in Redis
  if (!Array.isArray(data)) return [];
  return (data as any[]).map((e: any) => {
    const entity_type = e.entity_type || e.type;
    const entity_schedule = entity_type === 'dag'
      ? (e.dag_schedule || e.entity_schedule || e.table_schedule || null)
      : (e.table_schedule || e.entity_schedule || e.dag_schedule || null);
    return {
      entity_type,
      tenant_id: e.tenant_id,
      tenant_name: e.tenant_name,
      team_id: e.team_id,
      team_name: e.team_name,
      entity_name: e.entity_name || e.name,
      entity_display_name: e.entity_display_name || e.table_name || e.dag_name || e.name || null,
      entity_schedule,
      expected_runtime_minutes: e.expected_runtime_minutes ?? null,
      is_entity_owner: e.is_entity_owner === true,
      is_active: e.is_active !== false,
      owner_entity_ref_name: e.owner_entity_ref_name ?? null,
      server_name: e.server_name ?? null,
    } as SlimEntity;
  });
}

async function fetchUsersFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any[]> {
  return await fastApiRequest('/api/v1/users', { cache_build_type: buildType });
}

async function fetchRolesFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any[]> {
  return await fastApiRequest('/api/v1/roles', { cache_build_type: buildType });
}

async function fetchConflictsFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any[]> {
  return await fastApiRequest('/api/v1/conflicts', { cache_build_type: buildType });
}

async function fetchAllTasksFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any> {
  return await fastApiRequest('/api/v1/sla/all_tasks', { cache_build_type: buildType });
}

async function fetchPermissionsFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<any[]> {
  return await fastApiRequest('/api/v1/get_all_permissions', { cache_build_type: buildType });
}

// Worker thread main function
async function refreshCacheData(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<CacheRefreshData> {
  try {
    console.log(`[Cache Worker] Starting cache refresh (FastAPI: ${USE_FASTAPI ? 'enabled' : 'disabled'}, Build Type: ${buildType})`);
    
    if (USE_FASTAPI) {
      return await refreshFromFastAPI(buildType);
    } else {
      return await refreshFromStorage();
    }
    
  } catch (error) {
    console.error('[Cache Worker] Failed to refresh cache:', error);
    // Try fallback to storage if FastAPI fails
    if (USE_FASTAPI) {
      console.log('[Cache Worker] FastAPI failed, falling back to storage');
      try {
        return await refreshFromStorage();
      } catch (storageError) {
        console.error('[Cache Worker] Storage fallback also failed:', storageError);
        throw error;
      }
    }
    throw error;
  }
}

// FastAPI data refresh
async function refreshFromFastAPI(buildType: 'Regular' | 'Forced' = 'Regular'): Promise<CacheRefreshData> {
  console.log(`[Cache Worker] Refreshing cache from FastAPI endpoints (Build Type: ${buildType})`);
  
  try {
    // Call all FastAPI endpoints in parallel for better performance with cache_build_type parameter
    const [tenantsData, teamsData, presetsData, complianceData, slaData, usersData, rolesData, conflictsData, allTasksData, permissionsData] = await Promise.all([
      fetchTenantsFromFastAPI(buildType),
      fetchTeamsFromFastAPI(buildType),
      fetchPresetsFromFastAPI(buildType),
      fetchComplianceFromFastAPI(buildType),
      fetchSlaFromFastAPI(buildType),
      fetchUsersFromFastAPI(buildType),
      fetchRolesFromFastAPI(buildType),
      fetchConflictsFromFastAPI(buildType),
      fetchAllTasksFromFastAPI(buildType),
      fetchPermissionsFromFastAPI(buildType),
    ]);

    // Map FastAPI data to our cache structure
    // For backward compatibility, derive full entities from slim as needed
    const entities = mapSlaDataToEntities(slaData as any[]);
    const teams = mapFastAPITeamsToTeams(teamsData);
    const tenants = mapFastAPITenantsToTenants(tenantsData);
    const users = mapFastAPIUsersToUsers(usersData);
    const roles = mapFastAPIRolesToRoles(rolesData);
    const conflicts = mapFastAPIConflictsToConflicts(conflictsData);
    const permissions = mapFastAPIPermissionsToPermissions(permissionsData);
    
    // Extract metrics and trends from presets and compliance data (with fallback calculation)
    const { last30DayMetrics, complianceTrends, teamMetrics, teamTrends } = extractMetricsAndTrends(presetsData, complianceData, entities, tenants);

    // Process all tasks data
    const processedAllTasksData = allTasksData ? {
      dagTasks: Array.isArray(allTasksData) ? allTasksData : [],
      lastUpdated: new Date()
    } : null;

    const cacheData: CacheRefreshData & { users: any[], roles: any[], conflicts: any[], source: 'fastapi' | 'express', entitiesSlim?: SlimEntity[], entitiesCompliance?: EntitiesComplianceData[] } = {
      entities,
      teams,
      tenants,
      permissions,
      users,
      roles,
      conflicts,
      metrics: {}, // Empty for dynamic calculations
      last30DayMetrics,
      complianceTrends,
      todayMetrics: {},
      yesterdayMetrics: {},
      last7DayMetrics: {},
      thisMonthMetrics: {},
      todayTrends: {},
      yesterdayTrends: {},
      last7DayTrends: {},
      last30DayTrends: {}, // Fix: Add missing required property
      thisMonthTrends: {},
      allTasksData: processedAllTasksData,
      lastUpdated: new Date(),
      source: 'fastapi',
      // New Redis-first payloads
      entitiesSlim: slaData as SlimEntity[],
      entitiesCompliance: complianceData as EntitiesComplianceData[],
    };

    console.log('[Cache Worker] FastAPI cache refresh completed');
    return cacheData;
    
  } catch (error) {
    console.error('[Cache Worker] FastAPI refresh failed:', error);
    throw error;
  }
}

// Storage-based data refresh (original logic)
async function refreshFromStorage(): Promise<CacheRefreshData> {
  console.log('[Cache Worker] Refreshing cache from storage');
  
  // If Redis is connected in primary mode, do NOT seed from storage.
  // Return an empty payload for cache write so reads stay empty until FastAPI is available
  // (Express endpoints can still serve storage directly when Redis is unavailable).
  try {
    const { redisCache } = await import('./redis-cache');
    const status = await redisCache.getCacheStatus();
    if (status && status.mode === 'redis') {
      console.warn('[Cache Worker] Redis connected; skipping storage seeding to honor Redis-first policy');
      return {
        entities: [],
        teams: [],
        tenants: [],
        permissions: [],
        users: [],
        roles: [],
        conflicts: [],
        metrics: {},
        last30DayMetrics: {},
        complianceTrends: {},
        todayMetrics: {},
        yesterdayMetrics: {},
        last7DayMetrics: {},
        thisMonthMetrics: {},
        todayTrends: {},
        yesterdayTrends: {},
        last7DayTrends: {},
        last30DayTrends: {},
        thisMonthTrends: {},
        allTasksData: null,
        lastUpdated: new Date(),
        source: 'express'
      } as any;
    }
  } catch {}
  
  // Load all entities, teams, tenants, users, roles, permissions, and conflicts
  const entities = await storage.getEntities();
  const teams = await storage.getTeams();
  const tenants = await storage.getTenants();
  const users = await storage.getUsers();
  const roles = await storage.getUserRoles();
  const permissions = await storage.getPermissions();
  const conflicts: any[] = []; // TODO: Implement getConflictNotifications in storage interface or use alternative method

  // Calculate metrics for each tenant (default 30-day cache)
  const last30DayMetrics: Record<string, DashboardMetrics> = {};
  const complianceTrends: Record<string, ComplianceTrendData> = {};
  
  for (const tenant of tenants) {
    const allTenantEntities = entities.filter(e => e.tenant_name === tenant.name);
    // Only consider entity owners for metrics calculations
    const tenantEntities = allTenantEntities.filter(e => e.is_entity_owner === true);
    const tenantTables = tenantEntities.filter(e => e.type === 'table');
    const tenantDags = tenantEntities.filter(e => e.type === 'dag');

    last30DayMetrics[tenant.name] = calculateMetrics(tenantEntities, tenantTables, tenantDags);
    complianceTrends[tenant.name] = generateComplianceTrend(tenantEntities, tenantTables, tenantDags);
  }

  const cacheData: CacheRefreshData & { users: any[], roles: any[], conflicts: any[] } = {
    entities,
    teams,
    tenants,
    permissions,
    users,
    roles,
    conflicts,
    metrics: {}, // Empty for dynamic calculations
    last30DayMetrics,
    complianceTrends,
    todayMetrics: {},
    yesterdayMetrics: {},
    last7DayMetrics: {},
    thisMonthMetrics: {},
    todayTrends: {},
    yesterdayTrends: {},
    last7DayTrends: {},
    last30DayTrends: {}, // Fix: Add missing required property
    thisMonthTrends: {},
    allTasksData: null, // No FastAPI available for storage mode
    lastUpdated: new Date()
  };

  console.log('[Cache Worker] Storage cache refresh completed');
  return cacheData;
}

// Data mapping functions for FastAPI responses
function mapSlaDataToEntities(slaData: any[]): Entity[] {
  if (!Array.isArray(slaData)) {
    console.warn('[Cache Worker] SLA data is not an array, returning empty entities');
    return [];
  }

  return slaData.map((item: any, index: number) => ({
    id: item.id || index + 1,
    name: item.name || item.entity_name || `Entity ${index + 1}`,
    type: item.type || item.entity_type || 'table',
    teamId: item.team_id || 1,
    description: item.description || null,
    slaTarget: item.sla_target || item.target_sla || 95,
    currentSla: item.current_sla || item.compliance_percentage || null,
    status: item.status || item.sla_status || 'Unknown',
    refreshFrequency: item.refresh_frequency || 'daily',
    lastRefreshed: item.last_refreshed ? new Date(item.last_refreshed) : null,
    tenant_name: item.tenant_name || item.tenant || 'Default',
    team_name: item.team_name || item.team || 'Default Team',
    owner_email: item.owner_email || item.email || null,
    user_email: item.user_email || null,
    is_active: item.is_active !== false,
    notification_preference_id: item.notification_preference_id || null,
    notification_timeline_id: item.notification_timeline_id || null,
    priority_zone: item.priority_zone || 'medium',
    dependency_entities: item.dependency_entities || [],
    downstream_entities: item.downstream_entities || [],
    tags: item.tags || [],
    business_criticality: item.business_criticality || 'medium',
    data_sensitivity: item.data_sensitivity || 'internal',
    compliance_frameworks: item.compliance_frameworks || [],
    last_incident_date: item.last_incident_date ? new Date(item.last_incident_date) : null,
    incident_count_30d: item.incident_count_30d || 0,
    avg_resolution_time_hours: item.avg_resolution_time_hours || null,
    escalation_path: item.escalation_path || [],
    monitoring_enabled: item.monitoring_enabled !== false,
    auto_remediation_enabled: item.auto_remediation_enabled === true,
    custom_metrics: item.custom_metrics || {},
    documentation_url: item.documentation_url || null,
    runbook_url: item.runbook_url || null,
    source_system: item.source_system || null,
    created_by_user_id: item.created_by_user_id || null,
    is_entity_owner: item.is_entity_owner !== false,
    owner_entity_reference: item.owner_entity_reference ?? null,
    // Add missing required properties
    nextRefresh: item.next_refresh ? new Date(item.next_refresh) : new Date(Date.now() + 24 * 60 * 60 * 1000),
    owner: item.owner || item.owner_email || 'Unknown',
    ownerEmail: item.owner_email || item.email || null,
    schema_name: item.schema_name || item.schema || null,
    table_name: item.table_name || item.name || 'unknown_table',
    table_description: item.table_description || '',
    table_schedule: item.table_schedule || null,
    table_dependency: item.table_dependency || [],
    dag_name: item.dag_name || item.name || 'unknown_dag',
    dag_description: item.dag_description || '',
    dag_schedule: item.dag_schedule || null,
    dag_dependency: item.dag_dependency || [],
    server_name: item.server_name || null,
    expected_runtime_minutes: item.expected_runtime_minutes ?? null,
    task_count: item.task_count || 0,
    successful_runs_24h: item.successful_runs_24h || 0,
    failed_runs_24h: item.failed_runs_24h || 0,
    avg_runtime_minutes: item.avg_runtime_minutes || 0,
    data_freshness_score: item.data_freshness_score || 100,
    quality_score: item.quality_score || 100,
    lineage_upstream_count: item.lineage_upstream_count || 0,
    lineage_downstream_count: item.lineage_downstream_count || 0,
    storage_size_gb: item.storage_size_gb || 0,
    row_count: item.row_count || 0,
    column_count: item.column_count || 0,
    last_schema_change: item.last_schema_change ? new Date(item.last_schema_change) : null,
    notification_preferences: item.notification_preferences || [],
    donemarker_location: item.donemarker_location || '',
    donemarker_lookback: item.donemarker_lookback || 0,
    lastRun: item.last_run ? new Date(item.last_run) : null,
    lastStatus: item.last_status || null,
    createdAt: item.created_at ? new Date(item.created_at) : new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  }));
}

function mapFastAPITeamsToTeams(teamsData: any[]): Team[] {
  if (!Array.isArray(teamsData)) {
    console.warn('[Cache Worker] Teams data is not an array, returning empty teams');
    return [];
  }

  return teamsData.map((item: any, index: number) => ({
    id: item.id || item.team_id || index + 1, // Ensure ID is always present
    name: item.name || item.team_name || `Team ${index + 1}`,
    description: item.description || null,
    tenant_id: item.tenant_id || 1,
    team_members_ids: Array.isArray(item.team_members_ids) ? item.team_members_ids : [],
    team_email: Array.isArray(item.team_email) ? item.team_email : (item.team_email ? [item.team_email] : []),
    team_slack: Array.isArray(item.team_slack) ? item.team_slack : (item.team_slack ? [item.team_slack] : []),
    team_pagerduty: Array.isArray(item.team_pagerduty) ? item.team_pagerduty : (item.team_pagerduty ? [item.team_pagerduty] : []),
    team_notify_preference_id: item.team_notify_preference_id || null,
    isActive: item.is_active !== false, // Add missing required property
    createdAt: item.created_at ? new Date(item.created_at) : new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  }));
}

// Fix type safety for tenants
interface Tenant {
  id: number;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapFastAPITenantsToTenants(tenantsData: any[]): Tenant[] {
  if (!Array.isArray(tenantsData)) {
    console.warn('[Cache Worker] Tenants data is not an array, returning empty tenants');
    return [];
  }

  return tenantsData.map((item: any, index: number) => ({
    id: item.id || item.tenant_id || index + 1, // Ensure ID is always present
    name: item.name || item.tenant_name || `Tenant ${index + 1}`,
    description: item.description || undefined,
    createdAt: item.created_at ? new Date(item.created_at) : new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  }));
}

// Map users data from FastAPI to cache format
function mapFastAPIUsersToUsers(usersData: any[]): any[] {
  if (!Array.isArray(usersData)) {
    console.warn('[Cache Worker] Users data is not an array, returning empty users');
    return [];
  }

  return usersData.map((item: any, index: number) => ({
    id: item.id || item.user_id || index + 1,
    username: item.username || item.user_name || `user${index + 1}`,
    email: item.email || item.user_email,
    displayName: item.display_name || item.displayName,
    team: item.team || null,
    role: item.role || 'user',
    azureObjectId: item.azure_object_id || item.azureObjectId || null,
    createdAt: item.created_at ? new Date(item.created_at) : new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
    // Don't include password in cache for security
  }));
}

// Map roles data from FastAPI to cache format
function mapFastAPIRolesToRoles(rolesData: any[]): any[] {
  if (!Array.isArray(rolesData)) {
    console.warn('[Cache Worker] Roles data is not an array, returning empty roles');
    return [];
  }

  return rolesData.map((item: any, index: number) => ({
    id: item.id || `role${index + 1}`,
    role: item.role || item.name,
    label: item.label || item.display_name || item.role || item.name,
    description: item.description || `Role: ${item.role || item.name}`,
    emails: Array.isArray(item.emails) ? item.emails : [],
  }));
}

// Map permissions data from FastAPI to cache format
function mapFastAPIPermissionsToPermissions(permissionsData: any[]): any[] {
  if (!Array.isArray(permissionsData)) {
    console.warn('[Cache Worker] Permissions data is not an array, returning empty permissions');
    return [];
  }

  return permissionsData.map((item: any, index: number) => ({
    id: item.id || index + 1,
    permission_name: item.permission_name || item.name || `permission${index + 1}`,
    description: item.description || '',
    category: item.category || 'Table',
    is_active: item.is_active !== false,
    createdAt: item.created_at ? new Date(item.created_at) : new Date(),
    updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  }));
}

// Map conflicts data from FastAPI to cache format  
function mapFastAPIConflictsToConflicts(conflictsData: any[]): any[] {
  if (!Array.isArray(conflictsData)) {
    console.warn('[Cache Worker] Conflicts data is not an array, returning empty conflicts');
    return [];
  }

  return conflictsData.map((item: any, index: number) => ({
    id: item.id || index + 1,
    notificationId: item.notification_id || item.notificationId || `CONF-${Date.now()}-${index}`,
    entityType: item.entity_type || item.entityType || 'unknown',
    entityName: item.entity_name || item.entityName,
    conflictingTeams: Array.isArray(item.conflicting_teams) ? item.conflicting_teams : 
                     Array.isArray(item.conflictingTeams) ? item.conflictingTeams : [],
    conflictDetails: item.conflict_details || item.conflictDetails || {},
    originalPayload: item.original_payload || item.originalPayload || {},
    status: item.status || 'pending',
    resolutionType: item.resolution_type || item.resolutionType || null,
    resolutionNotes: item.resolution_notes || item.resolutionNotes || null,
    resolvedBy: item.resolved_by || item.resolvedBy || null,
    createdAt: item.created_at ? new Date(item.created_at) : new Date(),
    resolvedAt: item.resolved_at ? new Date(item.resolved_at) : null,
  }));
}

function extractMetricsAndTrends(
  presetsData: any, 
  complianceData: any, 
  entities: Entity[], 
  tenants: Tenant[]
): {
  last30DayMetrics: Record<string, DashboardMetrics>;
  complianceTrends: Record<string, ComplianceTrendData>;
  teamMetrics: Record<string, Record<string, DashboardMetrics>>;
  teamTrends: Record<string, Record<string, ComplianceTrendData>>;
} {
  const last30DayMetrics: Record<string, DashboardMetrics> = {};
  const complianceTrends: Record<string, ComplianceTrendData> = {};
  const teamMetrics: Record<string, Record<string, DashboardMetrics>> = {};
  const teamTrends: Record<string, Record<string, ComplianceTrendData>> = {};

  try {
    // Extract metrics from presets data - handle both array and object formats
    if (Array.isArray(presetsData)) {
      // New format: array of records with team_id and tenant_id
      presetsData.forEach((record: any) => {
        const tenantName = record.tenant_name || `Tenant ${record.tenant_id}`;
        const teamId = record.team_id || 0;
        
        if (teamId === 0) {
          // Summary data for tenant (no specific team - used in summary dashboard)
          if (record.last30Days) {
            last30DayMetrics[tenantName] = {
              overallCompliance: record.last30Days.overallCompliance || 0,
              tablesCompliance: record.last30Days.tablesCompliance || 0,
              dagsCompliance: record.last30Days.dagsCompliance || 0,
              entitiesCount: record.last30Days.totalEntities || 0,
              tablesCount: record.last30Days.totalTables || 0,
              dagsCount: record.last30Days.totalDags || 0,
            };
          }
        } else {
          // Team-specific data for individual teams (team_id > 0 - used in team dashboards)
          // Note: FastAPI should already exclude inactive entities for team metrics
          const teamName = record.team_name || `Team ${teamId}`;
          
          if (!teamMetrics[tenantName]) {
            teamMetrics[tenantName] = {};
          }
          
          if (record.last30Days) {
            teamMetrics[tenantName][teamName] = {
              overallCompliance: record.last30Days.overallCompliance || 0,
              tablesCompliance: record.last30Days.tablesCompliance || 0,
              dagsCompliance: record.last30Days.dagsCompliance || 0,
              entitiesCount: record.last30Days.totalEntities || 0,
              tablesCount: record.last30Days.totalTables || 0,
              dagsCount: record.last30Days.totalDags || 0,
            };
          }
        }
      });
    } else if (presetsData && typeof presetsData === 'object') {
      // Legacy format: object keyed by tenant name
      Object.keys(presetsData).forEach(tenantName => {
        const tenantData = presetsData[tenantName];
        if (tenantData && tenantData.last30Days) {
          last30DayMetrics[tenantName] = {
            overallCompliance: tenantData.last30Days.overallCompliance || 0,
            tablesCompliance: tenantData.last30Days.tablesCompliance || 0,
            dagsCompliance: tenantData.last30Days.dagsCompliance || 0,
            entitiesCount: tenantData.last30Days.totalEntities || 0,
            tablesCount: tenantData.last30Days.totalTables || 0,
            dagsCount: tenantData.last30Days.totalDags || 0,
          };
        }
      });
    }

    // Extract trends from compliance data - handle both array and object formats
    if (Array.isArray(complianceData)) {
      // New format: array of records with team_id and tenant_id
      complianceData.forEach((record: any) => {
        const tenantName = record.tenant_name || `Tenant ${record.tenant_id}`;
        const teamId = record.team_id || 0;
        
        if (teamId === 0) {
          // Summary trends for tenant (no specific team - used in summary dashboard)
          if (record.trend && Array.isArray(record.trend)) {
            complianceTrends[tenantName] = {
              trend: record.trend.map((point: any) => ({
                date: point.date,
                dateFormatted: point.dateFormatted || new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(point.date)),
                overall: point.overall || 0,
                tables: point.tables || 0,
                dags: point.dags || 0,
              })),
              lastUpdated: record.lastUpdated ? new Date(record.lastUpdated) : new Date(),
            };
          }
        } else {
          // Team-specific trends for individual teams (team_id > 0 - used in team dashboards)
          const teamName = record.team_name || `Team ${teamId}`;
          
          if (!teamTrends[tenantName]) {
            teamTrends[tenantName] = {};
          }
          
          if (record.trend && Array.isArray(record.trend)) {
            teamTrends[tenantName][teamName] = {
              trend: record.trend.map((point: any) => ({
                date: point.date,
                dateFormatted: point.dateFormatted || new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(point.date)),
                overall: point.overall || 0,
                tables: point.tables || 0,
                dags: point.dags || 0,
              })),
              lastUpdated: record.lastUpdated ? new Date(record.lastUpdated) : new Date(),
            };
          }
        }
      });
    } else if (complianceData && typeof complianceData === 'object') {
      // Legacy format: object keyed by tenant name
      Object.keys(complianceData).forEach(tenantName => {
        const tenantTrends = complianceData[tenantName];
        if (tenantTrends && Array.isArray(tenantTrends.trend)) {
          complianceTrends[tenantName] = {
            trend: tenantTrends.trend.map((point: any) => ({
              date: point.date,
              dateFormatted: point.dateFormatted || new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(point.date)),
              overall: point.overall || 0,
              tables: point.tables || 0,
              dags: point.dags || 0,
            })),
            lastUpdated: tenantTrends.lastUpdated ? new Date(tenantTrends.lastUpdated) : new Date(),
          };
        }
      });
    }

    // Fallback: compute metrics and trends from entities when presets/compliance data is missing or incomplete
    const missingMetricsTenants = tenants.filter(tenant => !last30DayMetrics[tenant.name]);
    const missingTrendsTenants = tenants.filter(tenant => !complianceTrends[tenant.name]);
    
    if (missingMetricsTenants.length > 0 || missingTrendsTenants.length > 0) {
      console.log('[Cache Worker] Some metrics/trends missing from FastAPI, computing fallback data');
      
      for (const tenant of tenants) {
        const allTenantEntities = entities.filter(e => e.tenant_name === tenant.name);
        // Only consider entity owners for metrics calculations (matching storage behavior)
        const tenantEntities = allTenantEntities.filter(e => e.is_entity_owner === true);
        const tenantTables = tenantEntities.filter(e => e.type === 'table');
        const tenantDags = tenantEntities.filter(e => e.type === 'dag');
        
        // Compute missing metrics using the same logic as storage
        if (!last30DayMetrics[tenant.name]) {
          last30DayMetrics[tenant.name] = calculateMetrics(tenantEntities, tenantTables, tenantDags);
          console.log(`[Cache Worker] Computed fallback metrics for tenant: ${tenant.name}`);
        }
        
        // Compute missing trends using the same logic as storage
        if (!complianceTrends[tenant.name]) {
          complianceTrends[tenant.name] = generateComplianceTrend(tenantEntities, tenantTables, tenantDags);
          console.log(`[Cache Worker] Computed fallback trends for tenant: ${tenant.name}`);
        }
      }
    }

  } catch (error) {
    console.error('[Cache Worker] Error extracting metrics and trends:', error);
  }

  return { last30DayMetrics, complianceTrends, teamMetrics, teamTrends };
}

// Generate 30-day compliance trend data for a tenant with realistic fluctuations
function generateComplianceTrend(entities: Entity[], tables: Entity[], dags: Entity[]): ComplianceTrendData {
  const trendData: ComplianceTrendPoint[] = [];
  const now = new Date();
  
  // For new tenants with no entities, return all zeros
  if (entities.length === 0) {
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      trendData.push({
        date: date.toISOString().split('T')[0],
        dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
        overall: 0,
        tables: 0,
        dags: 0
      });
    }
    return { trend: trendData, lastUpdated: new Date() };
  }
  
  // Calculate base compliance rates from actual entities
  const baseTablesCompliance = tables.length > 0 
    ? (tables.filter(t => t.status === 'Passed').length / tables.length) * 100
    : 0;
  
  const baseDAGsCompliance = dags.length > 0
    ? (dags.filter(d => d.status === 'Passed').length / dags.length) * 100
    : 0;
  
  const baseOverallCompliance = entities.length > 0
    ? (entities.filter(e => e.status === 'Passed').length / entities.length) * 100
    : 0;
  
  // Generate 30 days of realistic fluctuating data
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Add realistic fluctuations with some trends
    const dayVariation = Math.sin(i * 0.1) * 3; // Cyclical variation
    const randomNoise = (Math.random() - 0.5) * 4; // Random noise ±2%
    const trendImpact = (29 - i) * 0.1; // Slight improvement trend over time
    
    // Apply variations to each metric
    const tablesCompliance = Math.max(0, Math.min(100, 
      baseTablesCompliance + dayVariation + randomNoise + trendImpact * 0.5
    ));
    
    const dagsCompliance = Math.max(0, Math.min(100, 
      baseDAGsCompliance + dayVariation * 0.8 + randomNoise * 1.2 + trendImpact * 0.3
    ));
    
    const overallCompliance = Math.max(0, Math.min(100, 
      baseOverallCompliance + dayVariation * 0.9 + randomNoise + trendImpact * 0.4
    ));
    
    trendData.push({
      date: date.toISOString().split('T')[0],
      dateFormatted: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
      overall: parseFloat(overallCompliance.toFixed(1)),
      tables: parseFloat(tablesCompliance.toFixed(1)),
      dags: parseFloat(dagsCompliance.toFixed(1))
    });
  }
  
  return {
    trend: trendData,
    lastUpdated: new Date()
  };
}

// calculateMetrics function now imported from shared/cache-types.ts

// Worker thread message handler
if (parentPort) {
  // Extract buildType from workerData (defaults to 'Regular' if not provided)
  const buildType: 'Regular' | 'Forced' = (workerData?.buildType as 'Regular' | 'Forced') || 'Regular';
  
  parentPort.on('message', async (message: { type: string }) => {
    if (message.type === 'refresh') {
      try {
        const cacheData = await refreshCacheData(buildType);
        parentPort!.postMessage({ type: 'success', data: cacheData });
      } catch (error) {
        parentPort!.postMessage({ 
          type: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
  });
}

// Export for type checking
export type { CacheRefreshData };