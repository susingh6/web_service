import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import dashboardReducer from '../features/sla/slices/dashboardSlice';
import entitiesReducer from '../features/sla/slices/entitiesSlice';

export const store = configureStore({
  reducer: {
    dashboard: dashboardReducer,
    entities: entitiesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore date objects in actions and state paths
        ignoredActions: [
          'entities/updateEntity', 
          'entities/addEntity',
          'dashboard/setDateRange',
          'dashboard/fetchSummary/pending',
          'dashboard/fetchSummary/fulfilled',
          'dashboard/fetchSummary/rejected',
          'entities/fetchAll/pending',
          'entities/fetchAll/fulfilled', 
          'entities/fetchAll/rejected',
          'entities/fetchTeams/pending',
          'entities/fetchTeams/fulfilled',
          'entities/fetchTeams/rejected'
        ],
        ignoredPaths: [
          'entities.list',
          'dashboard.dateRange.startDate',
          'dashboard.dateRange.endDate'
        ],
      },
    }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Use throughout app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
