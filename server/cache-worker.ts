import { Worker } from 'worker_threads';
import { parentPort, workerData } from 'worker_threads';
import { storage } from './storage';
import { Entity, Team } from '@shared/schema';
import { DashboardMetrics, CacheRefreshData, calculateMetrics, ComplianceTrendData, ComplianceTrendPoint } from '@shared/cache-types';

// FastAPI configuration
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8080';
const USE_FASTAPI = process.env.ENABLE_FASTAPI_INTEGRATION === 'true';

// Service account credentials for authentication
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
      return null;
    }

    // Create basic auth header for service account
    const credentials = Buffer.from(`${SERVICE_CLIENT_ID}:${SERVICE_CLIENT_SECRET}`).toString('base64');
    
    console.log('[Cache Worker] Authenticating service account with FastAPI');
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
    
    // Store service session with expiration
    const loginTime = new Date();
    const expiresAt = new Date(loginTime.getTime() + (23 * 60 * 60 * 1000)); // 23 hours (before 24h expiry)
    
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
async function fastApiRequest(endpoint: string, retries = 2): Promise<any> {
  const url = `${FASTAPI_BASE_URL}${endpoint}`;
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
async function fetchTenantsFromFastAPI(): Promise<any[]> {
  return await fastApiRequest('/api/v1/tenants');
}

async function fetchTeamsFromFastAPI(): Promise<any[]> {
  return await fastApiRequest('/api/v1/teams');
}

async function fetchPresetsFromFastAPI(): Promise<any> {
  return await fastApiRequest('/api/v1/presets');
}

async function fetchComplianceFromFastAPI(): Promise<any> {
  return await fastApiRequest('/api/v1/compliance');
}

async function fetchSlaFromFastAPI(): Promise<any[]> {
  return await fastApiRequest('/api/v1/sla');
}

async function fetchUsersFromFastAPI(): Promise<any[]> {
  return await fastApiRequest('/api/v1/users');
}

async function fetchRolesFromFastAPI(): Promise<any[]> {
  return await fastApiRequest('/api/v1/roles');
}

async function fetchConflictsFromFastAPI(): Promise<any[]> {
  return await fastApiRequest('/api/v1/conflicts');
}

async function fetchAllTasksFromFastAPI(): Promise<any> {
  return await fastApiRequest('/api/v1/sla/all_tasks');
}

// Worker thread main function
async function refreshCacheData(): Promise<CacheRefreshData> {
  try {
    console.log(`[Cache Worker] Starting cache refresh (FastAPI: ${USE_FASTAPI ? 'enabled' : 'disabled'})`);
    
    if (USE_FASTAPI) {
      return await refreshFromFastAPI();
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
async function refreshFromFastAPI(): Promise<CacheRefreshData> {
  console.log('[Cache Worker] Refreshing cache from FastAPI endpoints');
  
  try {
    // Call all FastAPI endpoints in parallel for better performance
    const [tenantsData, teamsData, presetsData, complianceData, slaData, usersData, rolesData, conflictsData, allTasksData] = await Promise.all([
      fetchTenantsFromFastAPI(),
      fetchTeamsFromFastAPI(),
      fetchPresetsFromFastAPI(),
      fetchComplianceFromFastAPI(),
      fetchSlaFromFastAPI(),
      fetchUsersFromFastAPI(),
      fetchRolesFromFastAPI(),
      fetchConflictsFromFastAPI(),
      fetchAllTasksFromFastAPI(),
    ]);

    // Map FastAPI data to our cache structure
    const entities = mapSlaDataToEntities(slaData);
    const teams = mapFastAPITeamsToTeams(teamsData);
    const tenants = mapFastAPITenantsToTenants(tenantsData);
    const users = mapFastAPIUsersToUsers(usersData);
    const roles = mapFastAPIRolesToRoles(rolesData);
    const conflicts = mapFastAPIConflictsToConflicts(conflictsData);
    
    // Extract metrics and trends from presets and compliance data (with fallback calculation)
    const { last30DayMetrics, complianceTrends, teamMetrics, teamTrends } = extractMetricsAndTrends(presetsData, complianceData, entities, tenants);

    // Process all tasks data
    const processedAllTasksData = allTasksData ? {
      dagTasks: Array.isArray(allTasksData) ? allTasksData : [],
      lastUpdated: new Date()
    } : null;

    const cacheData: CacheRefreshData & { users: any[], roles: any[], conflicts: any[] } = {
      entities,
      teams,
      tenants,
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
      lastUpdated: new Date()
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
  
  // Load all entities, teams, tenants, users, roles, and conflicts
  const entities = await storage.getEntities();
  const teams = await storage.getTeams();
  const tenants = await storage.getTenants();
  const users = await storage.getUsers();
  const roles = await storage.getUserRoles();
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
  parentPort.on('message', async (message: { type: string }) => {
    if (message.type === 'refresh') {
      try {
        const cacheData = await refreshCacheData();
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