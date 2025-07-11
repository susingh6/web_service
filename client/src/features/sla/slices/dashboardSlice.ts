import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { dashboardApi } from '../api';
import { DashboardMetrics, DateRange, TeamPerformance } from '../types';

interface DashboardState {
  metrics: DashboardMetrics | null;
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
  dateRange: defaultDateRange,
  teamPerformance: [],
  selectedTeam: null, // null means "All Teams"
  isLoading: false,
  error: null,
};

// Async thunks
export const fetchDashboardSummary = createAsyncThunk(
  'dashboard/fetchSummary',
  async (tenant?: string) => {
    return await dashboardApi.getSummary(tenant);
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
      })
      .addCase(fetchDashboardSummary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch dashboard summary';
      });
  },
});

export const { setDateRange, setTeamPerformance, resetDashboard } = dashboardSlice.actions;

export default dashboardSlice.reducer;
