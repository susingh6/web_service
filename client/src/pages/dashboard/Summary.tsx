import { useState, useEffect, useRef } from 'react';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { Box, Grid, Button, Typography, Tabs, Tab, Select, MenuItem, FormControl, InputLabel, IconButton, Chip } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon, Close as CloseIcon } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchDashboardSummary } from '@/features/sla/slices/dashboardSlice';
import { upsertEntity, fetchEntities, fetchTeams, removeEntity } from '@/features/sla/slices/entitiesSlice';
import { Entity } from '@shared/schema';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import TeamComparisonChart from '@/components/dashboard/TeamComparisonChart';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import AddEntityModal from '@/components/modals/AddEntityModal';
import BulkUploadModal from '@/components/modals/BulkUploadModal';
import EntityDetailsModal from '@/components/modals/EntityDetailsModal';
import EditEntityModal from '@/components/modals/EditEntityModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import NotificationTimelineModal from '@/components/notifications/timeline/NotificationTimelineModal';
import TaskManagementModal from '@/components/modals/TaskManagementModal';
import TeamSelector from '@/components/dashboard/TeamSelector';
import TeamDashboard from '@/pages/dashboard/TeamDashboard';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { cacheKeys } from '@/lib/cacheKeys';
import type { Tenant } from '@/lib/tenantCache';
import { tenantsApi } from '@/features/sla/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { WEBSOCKET_CONFIG } from '../../../../shared/websocket-config';
import { useEntityMutation } from '@/utils/cache-management';
import { invalidateEntityCaches, invalidateTenantCaches } from '@/lib/cacheKeys';
import { resolveEntityIdentifier } from '@shared/entity-utils';
import { createPresetMap } from '@shared/preset-ranges';

const Summary = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { deleteEntity } = useEntityMutation();
  // Normalized WS invalidation (additive, debounced)
  const normalizedEntityQueueRef = useRef<Array<{ tenant?: string; teamId?: number; entityId?: number | string }>>([]);
  const normalizedTenantQueueRef = useRef<Set<string>>(new Set());
  const normalizedFlushTimerRef = useRef<any>(null);
  const toastTimerRef = useRef<any>(null);

  const scheduleNormalizedFlush = () => {
    if (normalizedFlushTimerRef.current) return;
    normalizedFlushTimerRef.current = setTimeout(async () => {
      const entityParams = normalizedEntityQueueRef.current;
      const tenantNames = Array.from(normalizedTenantQueueRef.current);
      normalizedEntityQueueRef.current = [];
      normalizedTenantQueueRef.current.clear();
      normalizedFlushTimerRef.current = null;
      try {
        // Deduplicate entity params by signature
        const seen = new Set<string>();
        for (const p of entityParams) {
          const sig = JSON.stringify([p.tenant, p.teamId, p.entityId]);
          if (seen.has(sig)) continue;
          seen.add(sig);
          await invalidateEntityCaches(queryClient, p);
        }
        for (const t of tenantNames) {
          await invalidateTenantCaches(queryClient, t);
        }
      } catch (_e) {
        // Swallow errors; normal path still runs via legacy handlers
      }
    }, 250);
  };

  const { metrics, complianceTrends, isLoading: metricsLoading, lastFetchFailed } = useAppSelector((state) => state.dashboard);
  
  // Helper to check if entity was recently updated (matches EntityTable logic)
  const isEntityRecent = (entity: Entity): boolean => {
    if (!entity.lastRefreshed && !entity.updatedAt) return false;
    
    const updateTime = entity.lastRefreshed || entity.updatedAt;
    if (!updateTime) return false;
    
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const entityUpdateTime = new Date(updateTime);
    
    return entityUpdateTime >= sixHoursAgo;
  };
  
  // DEBUG: Log Redux store data
  console.log('[DEBUG] Dashboard Redux State:', {
    metrics,
    complianceTrends,
    metricsLoading,
    lastFetchFailed
  });
  const { teams } = useAppSelector((state) => state.entities);

  const [tabValue, setTabValue] = useState(0);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openBulkModal, setOpenBulkModal] = useState(false);
  const [openDetailsDrawer, setOpenDetailsDrawer] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openNotificationModal, setOpenNotificationModal] = useState(false);
  const [openTaskModal, setOpenTaskModal] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [chartFilter, setChartFilter] = useState('All');
  // Use environment-aware tenant API with active_only filter for dashboard
  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ['/api/tenants', 'active'],
    queryFn: async () => tenantsApi.getAll(true),
    staleTime: 6 * 60 * 60 * 1000,
  });

  // Persist/restore dashboard UI state across route navigations
  const STORAGE_KEY = 'dashboard_ui_state_v1';
  
  // Initialize state from sessionStorage immediately to prevent flashing summary view on refresh
  const getInitialState = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  
  const initialState = getInitialState();
  
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [openTeamTabs, setOpenTeamTabs] = useState<string[]>(
    Array.isArray(initialState?.openTeamTabs) ? initialState.openTeamTabs : []
  );
  const [activeTab, setActiveTab] = useState(
    typeof initialState?.activeTab === 'string' ? initialState.activeTab : 'summary'
  );
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  const { list: entities, isLoading: entitiesLoading } = useAppSelector((state) => state.entities);
  
  // DEBUG: Log entities and teams
  console.log('[DEBUG] Summary - entities and teams:', {
    entitiesCount: entities?.length || 0,
    teamsCount: teams?.length || 0,
    selectedTenantName: selectedTenant?.name
  });
  
  const [teamDateRanges, setTeamDateRanges] = useState<Record<string, { startDate: Date; endDate: Date; label: string }>>(
    (() => {
      if (!initialState?.teamDateRanges || typeof initialState.teamDateRanges !== 'object') return {};
      const restoredRanges: Record<string, { startDate: Date; endDate: Date; label: string }> = {};
      Object.entries(initialState.teamDateRanges).forEach(([teamName, range]: any) => {
        if (range) {
          restoredRanges[teamName] = {
            startDate: range.startDate ? new Date(range.startDate) : startOfDay(subDays(new Date(), 29)),
            endDate: range.endDate ? new Date(range.endDate) : endOfDay(new Date()),
            label: range.label || 'Last 30 Days',
          };
        }
      });
      return restoredRanges;
    })()
  );
  const [summaryDateRange, setSummaryDateRange] = useState(() => {
    if (initialState?.summaryDateRange) {
      return {
        startDate: initialState.summaryDateRange.startDate ? new Date(initialState.summaryDateRange.startDate) : startOfDay(subDays(new Date(), 29)),
        endDate: initialState.summaryDateRange.endDate ? new Date(initialState.summaryDateRange.endDate) : endOfDay(new Date()),
        label: initialState.summaryDateRange.label || 'Last 30 Days',
      };
    }
    return {
      startDate: startOfDay(subDays(new Date(), 29)),
      endDate: endOfDay(new Date()),
      label: 'Last 30 Days',
    };
  });

  const [restored, setRestored] = useState(false);

  // Restore selected tenant when tenants are loaded (needs tenant lookup by name)
  useEffect(() => {
    if (restored) return;
    if (!tenants || tenants.length === 0) return;
    try {
      // Only need to restore selected tenant - everything else is in initial state
      if (initialState?.selectedTenantName) {
        const t = tenants.find(tn => tn.name === initialState.selectedTenantName);
        if (t) setSelectedTenant(t);
      }
    } catch (_e) {
      // Ignore errors
    } finally {
      setRestored(true);
    }
  }, [tenants, restored, initialState?.selectedTenantName]);

  // Save on relevant state changes
  useEffect(() => {
    try {
      const state = {
        selectedTenantName: selectedTenant?.name,
        openTeamTabs,
        activeTab,
        summaryDateRange: {
          startDate: summaryDateRange.startDate?.toISOString?.() || null,
          endDate: summaryDateRange.endDate?.toISOString?.() || null,
          label: summaryDateRange.label,
        },
        teamDateRanges: Object.fromEntries(
          Object.entries(teamDateRanges).map(([k, v]) => [k, {
            startDate: v.startDate?.toISOString?.() || null,
            endDate: v.endDate?.toISOString?.() || null,
            label: v.label,
          }])
        ),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_e) {
      // Ignore quota or serialization errors
    }
  }, [selectedTenant?.name, openTeamTabs, activeTab, summaryDateRange, teamDateRanges]);

  // ============================================================================
  // EFFICIENT PRESET LOADING SYSTEM
  // ============================================================================
  // Load all presets ONCE from Redis cache (no repeated API calls)
  // 
  // Flow:
  // 1. Initial mount → Fetch all 5 presets in one call
  // 2. Click "Today/Yesterday/etc" → Use cached data, NO API CALL
  // 3. Click "Custom Range" → API call for calculation
  // 4. Entity added/changed → Optimistic UI update (preset data stays stale until next cache refresh)
  // 5. 6-hour cache refresh → WebSocket broadcasts → Query invalidated → Auto-refetch fresh presets
  // 
  // This ensures minimal API calls while keeping data fresh with WebSocket push updates
  // ============================================================================
  const { data: presetsData, isLoading: presetsLoading } = useQuery<{
    presets: Record<string, { metrics: any; complianceTrends: any }>;
    lastUpdated: string;
    cached: boolean;
    scope: string;
  }>({
    queryKey: ['/api/dashboard/presets', selectedTenant?.name],
    enabled: !!selectedTenant,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours (matches cache refresh interval)
    refetchOnWindowFocus: false,
    refetchInterval: false // No polling, WebSocket handles invalidation
  });

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    componentType: WEBSOCKET_CONFIG.componentTypes.SUMMARY_DASHBOARD,
    onEntityUpdated: (data) => {
      const operation: 'created' | 'updated' | 'deleted' = data.type || 'updated';
      // Queue normalized invalidations (debounced, single path)
      normalizedEntityQueueRef.current.push({
        tenant: selectedTenant?.name,
        teamId: data?.teamId,
        entityId: data?.data?.entityId || data?.entityId,
      });
      scheduleNormalizedFlush();

      // Use precise entity update instead of broad refetch to prevent cross-contamination
      if (data.entity || data.data) {
        const entityData = data.entity || data.data;
        if (entityData) {
          dispatch(upsertEntity(entityData));
        }
      }
      
      // Only refresh dashboard summary for custom/Last 30 Days ranges
      if (selectedTenant) {
        const isCustomRange = summaryDateRange.label === 'Custom Range';
        const isLast30Days = summaryDateRange.label === 'Last 30 Days';
        
        if (isCustomRange || isLast30Days) {
          dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
        }
        // Preset ranges use cached data, no fetch needed
      }
    },
    onCacheUpdated: (data: any, cacheType?: string) => {
      // Only show toast and refresh for relevant cache types (entities and metrics)
      const relevantCacheTypes = ['entities-cache', 'metrics-cache'];
      
      if (!cacheType || !relevantCacheTypes.includes(cacheType)) {
        // Ignore unrelated cache updates (e.g., team-members-cache)
        return;
      }
      
      // IMPORTANT: Invalidate presets when 6-hour cache refreshes
      // This ensures frontend gets latest preset data from Redis
      console.log('[Summary] Cache updated - invalidating presets for fresh data');
      queryClient.invalidateQueries({ 
        queryKey: ['/api/dashboard/presets', selectedTenant?.name] 
      });
      
      // Queue normalized tenant invalidation (debounced, single path)
      if (selectedTenant?.name) {
        normalizedTenantQueueRef.current.add(selectedTenant.name);
        scheduleNormalizedFlush();
      }
      // Also refresh Redux-backed summary/entities
      if (selectedTenant) {
        dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
      }
      // Removed fetchEntities to prevent cross-contamination - React Query handles data refresh
      // Removed toast notification to prevent interference with Team Dashboard toasts
    },
    onConnect: () => {},
    onDisconnect: () => {}
  });

  // Reconcile selected tenant whenever tenants list changes (handles rename and defaults)
  useEffect(() => {
    if (!tenants || tenants.length === 0) return;

    if (!selectedTenant) {
      // No selection yet → choose first available (remove hardcoded defaults)
      setSelectedTenant(tenants[0]);
      return;
    }

    // Try match by id first (stable across renames)
    const matchById = tenants.find((t: any) => t.id === (selectedTenant as any).id);
    if (matchById) {
      // If the name changed, update selection to keep Select value in sync
      if (matchById.name !== selectedTenant.name) {
        setSelectedTenant(matchById);
      }
      return;
    }

    // Fallback: match by name if id not found
    const matchByName = tenants.find((t: any) => t.name === selectedTenant.name);
    if (matchByName) {
      setSelectedTenant(matchByName);
      return;
    }

    // As a last resort, select first tenant to avoid blank filter
    setSelectedTenant(tenants[0]);
  }, [tenants, selectedTenant]);

  // Fetch dashboard data when tenant or date range changes
  useEffect(() => {
    if (selectedTenant) {
      // Use centralized preset mapping (easy to extend with new presets)
      const presetMap = createPresetMap();
      const presetKey = presetMap[summaryDateRange.label];
      
      // If it's a preset and we have the data, use it (no API call)
      if (presetKey && presetsData?.presets?.[presetKey]) {
        const presetData = presetsData.presets[presetKey];
        console.log(`[Summary] Using cached preset data for ${summaryDateRange.label} - NO API CALL`);
        // Update Redux with preset data (no API call)
        dispatch({ 
          type: 'dashboard/setDashboardData', 
          payload: {
            metrics: presetData.metrics,
            complianceTrends: presetData.complianceTrends,
            isLoading: false
          }
        });
      } else {
        // For custom ranges OR when preset data is not yet loaded, make API call
        const startDate = summaryDateRange.startDate ? format(summaryDateRange.startDate, 'yyyy-MM-dd') : undefined;
        const endDate = summaryDateRange.endDate ? format(summaryDateRange.endDate, 'yyyy-MM-dd') : undefined;
        
        const rangeType = summaryDateRange.label === 'Custom Range' ? 'custom' : 'preset (fallback)';
        console.log(`[Summary] Fetching ${rangeType} range data from API: ${startDate} to ${endDate}`);
        dispatch(fetchDashboardSummary({ 
          tenantName: selectedTenant.name,
          startDate,
          endDate
        }));
      }

      // Load entities for current tenant only (initial load for Summary dashboard)
      dispatch(fetchEntities({ tenant: selectedTenant.name })); // Load tenant-specific entities for summary dashboard
      // Load teams data for chart display (silent load for summary page)
      dispatch(fetchTeams());
      setTeamsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, selectedTenant, summaryDateRange]);

  // Listen for team data refresh events (e.g., when tenant status changes cascade to teams)
  useEffect(() => {
    const handleRefreshTeams = () => {
      dispatch(fetchTeams());
    };
    
    window.addEventListener('refresh-teams-data', handleRefreshTeams);
    return () => window.removeEventListener('refresh-teams-data', handleRefreshTeams);
  }, [dispatch]);

  // Listen for dashboard data updates (e.g., after entity creation/updates)
  useEffect(() => {
    const handleDashboardDataUpdate = () => {
      if (selectedTenant) {
        // Format dates for API call to match existing pattern
        const startDate = summaryDateRange.startDate ? format(summaryDateRange.startDate, 'yyyy-MM-dd') : undefined;
        const endDate = summaryDateRange.endDate ? format(summaryDateRange.endDate, 'yyyy-MM-dd') : undefined;
        
        // Refresh dashboard summary with current date range
        // Backend uses pre-calculated cache for preset ranges
        dispatch(fetchDashboardSummary({ 
          tenantName: selectedTenant.name,
          startDate,
          endDate
        }));
        
        // ALSO refresh entities list for Summary dashboard
        dispatch(fetchEntities({ tenant: selectedTenant.name }));
      }
    };
    
    window.addEventListener('dashboard-data-updated', handleDashboardDataUpdate);
    // When tenant is renamed in Admin, immediately normalize selection and refetch
    const pendingRenameRef: any = { current: null };
    const handleAdminTenantsUpdated = (e: any) => {
      const detail = e?.detail || {};
      pendingRenameRef.current = detail;
      // If the currently selected tenant matches the renamed ID, update the label immediately
      if (selectedTenant && detail?.tenantId === selectedTenant.id && detail?.newName) {
        setSelectedTenant({ ...(selectedTenant as any), name: detail.newName } as any);
      }
      // Invalidate tenant lists and summaries
      queryClient.invalidateQueries({ queryKey: ['/api/tenants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/tenants'] });
      // Invalidate all dashboard summaries when tenants are updated
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      handleDashboardDataUpdate();
    };
    window.addEventListener('admin-tenants-updated', handleAdminTenantsUpdated);
    return () => {
      window.removeEventListener('dashboard-data-updated', handleDashboardDataUpdate);
      window.removeEventListener('admin-tenants-updated', handleAdminTenantsUpdated);
    };
  }, [dispatch, selectedTenant, summaryDateRange]);

  // Finalize selection when refreshed tenants arrive after rename
  useEffect(() => {
    const listener = (e: any) => {
      const detail = e?.detail || {};
      if (detail?.tenantId || detail?.newName) {
        const match = tenants.find((t: any) => t.id === detail.tenantId) || tenants.find((t: any) => t.name === detail.newName);
        if (match) {
          setSelectedTenant(match);
        }
      }
    };
    window.addEventListener('admin-tenants-updated', listener);
    return () => window.removeEventListener('admin-tenants-updated', listener);
  }, [tenants]);

  // Server already filters for active entity owners by tenant, no additional filtering needed
  const filteredEntities = entities;
  const tables = filteredEntities.filter((entity) => entity.type === 'table');
  const dags = filteredEntities.filter((entity) => entity.type === 'dag');

  // Preserve hasRangeData for components that rely on it (e.g., controlling empty states)
  const hasRangeData = !!(
    complianceTrends &&
    Array.isArray((complianceTrends as any).trend) &&
    (complianceTrends as any).trend.length > 0
  );
  
  // Server already filters for entity owners, only apply time-based filtering if needed
  const visibleTables = (() => {
    let filteredTables = tables; // Server already filtered for entity owners
    
    // Apply recent filter if metrics unavailable (same as EntityTable logic)
    if (!hasRangeData) {
      filteredTables = filteredTables.filter(isEntityRecent);
    }
    
    return filteredTables;
  })();
  
  const visibleDags = (() => {
    let filteredDags = dags; // Server already filtered for entity owners
    
    // Apply recent filter if metrics unavailable (same as EntityTable logic)
    if (!hasRangeData) {
      filteredDags = filteredDags.filter(isEntityRecent);
    }
    
    return filteredDags;
  })();

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleTenantChange = (event: any) => {
    const tenantName = event.target.value;
    const tenant = tenants.find(t => t.name === tenantName);
    if (tenant) {
      setSelectedTenant(tenant);
      // DO NOT clear team tabs - tenant filter only affects Summary tab data
      // Refresh Summary dashboard data with new tenant
      // Switching to tenant

      // Invalidate cached dashboard data to force fresh fetch
      if (selectedTenant) {
        queryClient.invalidateQueries({ queryKey: cacheKeys.dashboardSummary(selectedTenant.name) });
      }

      // The useEffect will handle the API calls when selectedTenant changes
      // No need to make manual API calls here to avoid duplicates
    }
  };

  const handleLoadTeamsForSelector = async () => {
    if (!teamsLoaded) {
      // Load all teams when "+" button is clicked to populate the dropdown
      dispatch(fetchTeams());
      setTeamsLoaded(true);
    }
  };

  const handleAddTeamTab = (compositeKey: string) => {
    if (!openTeamTabs.includes(compositeKey)) {
      setOpenTeamTabs([...openTeamTabs, compositeKey]);
      // Initialize date range for this team if not already set
      setTeamDateRanges((prev) => (
        prev[compositeKey]
          ? prev
          : {
              ...prev,
              [compositeKey]: {
                startDate: startOfDay(subDays(new Date(), 29)),
                endDate: endOfDay(new Date()),
                label: 'Last 30 Days',
              },
            }
      ));
    }
    setActiveTab(compositeKey);
  };

  const handleCloseTeamTab = (compositeKey: string) => {
    const newOpenTabs = openTeamTabs.filter(tab => tab !== compositeKey);
    setOpenTeamTabs(newOpenTabs);
    // If we're closing the active tab, switch to summary or first available tab
    if (activeTab === compositeKey) {
      setActiveTab(newOpenTabs.length > 0 ? newOpenTabs[0] : 'summary');
    }
  };

  const handleDynamicTabChange = (tabName: string) => {
    setActiveTab(tabName);
    // Prefetch team dashboard data when switching tabs for snappier UX
    if (tabName !== 'summary') {
      const { tenantName, teamName } = parseCompositeKey(tabName);
      const team = teams.find(t => {
        const teamObj = t as any; // Cast to any to access tenant_name if it exists
        return t.name === teamName && teamObj.tenant_name === tenantName;
      });
      if (team && tenantName) {
        // Prefetch entities list for team
        queryClient.prefetchQuery({
          queryKey: cacheKeys.entitiesByTenantAndTeam(tenantName, team.id),
          queryFn: async () => {
            const res = await fetch(`/api/entities?teamId=${team.id}`);
            if (!res.ok) throw new Error('Failed to prefetch team entities');
            return res.json();
          },
          staleTime: 1000 * 60 * 30,
        });
      }
    }
  };

  const handleAddEntity = () => {
    setOpenAddModal(true);
  };

  const handleBulkUpload = () => {
    setOpenBulkModal(true);
  };

  const handleViewDetails = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenDetailsDrawer(true);
  };

  const handleEditEntity = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenEditModal(true);
  };

  const handleDeleteEntity = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenDeleteDialog(true);
  };

  const handleNotificationTimeline = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenNotificationModal(true);
  };

  // Helper function to parse composite key and get tenant/team names
  const parseCompositeKey = (compositeKey: string): { tenantName: string; teamName: string } => {
    const parts = compositeKey.split('::');
    if (parts.length === 2) {
      return { tenantName: parts[0], teamName: parts[1] };
    }
    // Fallback for old format (just team name)
    const team = teams.find(t => t.name === compositeKey);
    const tenant = team?.tenant_id ? tenants.find(t => t.id === team.tenant_id) : null;
    return { tenantName: tenant?.name || '', teamName: compositeKey };
  };

  // Helper function to find the tenant name for a team (backward compatibility)
  const getTeamTenantName = (teamIdentifier: string): string | undefined => {
    return parseCompositeKey(teamIdentifier).tenantName;
  };

  const handleViewTasks = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenTaskModal(true);
  };

  const handleConfirmDelete = async () => {
    try {
      if (!selectedEntity) return;

      // Safeguard: Check if entity ID looks like a temporary optimistic ID
      const isOptimisticId = selectedEntity.id > 1000000000000; // Timestamp-based IDs are > 1 trillion
      if (isOptimisticId) {
        toast({
          title: 'Please wait',
          description: `${selectedEntity.name} is still being created. Please try again in a moment.`,
          variant: 'default',
        });
        setOpenDeleteDialog(false);
        return;
      }

      // Use centralized delete mutation with proper cache management
      // Get the actual entity name for the delete operation
      const entityNameForApi = resolveEntityIdentifier(selectedEntity, {
        fallback: selectedEntity.name ?? ''
      });
      if (!entityNameForApi) {
        throw new Error(`Missing ${selectedEntity.type} identifier for entity ${selectedEntity.name}`);
      }

      // CRITICAL FIX: Determine the correct tenant based on active tab context
      // If we're on a team dashboard, use that team's tenant, not the summary dropdown tenant
      let effectiveTenantName = selectedTenant?.name;
      if (activeTab !== 'summary') {
        // We're on a team dashboard, parse the composite key to get the correct tenant
        const { tenantName: teamTenantName } = parseCompositeKey(activeTab);
        effectiveTenantName = teamTenantName;
      }

      await deleteEntity(entityNameForApi, selectedEntity.type as Entity['type'], {
        tenantName: effectiveTenantName,
        teamId: selectedEntity.teamId,
        teamName: selectedEntity.team_name || undefined
      });

      // Remove from Redux slice immediately
      dispatch(removeEntity({
        name: entityNameForApi,
        entityType: selectedEntity.type as 'table' | 'dag',
        teamId: selectedEntity.teamId
      }));

      setOpenDeleteDialog(false);
      setSelectedEntity(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to delete: ${error}`,
        variant: 'destructive',
      });
    }
  };



  return (
    <Box>
      {/* Only show title and filters when Summary tab is active */}
      {activeTab === 'summary' && (
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Typography variant="h4" component="h1" fontWeight={600} fontFamily="Inter, sans-serif">
              Overall SLA Performance
            </Typography>
            {selectedTenant && (
              <Chip 
                label={selectedTenant.name}
                size="small"
                variant="outlined"
                sx={{ 
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  height: '24px',
                  '& .MuiChip-label': {
                    px: 1.5
                  }
                }}
              />
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={2}>
            <FormControl variant="outlined" size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="tenant-filter-label">Tenant</InputLabel>
              <Select
                labelId="tenant-filter-label"
                id="tenant-filter"
                value={selectedTenant?.name || ''}
                onChange={handleTenantChange}
                label="Tenant"
              >
                {tenants && tenants.map((tenant) => (
                  <MenuItem key={tenant.id} value={tenant.name}>
                    {tenant.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DateRangePicker value={summaryDateRange} onChange={setSummaryDateRange} />
          </Box>
        </Box>
      )}

      {/* Dynamic Tabs System */}
      <Box sx={{ mb: 4, bgcolor: 'background.paper', borderRadius: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={(_, newValue) => handleDynamicTabChange(newValue)}
            sx={{ minWidth: 'auto' }}
          >
            {/* Summary Tab - Always Present (No Close Button) */}
            <Tab 
              value="summary"
              label="Summary" 
              sx={{ 
                fontWeight: 500, 
                textTransform: 'none',
                fontSize: '1rem',
                minHeight: 48,
                px: 3,
                '&.Mui-selected': { fontWeight: 600 } 
              }} 
            />

            {/* Dynamic Team Tabs with Close Buttons */}
            {openTeamTabs.map((compositeKey) => {
              const { teamName } = parseCompositeKey(compositeKey);
              return (
                <Tab
                  key={compositeKey}
                  value={compositeKey}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {teamName}
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseTeamTab(compositeKey);
                        }}
                        component="span"
                        sx={{ 
                          ml: 0.5,
                          p: 0.25,
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  }
                  sx={{ 
                    fontWeight: 500, 
                    textTransform: 'none',
                    fontSize: '1rem',
                    minHeight: 48,
                    px: 3,
                    '&.Mui-selected': { fontWeight: 600 } 
                  }}
                />
              );
            })}
          </Tabs>

          {/* Team Selector - + Button - Right next to tabs */}
          <Box sx={{ ml: 1 }}>
            <TeamSelector
              teams={teams}
              openTeamTabs={openTeamTabs}
              onAddTeamTab={handleAddTeamTab}
              onLoadTeams={handleLoadTeamsForSelector}
            />
          </Box>
        </Box>

        {/* Summary Tab Content */}
        <Box role="tabpanel" hidden={activeTab !== 'summary'}>
          {activeTab === 'summary' && (
            <Box sx={{ p: 3 }}>
              {/* Metrics Cards */}
              <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
                {(() => {
                  const summaryRangeText = (summaryDateRange?.label === 'Custom Range' && summaryDateRange.startDate && summaryDateRange.endDate)
                    ? `${format(summaryDateRange.startDate, 'MMM d, yyyy')} - ${format(summaryDateRange.endDate, 'MMM d, yyyy')}`
                    : summaryDateRange.label;
                  return [
                  { 
                    title: `Overall SLA Compliance (${summaryRangeText})`, 
                    value: hasRangeData ? (metrics?.overallCompliance || 0) : 0, 
                    suffix: "%", 
                    progress: hasRangeData ? (metrics?.overallCompliance || 0) : undefined,
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: !metricsLoading && !hasRangeData,
                    infoTooltip: `Average SLA compliance across all tables and DAGs for the selected date range.`
                  },
                  { 
                    title: `Tables SLA Compliance (${summaryRangeText})`, 
                    value: hasRangeData ? (metrics?.tablesCompliance || 0) : 0, 
                    suffix: "%", 
                    progress: hasRangeData ? (metrics?.tablesCompliance || 0) : undefined,
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: !metricsLoading && !hasRangeData,
                    infoTooltip: `Average SLA compliance across all table entities for the selected date range.`
                  },
                  { 
                    title: `DAGs SLA Compliance (${summaryRangeText})`, 
                    value: hasRangeData ? (metrics?.dagsCompliance || 0) : 0, 
                    suffix: "%", 
                    progress: hasRangeData ? (metrics?.dagsCompliance || 0) : undefined,
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: !metricsLoading && !hasRangeData,
                    infoTooltip: `Average SLA compliance across all DAG entities for the selected date range.`
                  }].map((card) => (
                    <Box key={card.title} flex="1 1 250px" minWidth="250px">
                      <MetricCard {...card} />
                    </Box>
                  ));
                })()}
                {[
                  { 
                    title: "Entities Monitored", 
                    value: (() => {
                      // Server already filters for active entity owners by tenant
                      let filteredForDisplay = entities;
                      
                      // Apply same filtering logic as EntityTable:
                      // If metrics unavailable for selected range, show only recent entities
                      if (!hasRangeData) {
                        filteredForDisplay = filteredForDisplay.filter(isEntityRecent);
                      }
                      
                      return filteredForDisplay.length;
                    })(), 
                    suffix: "",
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: false, // Never show unavailable - always show actual count
                    subtitle: (() => {
                      // Server already filters for active entity owners by tenant
                      let tablesForDisplay = entities.filter((entity: Entity) => 
                        entity.type === 'table'
                      );
                      let dagsForDisplay = entities.filter((entity: Entity) => 
                        entity.type === 'dag'
                      );
                      
                      // Apply recent filter if metrics unavailable (same as EntityTable logic)
                      if (!hasRangeData) {
                        tablesForDisplay = tablesForDisplay.filter(isEntityRecent);
                        dagsForDisplay = dagsForDisplay.filter(isEntityRecent);
                      }
                      
                      return `${tablesForDisplay.length} Tables • ${dagsForDisplay.length} DAGs`;
                    })()
                  }
                ].map((card, idx) => (
                  <Box key={card.title} flex="1 1 250px" minWidth="250px">
                    <MetricCard {...card} />
                  </Box>
                ))}
              </Box>

              {/* Charts */}
              <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
                <Box flex="1 1 500px" minWidth="500px">
                  <ChartCard
                    title="Compliance Trend Snapshot"
                    infoTooltip={`Each data point shows cumulative SLA compliance up to that date: (Passed + Pending) ÷ all historical runs.`}
                    filters={['All', 'Tables', 'DAGs']}
                    onFilterChange={setChartFilter}
                    loading={metricsLoading && !lastFetchFailed}
                    chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} data={hasRangeData ? (complianceTrends?.trend || []) : []} loading={metricsLoading} />}
                  />
                </Box>

                <Box flex="1 1 500px" minWidth="500px">
                  <ChartCard
                    title={`Team Performance Comparison (${(summaryDateRange?.label === 'Custom Range' && summaryDateRange.startDate && summaryDateRange.endDate) ? `${format(summaryDateRange.startDate, 'MMM d, yyyy')} - ${format(summaryDateRange.endDate, 'MMM d, yyyy')}` : summaryDateRange.label})`}
                    infoTooltip={`Compares team performance for the selected date range.`}
                    loading={metricsLoading && !lastFetchFailed}
                    chart={<TeamComparisonChart entities={hasRangeData ? entities : []} teams={teams} selectedTenant={selectedTenant?.name || ''} loading={metricsLoading} hasMetrics={hasRangeData} />}
                  />
                </Box>
              </Box>

              {/* Tables/DAGs Sub-tabs */}
              <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3 }}>
                <Tab 
                  label="Tables" 
                  sx={{ 
                    fontWeight: 500, 
                    textTransform: 'none',
                    '&.Mui-selected': { fontWeight: 600 } 
                  }} 
                />
                <Tab 
                  label="DAGs" 
                  sx={{ 
                    fontWeight: 500, 
                    textTransform: 'none',
                    '&.Mui-selected': { fontWeight: 600 } 
                  }} 
                />
              </Tabs>

              <Box role="tabpanel" hidden={tabValue !== 0}>
                {tabValue === 0 && (
                  <EntityTable
                    entities={visibleTables}
                    type="table"
                    teams={teams}
                    onEditEntity={handleEditEntity}
                    onDeleteEntity={handleDeleteEntity}
                    onViewHistory={() => {}}
                    onViewDetails={handleViewDetails}
                    onSetNotificationTimeline={handleNotificationTimeline}
                    showActions={false}
                    hasMetrics={hasRangeData}
                    trendLabel={`${(summaryDateRange?.label === 'Custom Range' && summaryDateRange.startDate && summaryDateRange.endDate) ? `${format(summaryDateRange.startDate, 'MMM d, yyyy')} - ${format(summaryDateRange.endDate, 'MMM d, yyyy')}` : summaryDateRange.label} Trend`}
                  />
                )}
              </Box>

              <Box role="tabpanel" hidden={tabValue !== 1}>
                {tabValue === 1 && (
                  <EntityTable
                    entities={visibleDags}
                    type="dag"
                    teams={teams}
                    onEditEntity={handleEditEntity}
                    onDeleteEntity={handleDeleteEntity}
                    onViewHistory={() => {}}
                    onViewDetails={handleViewDetails}
                    onViewTasks={handleViewTasks}
                    onSetNotificationTimeline={handleNotificationTimeline}
                    showActions={false}
                    hasMetrics={hasRangeData}
                    trendLabel={`${(summaryDateRange?.label === 'Custom Range' && summaryDateRange.startDate && summaryDateRange.endDate) ? `${format(summaryDateRange.startDate, 'MMM d, yyyy')} - ${format(summaryDateRange.endDate, 'MMM d, yyyy')}` : summaryDateRange.label} Trend`}
                  />
                )}
              </Box>
            </Box>
          )}
        </Box>

        {/* Team Tab Content */}
        {openTeamTabs.map((compositeKey) => {
          const { tenantName, teamName } = parseCompositeKey(compositeKey);
          return (
            <Box key={compositeKey} role="tabpanel" hidden={activeTab !== compositeKey}>
              {activeTab === compositeKey && (
                <TeamDashboard
                  teamName={teamName}
                  tenantName={tenantName}
                  dateRange={teamDateRanges[compositeKey]}
                  onDateRangeChange={(range) => setTeamDateRanges((prev) => ({ ...prev, [compositeKey]: range }))}
                  onEditEntity={handleEditEntity}
                  onDeleteEntity={handleDeleteEntity}
                  onViewDetails={handleViewDetails}
                  onAddEntity={() => setOpenAddModal(true)}
                  onBulkUpload={() => setOpenBulkModal(true)}
                  onNotificationTimeline={handleNotificationTimeline}
                  onViewTasks={handleViewTasks}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {/* Modals */}
      <AddEntityModal
        open={openAddModal}
        onClose={() => setOpenAddModal(false)}
        teams={teams}
        initialTenantName={activeTab !== 'summary' ? parseCompositeKey(activeTab).tenantName : selectedTenant?.name}
        initialTeamName={activeTab !== 'summary' ? parseCompositeKey(activeTab).teamName : undefined}
        onSubmitted={(type) => {
          // Only team dashboards handle adds; switch their internal sub-tab
          if (activeTab !== 'summary') {
            const { teamName } = parseCompositeKey(activeTab);
            window.dispatchEvent(new CustomEvent('switch-team-subtab', { detail: { teamName, type } }));
          }
        }}
      />

      <BulkUploadModal
        open={openBulkModal}
        onClose={() => setOpenBulkModal(false)}
      />

      <EntityDetailsModal
        open={openDetailsDrawer}
        onClose={() => setOpenDetailsDrawer(false)}
        entity={selectedEntity}
        teams={teams}
        tenantName={selectedTenant?.name}
      />

      <EditEntityModal
        open={openEditModal}
        onClose={() => setOpenEditModal(false)}
        entity={selectedEntity}
        teams={teams}
        initialTenantName={selectedTenant?.name}
        initialTeamName={activeTab !== 'summary' ? activeTab : undefined}
      />

      <ConfirmDialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Entity"
        content={`Are you sure you want to delete "${selectedEntity?.name}"? This action cannot be undone.`}
      />

      <NotificationTimelineModal
        open={openNotificationModal}
        onClose={() => setOpenNotificationModal(false)}
        entity={selectedEntity}
        onSuccess={() => {
          setOpenNotificationModal(false);
        }}
      />

      <TaskManagementModal
        isOpen={openTaskModal}
        onClose={() => setOpenTaskModal(false)}
        dag={selectedEntity?.type === 'dag' ? selectedEntity : null}
      />
    </Box>
  );
};

export default Summary;
