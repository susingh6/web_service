import { storage } from "./storage";
import { Entity, Team } from "@shared/schema";
import { config } from "./config";

interface DashboardMetrics {
  overallCompliance: number;
  tablesCompliance: number;
  dagsCompliance: number;
  entitiesCount: number;
  tablesCount: number;
  dagsCount: number;
}

interface CachedData {
  entities: Entity[];
  teams: Team[];
  tenants: Array<{ id: number; name: string; description?: string }>;
  metrics: Record<string, DashboardMetrics>;
  last30DayMetrics: Record<string, DashboardMetrics>; // Default 30-day cache
  lastUpdated: Date;
}

class DataCache {
  private cache: CachedData | null = null;
  private refreshInterval: NodeJS.Timer | null = null;
  private readonly CACHE_DURATION_MS = config.cache.refreshIntervalHours * 60 * 60 * 1000; // Configurable hours

  constructor() {
    this.initializeCache();
    this.startAutoRefresh();
  }

  private async initializeCache(): Promise<void> {
    console.log("Initializing data cache for all tenants and teams...");
    await this.refreshCache();
  }

  private startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => {
      console.log(`Auto-refreshing cache (${config.cache.refreshIntervalHours}-hour interval)...`);
      this.refreshCache();
    }, this.CACHE_DURATION_MS);
  }

  private async refreshCache(): Promise<void> {
    try {
      // Load all entities, teams, and tenants
      const entities = await storage.getEntities();
      const teams = await storage.getTeams();
      const tenants = await storage.getTenants();

      // Calculate metrics for each tenant (default 30-day cache)
      const last30DayMetrics: Record<string, DashboardMetrics> = {};
      
      for (const tenant of tenants) {
        const tenantEntities = entities.filter(e => e.tenant_name === tenant.name);
        const tenantTables = tenantEntities.filter(e => e.type === 'table');
        const tenantDags = tenantEntities.filter(e => e.type === 'dag');

        last30DayMetrics[tenant.name] = this.calculateMetrics(tenantEntities, tenantTables, tenantDags);
      }

      // Update cache
      this.cache = {
        entities,
        teams,
        tenants,
        metrics: {}, // Empty for dynamic calculations
        last30DayMetrics,
        lastUpdated: new Date()
      };

      console.log(`Cache refreshed successfully: ${entities.length} entities, ${teams.length} teams, ${tenants.length} tenants`);
    } catch (error) {
      console.error("Failed to refresh cache:", error);
    }
  }

  private calculateMetrics(entities: Entity[], tables: Entity[], dags: Entity[]): DashboardMetrics {
    const calculateCompliance = (entityList: Entity[]) => {
      if (entityList.length === 0) return 0;
      const total = entityList.reduce((sum, entity) => sum + (entity.currentSla || 0), 0);
      return Math.round((total / entityList.length) * 10) / 10;
    };

    return {
      overallCompliance: calculateCompliance(entities),
      tablesCompliance: calculateCompliance(tables),
      dagsCompliance: calculateCompliance(dags),
      entitiesCount: entities.length,
      tablesCount: tables.length,
      dagsCount: dags.length
    };
  }

  // Public methods to get cached data
  getAllEntities(): Entity[] {
    return this.cache?.entities || [];
  }

  getAllTeams(): Team[] {
    return this.cache?.teams || [];
  }

  getAllTenants() {
    return this.cache?.tenants || [];
  }

  getEntitiesByTenant(tenantName: string): Entity[] {
    if (!this.cache) return [];
    return this.cache.entities.filter(e => e.tenant_name === tenantName);
  }

  getTeamsByTenant(tenantName: string): Team[] {
    if (!this.cache) return [];
    const tenantEntities = this.getEntitiesByTenant(tenantName);
    const teamIds = [...new Set(tenantEntities.map(e => e.teamId))];
    return this.cache.teams.filter(t => teamIds.includes(t.id));
  }

  getDashboardMetrics(tenantName: string): DashboardMetrics | null {
    return this.cache?.last30DayMetrics[tenantName] || null;
  }

  // Calculate metrics for specific date range (not cached)
  calculateMetricsForDateRange(tenantName: string, startDate: Date, endDate: Date): DashboardMetrics | null {
    if (!this.cache) return null;
    
    const tenantEntities = this.cache.entities.filter(e => e.tenant_name === tenantName);
    const tenantTables = tenantEntities.filter(e => e.type === 'table');
    const tenantDags = tenantEntities.filter(e => e.type === 'dag');

    // In a real implementation, you would filter entities by date range
    // For now, return calculated metrics for all entities
    return this.calculateMetrics(tenantEntities, tenantTables, tenantDags);
  }

  getCacheStatus() {
    return {
      isLoaded: !!this.cache,
      lastUpdated: this.cache?.lastUpdated,
      entitiesCount: this.cache?.entities.length || 0,
      teamsCount: this.cache?.teams.length || 0,
      tenantsCount: this.cache?.tenants.length || 0
    };
  }

  // Force refresh cache (useful for testing or manual refresh)
  async forceRefresh(): Promise<void> {
    await this.refreshCache();
  }

  // Cleanup on server shutdown
  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

// Export singleton instance
export const dataCache = new DataCache();