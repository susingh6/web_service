import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { dashboardApi } from '../api';
import { DashboardMetrics, ComplianceTrendData } from '@shared/cache-types';

interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

interface TeamPerformance {
  teamName: string;
  entitiesCount: number;
  compliance: number;
}

interface DashboardState {
  metrics: DashboardMetrics | null;
  complianceTrends: ComplianceTrendData | null;
  dateRange: DateRange;
  teamPerformance: TeamPerformance[];
  selectedTeam: string | null; // null means "All Teams"
  isLoading: boolean;
  error: string | null;
}

const defaultDateRange: DateRange = {
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
  endDate: new Date(),
  label: 'Last 30 Days',
};

const initialState: DashboardState = {
  metrics: null,
  complianceTrends: null,
  dateRange: defaultDateRange,
  teamPerformance: [],
  selectedTeam: null, // null means "All Teams"
  isLoading: false,
  error: null,
};

// Async thunks
export const fetchDashboardSummary = createAsyncThunk(
  'dashboard/fetchSummary',
  async (params: { tenantName: string; startDate?: string; endDate?: string }) => {
    return await dashboardApi.getSummary(params.tenantName, params.startDate, params.endDate);
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setDateRange: (state, action: PayloadAction<DateRange>) => {
      state.dateRange = action.payload;
    },
    setTeamPerformance: (state, action: PayloadAction<TeamPerformance[]>) => {
      state.teamPerformance = action.payload;
    },
    setSelectedTeam: (state, action: PayloadAction<string | null>) => {
      state.selectedTeam = action.payload;
    },
    resetDashboard: () => initialState,
    setComplianceTrends: (state, action: PayloadAction<ComplianceTrendData | null>) => {
      state.complianceTrends = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardSummary.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDashboardSummary.fulfilled, (state, action) => {
        state.isLoading = false;
        state.metrics = action.payload.metrics;
        state.complianceTrends = action.payload.complianceTrends;
      })
      .addCase(fetchDashboardSummary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch dashboard summary';
        // Clear metrics when API fails so UI shows empty state instead of stale data
        state.metrics = null;
        state.complianceTrends = null;
      });
  },
});

export const { setDateRange, setTeamPerformance, setSelectedTeam, resetDashboard, setComplianceTrends } = dashboardSlice.actions;

export default dashboardSlice.reducer;
