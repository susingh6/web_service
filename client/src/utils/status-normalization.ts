// Status normalization utility to ensure consistent vocabulary across API boundary
export const STANDARD_STATUSES = {
  PASSED: 'Passed',
  PENDING: 'Pending', 
  FAILED: 'Failed'
} as const;

export type StandardStatus = typeof STANDARD_STATUSES[keyof typeof STANDARD_STATUSES];

// Status mapping for legacy/inconsistent values to standard API values
const STATUS_MAPPING: Record<string, StandardStatus> = {
  // Standard values (passthrough)
  'Passed': STANDARD_STATUSES.PASSED,
  'Pending': STANDARD_STATUSES.PENDING,
  'Failed': STANDARD_STATUSES.FAILED,
  
  // Lowercase variants
  'passed': STANDARD_STATUSES.PASSED,
  'pending': STANDARD_STATUSES.PENDING,
  'failed': STANDARD_STATUSES.FAILED,
  
  // Legacy/alternative status values
  'success': STANDARD_STATUSES.PASSED,
  'healthy': STANDARD_STATUSES.PASSED,
  'completed': STANDARD_STATUSES.PASSED,
  'ok': STANDARD_STATUSES.PASSED,
  
  'running': STANDARD_STATUSES.PENDING,
  'warning': STANDARD_STATUSES.PENDING,
  'in_progress': STANDARD_STATUSES.PENDING,
  'processing': STANDARD_STATUSES.PENDING,
  
  'critical': STANDARD_STATUSES.FAILED,
  'error': STANDARD_STATUSES.FAILED,
  'broken': STANDARD_STATUSES.FAILED,
  'unavailable': STANDARD_STATUSES.FAILED
};

/**
 * Normalizes any status value to the standard API vocabulary
 * @param status - Raw status value from any source
 * @returns Normalized status matching API standard
 */
export function normalizeStatus(status: string | null | undefined): StandardStatus {
  if (!status) return STANDARD_STATUSES.PENDING;
  
  const normalized = STATUS_MAPPING[status.trim()];
  return normalized || STANDARD_STATUSES.PENDING;
}

/**
 * Maps normalized status to Material-UI color variants
 */
export function getStatusColor(status: StandardStatus): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case STANDARD_STATUSES.PASSED:
      return 'success';
    case STANDARD_STATUSES.PENDING:
      return 'warning';
    case STANDARD_STATUSES.FAILED:
      return 'error';
    default:
      return 'default';
  }
}

/**
 * Status configuration for consistent UI rendering
 */
export const STATUS_CONFIG = {
  [STANDARD_STATUSES.PASSED]: { 
    color: 'success' as const, 
    label: 'Passed', 
    lightBg: 'rgba(76, 175, 80, 0.1)',
    badgeColor: '#4caf50'
  },
  [STANDARD_STATUSES.PENDING]: { 
    color: 'warning' as const, 
    label: 'Pending', 
    lightBg: 'rgba(255, 152, 0, 0.1)',
    badgeColor: '#ff9800'
  },
  [STANDARD_STATUSES.FAILED]: { 
    color: 'error' as const, 
    label: 'Failed', 
    lightBg: 'rgba(244, 67, 54, 0.1)',
    badgeColor: '#f44336'
  }
} as const;