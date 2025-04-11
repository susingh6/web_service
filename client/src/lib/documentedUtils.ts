/**
 * SLA Monitoring Utility Module
 * 
 * Contains utility functions for working with SLA monitoring data, calculations, and visualizations.
 * 
 * @module sla-monitoring/utils
 */

/**
 * Formats an SLA percentage value for display
 * 
 * @param value - The raw SLA percentage value
 * @param options - Formatting options
 * @param options.decimals - Number of decimal places to include (default: 1)
 * @param options.includeSymbol - Whether to include the percent symbol (default: true)
 * @returns A formatted string representation of the SLA value
 * 
 * @example
 * ```ts
 * formatSlaValue(99.5); // "99.5%"
 * formatSlaValue(99.5, { decimals: 0 }); // "100%"
 * formatSlaValue(99.5, { includeSymbol: false }); // "99.5"
 * ```
 */
export function formatSlaValue(
  value: number,
  options: { decimals?: number; includeSymbol?: boolean } = {}
): string {
  const { decimals = 1, includeSymbol = true } = options;
  
  if (isNaN(value) || value === null || value === undefined) {
    return 'N/A';
  }
  
  // Format the number with specified decimal places
  const formattedValue = value.toFixed(decimals);
  
  // Remove trailing zeros after decimal point
  const cleanValue = parseFloat(formattedValue).toString();
  
  // Add percent symbol if needed
  return includeSymbol ? `${cleanValue}%` : cleanValue;
}

/**
 * Calculate the SLA compliance trend between two time periods
 * 
 * @param currentValue - The current period SLA value
 * @param previousValue - The previous period SLA value
 * @returns The trend as a percentage difference
 * 
 * @example
 * ```ts
 * calculateSlaTrend(95, 90); // 5.56 (5.56% improvement)
 * calculateSlaTrend(90, 95); // -5.26 (5.26% decline)
 * ```
 */
export function calculateSlaTrend(
  currentValue: number, 
  previousValue: number
): number {
  if (!previousValue) return 0;
  
  // Calculate percentage change
  const percentChange = ((currentValue - previousValue) / previousValue) * 100;
  
  // Round to 2 decimal places
  return parseFloat(percentChange.toFixed(2));
}

/**
 * Calculates a severity level based on an SLA value
 * 
 * @param slaValue - The SLA value to evaluate
 * @param thresholds - Custom thresholds to use for severity calculation
 * @returns The severity level as a string: 'critical', 'warning', or 'normal'
 * 
 * @example
 * ```ts
 * getSeverityLevel(98.5); // "normal"
 * getSeverityLevel(85); // "warning"
 * getSeverityLevel(70); // "critical"
 * getSeverityLevel(85, { warning: 90, critical: 80 }); // "warning"
 * ```
 */
export function getSeverityLevel(
  slaValue: number,
  thresholds = { warning: 95, critical: 85 }
): 'critical' | 'warning' | 'normal' {
  if (slaValue < thresholds.critical) {
    return 'critical';
  } else if (slaValue < thresholds.warning) {
    return 'warning';
  } else {
    return 'normal';
  }
}

/**
 * Formats a date for display in the SLA monitoring UI
 * 
 * @param date - The date to format
 * @param format - The format to use (short, medium, long, full)
 * @returns A formatted date string
 * 
 * @example
 * ```ts
 * formatDate(new Date(), 'short'); // "4/11/2025"
 * formatDate(new Date(), 'medium'); // "Apr 11, 2025"
 * formatDate(new Date(), 'long'); // "April 11, 2025"
 * formatDate(new Date(), 'full'); // "Friday, April 11, 2025"
 * ```
 */
export function formatDate(
  date: Date, 
  format: 'short' | 'medium' | 'long' | 'full' = 'medium'
): string {
  if (!date) return 'N/A';
  
  try {
    const options: Intl.DateTimeFormatOptions = 
      format === 'short' ? { month: 'numeric', day: 'numeric', year: 'numeric' } :
      format === 'medium' ? { month: 'short', day: 'numeric', year: 'numeric' } :
      format === 'long' ? { month: 'long', day: 'numeric', year: 'numeric' } :
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

/**
 * Calculate aggregated SLA statistics for a collection of entities
 * 
 * @param entities - The collection of entities to analyze
 * @param entityType - Optional filter for specific entity types
 * @returns An object containing aggregated statistics
 * 
 * @example
 * ```ts
 * const stats = calculateSlaStats(entities);
 * console.log(`Average SLA: ${stats.average}%`);
 * console.log(`Entities meeting SLA: ${stats.compliantCount}/${stats.total}`);
 * ```
 */
export function calculateSlaStats(
  entities: Array<{ currentSla?: number, type?: string }>,
  entityType?: string
): {
  average: number;
  median: number;
  min: number;
  max: number;
  total: number;
  compliantCount: number;
  slaThreshold: number;
} {
  // Filter entities by type if specified
  const filteredEntities = entityType
    ? entities.filter(e => e.type === entityType)
    : entities;
  
  // Get all valid SLA values (not null, undefined, or NaN)
  const slaValues = filteredEntities
    .map(e => e.currentSla)
    .filter((sla): sla is number => 
      sla !== undefined && sla !== null && !isNaN(sla)
    );
  
  // Early return if no valid SLA values
  if (slaValues.length === 0) {
    return {
      average: 0,
      median: 0,
      min: 0,
      max: 0,
      total: 0,
      compliantCount: 0,
      slaThreshold: 95, // Default threshold
    };
  }
  
  // Calculate statistics
  const sum = slaValues.reduce((acc, val) => acc + val, 0);
  const average = sum / slaValues.length;
  const sortedValues = [...slaValues].sort((a, b) => a - b);
  const medianIndex = Math.floor(sortedValues.length / 2);
  const median = sortedValues.length % 2 === 0
    ? (sortedValues[medianIndex - 1] + sortedValues[medianIndex]) / 2
    : sortedValues[medianIndex];
  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  
  // Calculate compliance against threshold
  const slaThreshold = 95; // Default threshold
  const compliantCount = slaValues.filter(sla => sla >= slaThreshold).length;
  
  return {
    average: parseFloat(average.toFixed(2)),
    median: parseFloat(median.toFixed(2)),
    min: parseFloat(min.toFixed(2)),
    max: parseFloat(max.toFixed(2)),
    total: slaValues.length,
    compliantCount,
    slaThreshold,
  };
}