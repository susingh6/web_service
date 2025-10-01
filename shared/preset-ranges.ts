// ============================================================================
// CENTRALIZED PRESET RANGE CONFIGURATION
// ============================================================================
// This file defines all preset date ranges available in the SLA Management Dashboard.
// Both frontend and backend use this configuration for consistency.
//
// ⭐ TO ADD A NEW PRESET (e.g., "Last Quarter"):
// 
// 1. Add the key to PresetRangeType union type below:
//    export type PresetRangeType = 'today' | ... | 'lastQuarter';
//
// 2. Add the config object to PRESET_RANGES array:
//    { key: 'lastQuarter', label: 'Last Quarter', description: 'Previous quarter' }
//
// 3. Update shared/cache-types.ts - Add metric/trend fields:
//    lastQuarterMetrics: Record<string, DashboardMetrics>;
//    lastQuarterTrends: Record<string, ComplianceTrendData>;
//
// 4. Update server/redis-cache.ts - Add calculation in cache worker:
//    - Add date range calculation for the quarter
//    - Store metrics/trends in Redis with appropriate keys
//    - Add to getCacheKeyForRange() switch statement
//
// That's it! The preset will automatically appear in the UI and use cached data.
// ============================================================================

export type PresetRangeType = 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth';

export interface PresetRangeConfig {
  key: PresetRangeType;
  label: string;
  description?: string;
}

// Active preset ranges (loaded from cache on dashboard mount)
export const PRESET_RANGES: PresetRangeConfig[] = [
  { key: 'today', label: 'Today', description: 'Current day' },
  { key: 'yesterday', label: 'Yesterday', description: 'Previous day' },
  { key: 'last7Days', label: 'Last 7 Days', description: 'Past week' },
  { key: 'last30Days', label: 'Last 30 Days', description: 'Past month' },
  { key: 'thisMonth', label: 'This Month', description: 'Current calendar month' },
];

// Future presets - uncomment and follow steps above to implement:
// { key: 'lastQuarter', label: 'Last Quarter', description: 'Previous quarter' },
// { key: 'thisQuarter', label: 'This Quarter', description: 'Current quarter' },
// { key: 'thisYear', label: 'This Year', description: 'Current calendar year' },

// Helper: Get all preset keys (for backend iteration)
export const getPresetKeys = (): PresetRangeType[] => {
  return PRESET_RANGES.map(p => p.key);
};

// Helper: Get preset label by key
export const getPresetLabel = (key: PresetRangeType): string => {
  return PRESET_RANGES.find(p => p.key === key)?.label || key;
};

// Helper: Get preset key by label
export const getPresetKeyByLabel = (label: string): PresetRangeType | null => {
  return PRESET_RANGES.find(p => p.label === label)?.key || null;
};

// Helper: Create label-to-key mapping (for frontend)
export const createPresetMap = (): Record<string, PresetRangeType> => {
  return Object.fromEntries(
    PRESET_RANGES.map(p => [p.label, p.key])
  );
};
