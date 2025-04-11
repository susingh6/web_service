/**
 * Cache preloading utility
 * 
 * This module handles preloading essential data into the cache
 * to improve initial application loading experience.
 */

import { cacheService, DEFAULT_CACHE_TTL } from "./cacheService";

// Cache keys for different data types
export const CACHE_KEYS = {
  TEAMS: "teams",
  ENTITIES: "entities",
  DASHBOARD_SUMMARY: "dashboard_summary",
  ENTITY_TYPES: "entity_types",
};

/**
 * Creates initial cache entries even before API calls to ensure fast first render
 */
export const initializeCache = (): void => {
  // Pre-populate teams cache with empty array if it doesn't exist
  if (!cacheService.has(CACHE_KEYS.TEAMS)) {
    cacheService.set(CACHE_KEYS.TEAMS, [], DEFAULT_CACHE_TTL);
  }

  // Pre-populate entities cache with empty array if it doesn't exist
  if (!cacheService.has(CACHE_KEYS.ENTITIES)) {
    cacheService.set(CACHE_KEYS.ENTITIES, [], DEFAULT_CACHE_TTL);
  }

  // Pre-populate dashboard summary with default values if it doesn't exist
  if (!cacheService.has(CACHE_KEYS.DASHBOARD_SUMMARY)) {
    cacheService.set(CACHE_KEYS.DASHBOARD_SUMMARY, {
      metrics: {
        overallCompliance: 0,
        tablesCompliance: 0,
        dagsCompliance: 0,
        entitiesCount: 0,
        tablesCount: 0,
        dagsCount: 0
      }
    }, DEFAULT_CACHE_TTL);
  }

  // Pre-populate entity types with default values if it doesn't exist
  if (!cacheService.has(CACHE_KEYS.ENTITY_TYPES)) {
    cacheService.set(CACHE_KEYS.ENTITY_TYPES, [
      { id: "table", name: "Table" },
      { id: "dag", name: "DAG" }
    ], DEFAULT_CACHE_TTL);
  }
};

/**
 * Preloads all cache data on application startup
 * This ensures that modals open quickly without needing to fetch data
 */
export const preloadAllCacheData = async (): Promise<void> => {
  try {
    console.log("Preloading cache data...");
    
    // Initialize cache with empty/default values first
    initializeCache();
    
    // Load teams data
    await cacheService.fetchWithCache(
      "/api/teams",
      CACHE_KEYS.TEAMS,
      [],
      DEFAULT_CACHE_TTL
    );
    
    // Load entities data
    await cacheService.fetchWithCache(
      "/api/entities",
      CACHE_KEYS.ENTITIES,
      [],
      DEFAULT_CACHE_TTL
    );
    
    // Load dashboard summary data
    await cacheService.fetchWithCache(
      "/api/dashboard/summary",
      CACHE_KEYS.DASHBOARD_SUMMARY,
      {
        metrics: {
          overallCompliance: 0,
          tablesCompliance: 0,
          dagsCompliance: 0,
          entitiesCount: 0,
          tablesCount: 0,
          dagsCount: 0
        }
      },
      DEFAULT_CACHE_TTL
    );
    
    console.log("Cache preloading complete");
  } catch (error) {
    console.error("Error preloading cache:", error);
    // Errors here are non-fatal, the app will fetch data when needed
  }
};

/**
 * Refreshes cache data in the background
 * Use this to update cache without blocking the UI
 */
export const refreshCacheInBackground = async (): Promise<void> => {
  try {
    // Perform background refresh of important data
    
    // Teams data
    fetch("/api/teams")
      .then(res => res.json())
      .then(data => {
        cacheService.set(CACHE_KEYS.TEAMS, data, DEFAULT_CACHE_TTL);
        console.log("Teams cache refreshed in background");
      })
      .catch(err => console.error("Failed to refresh teams cache:", err));
    
    // Entities data
    fetch("/api/entities")
      .then(res => res.json())
      .then(data => {
        cacheService.set(CACHE_KEYS.ENTITIES, data, DEFAULT_CACHE_TTL);
        console.log("Entities cache refreshed in background");
      })
      .catch(err => console.error("Failed to refresh entities cache:", err));
    
    // Dashboard summary data
    fetch("/api/dashboard/summary")
      .then(res => res.json())
      .then(data => {
        cacheService.set(CACHE_KEYS.DASHBOARD_SUMMARY, data, DEFAULT_CACHE_TTL);
        console.log("Dashboard summary cache refreshed in background");
      })
      .catch(err => console.error("Failed to refresh dashboard summary cache:", err));
  } catch (error) {
    console.error("Error refreshing cache in background:", error);
    // Errors here are non-fatal, as this is a background task
  }
};