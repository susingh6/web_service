import { createDynamicComponent, LoadingComponent } from "../DynamicImport";

/**
 * Dynamic imports for Material UI components
 * 
 * These components will only be loaded when they are actually rendered,
 * reducing the initial bundle size significantly.
 */

// Data Grid (large component)
export const DataGrid = createDynamicComponent(
  () => import('@mui/x-data-grid').then(module => ({ default: module.DataGrid })),
  { fallback: <div className="w-full h-64 bg-gray-100 animate-pulse rounded-md" /> }
);

// Charts (large components)
export const LineChart = createDynamicComponent(
  () => import('@mui/x-charts/LineChart').then(module => ({ default: module.LineChart })),
  { fallback: <div className="w-full h-64 bg-gray-100 animate-pulse rounded-md" /> }
);

export const BarChart = createDynamicComponent(
  () => import('@mui/x-charts/BarChart').then(module => ({ default: module.BarChart })),
  { fallback: <div className="w-full h-64 bg-gray-100 animate-pulse rounded-md" /> }
);

export const PieChart = createDynamicComponent(
  () => import('@mui/x-charts/PieChart').then(module => ({ default: module.PieChart })),
  { fallback: <div className="w-full h-64 bg-gray-100 animate-pulse rounded-md" /> }
);

// Dialog (common but not needed immediately)
export const Dialog = createDynamicComponent(
  () => import('@mui/material/Dialog').then(module => ({ default: module.default }))
);

export const DialogTitle = createDynamicComponent(
  () => import('@mui/material/DialogTitle').then(module => ({ default: module.default }))
);

export const DialogContent = createDynamicComponent(
  () => import('@mui/material/DialogContent').then(module => ({ default: module.default }))
);

export const DialogActions = createDynamicComponent(
  () => import('@mui/material/DialogActions').then(module => ({ default: module.default }))
);

// Advanced Form Components
export const Autocomplete = createDynamicComponent(
  () => import('@mui/material/Autocomplete').then(module => ({ default: module.default }))
);

export const DatePicker = createDynamicComponent(
  () => import('@mui/x-date-pickers/DatePicker').then(module => ({ default: module.DatePicker })),
  { fallback: <div className="w-full h-10 bg-gray-100 animate-pulse rounded-md" /> }
);