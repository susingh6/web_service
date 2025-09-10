import { useState, useEffect } from 'react';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { Box, Grid, Button, Typography, Tabs, Tab, Select, MenuItem, FormControl, InputLabel, IconButton } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon, Close as CloseIcon } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchDashboardSummary } from '@/features/sla/slices/dashboardSlice';
import { fetchEntities, fetchTeams } from '@/features/sla/slices/entitiesSlice';
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
import type { Tenant } from '@/lib/tenantCache';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useEntityMutation, CACHE_PATTERNS, useCacheManager } from '@/utils/cache-management';

const Summary = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { deleteEntity } = useEntityMutation();
  const cacheManager = useCacheManager();

  const { metrics, complianceTrends, isLoading: metricsLoading, lastFetchFailed } = useAppSelector((state) => state.dashboard);
  const { list: entities, teams, isLoading: entitiesLoading } = useAppSelector((state) => state.entities);

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
  // Use React Query to fetch tenants instead of old cache system
  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ['/api/tenants'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/tenants');
      return await response.json();
    },
    staleTime: 6 * 60 * 60 * 1000, // 6 hours to match cache TTL
  });

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [openTeamTabs, setOpenTeamTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('summary');
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [teamDateRanges, setTeamDateRanges] = useState<Record<string, { startDate: Date; endDate: Date; label: string }>>({});
  const [summaryDateRange, setSummaryDateRange] = useState({
    startDate: startOfDay(subDays(new Date(), 29)),
    endDate: endOfDay(new Date()),
    label: 'Last 30 Days',
  });

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    onEntityUpdated: (data) => {
      // Entity updated via WebSocket - use centralized cache invalidation
      const operation: 'created' | 'updated' | 'deleted' = data.type || 'updated';
      const entityType = data.entityType as 'table' | 'dag';
      const teamId = data.teamId;

      // Use centralized cache patterns for consistent invalidation
      const invalidationKeys: (string | object)[][] = [
        [...CACHE_PATTERNS.ENTITIES.LIST],
        ...(teamId ? [CACHE_PATTERNS.ENTITIES.BY_TEAM(teamId)] : []),
        ...(entityType ? [CACHE_PATTERNS.ENTITIES.BY_TYPE(entityType)] : []),
        ...(teamId && entityType ? [CACHE_PATTERNS.ENTITIES.BY_TEAM_AND_TYPE(teamId, entityType)] : []),
        ...(selectedTenant ? [CACHE_PATTERNS.DASHBOARD.SUMMARY(selectedTenant.name)] : [])
      ];

      // Invalidate using cache manager for consistency
      cacheManager.invalidateCache(invalidationKeys);

      // CRITICAL: Force Redux store refresh - this ensures UI updates immediately
      dispatch(fetchEntities({}));
      if (selectedTenant) dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));

      // For team-specific pages, also refresh team entities
      if (openTeamTabs.length > 0) {
        openTeamTabs.forEach(teamId => {
          const teamIdNum = parseInt(teamId);
          if (!isNaN(teamIdNum)) {
            dispatch(fetchEntities({ teamId: teamIdNum }));
          }
        });
      }

      // Show appropriate toast notification based on operation type
      const messages: Record<'created' | 'updated' | 'deleted', string> = {
        created: `${data.entityName} has been created successfully`,
        updated: `${data.entityName} has been updated successfully`,
        deleted: `${data.entityName} has been deleted successfully`
      };

      toast({
        title: `Entity ${operation.charAt(0).toUpperCase() + operation.slice(1)}`,
        description: messages[operation] || messages.updated,
        variant: operation === 'deleted' ? "destructive" : "default",
      });
    },
    onCacheUpdated: (data) => {
      // Cache updated via WebSocket
      // Refresh all dashboard data
      if (selectedTenant) dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
      dispatch(fetchEntities({}));
      // Only refresh teams if we already have team tabs open
      if (openTeamTabs.length > 0) {
        dispatch(fetchTeams());
      }

      toast({
        title: "Data Refreshed",
        description: "Dashboard data has been updated with latest information",
        variant: "default",
      });
    },
    onConnect: () => {
      // WebSocket connected - real-time updates enabled
    },
    onDisconnect: () => {
      // WebSocket disconnected - real-time updates disabled
    }
  });

  // Initialize selected tenant when tenants data loads
  useEffect(() => {
    if (tenants.length > 0 && !selectedTenant) {
      // Set default tenant to Data Engineering or first available
      const defaultTenant = tenants.find(t => t.name === 'Data Engineering') || tenants[0];
      setSelectedTenant(defaultTenant);
    }
  }, [tenants, selectedTenant]);

  // Fetch dashboard data when tenant or date range changes
  useEffect(() => {
    if (selectedTenant) {
      // Format dates for API call
      const startDate = summaryDateRange.startDate ? summaryDateRange.startDate.toISOString().split('T')[0] : undefined;
      const endDate = summaryDateRange.endDate ? summaryDateRange.endDate.toISOString().split('T')[0] : undefined;

      // Fetch dashboard summary with date range parameters
      dispatch(fetchDashboardSummary({ 
        tenantName: selectedTenant.name,
        startDate,
        endDate
      }));

      // Always load ALL entities for Summary dashboard - don't filter by team
      dispatch(fetchEntities({})); // Load ALL entities for summary dashboard
      // Load teams data for chart display (silent load for summary page)
      dispatch(fetchTeams());
      setTeamsLoaded(true);
    }
  }, [dispatch, selectedTenant, summaryDateRange]);

  // Filter entities based on tab and tenant - only show entity owners
  const filterEntitiesByTenant = (entities: Entity[]) => {
    // Filter by tenant_name and only show entity owners
    return entities.filter(entity => 
      entity.tenant_name === selectedTenant?.name && entity.is_entity_owner === true
    );
  };

  const filteredEntities = filterEntitiesByTenant(entities);
  const tables = filteredEntities.filter((entity) => entity.type === 'table');
  const dags = filteredEntities.filter((entity) => entity.type === 'dag');

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
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });

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

  const handleAddTeamTab = (teamName: string) => {
    if (!openTeamTabs.includes(teamName)) {
      setOpenTeamTabs([...openTeamTabs, teamName]);
      // Initialize date range for this team if not already set
      setTeamDateRanges((prev) => (
        prev[teamName]
          ? prev
          : {
              ...prev,
              [teamName]: {
                startDate: startOfDay(subDays(new Date(), 29)),
                endDate: endOfDay(new Date()),
                label: 'Last 30 Days',
              },
            }
      ));
    }
    setActiveTab(teamName);
  };

  const handleCloseTeamTab = (teamName: string) => {
    const newOpenTabs = openTeamTabs.filter(tab => tab !== teamName);
    setOpenTeamTabs(newOpenTabs);
    // If we're closing the active tab, switch to summary or first available tab
    if (activeTab === teamName) {
      setActiveTab(newOpenTabs.length > 0 ? newOpenTabs[0] : 'summary');
    }
  };

  const handleDynamicTabChange = (tabName: string) => {
    setActiveTab(tabName);
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
      await deleteEntity(
        selectedEntity.id, 
        selectedEntity.teamId, 
        selectedEntity.type as 'table' | 'dag'
      );

      toast({
        title: 'Success',
        description: `${selectedEntity.name} has been deleted.`,
        variant: 'default',
      });

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
          <Typography variant="h4" component="h1" fontWeight={600} fontFamily="Inter, sans-serif">
            Overall SLA Performance
          </Typography>

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
            {openTeamTabs.map((teamName) => (
              <Tab
                key={teamName}
                value={teamName}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {teamName}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTeamTab(teamName);
                      }}
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
            ))}
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
                {[
                  { 
                    title: "Overall SLA Compliance", 
                    value: metrics?.overallCompliance || 0, 
                    suffix: "%", 
                    progress: metrics?.overallCompliance || 0,
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: lastFetchFailed && !metrics,
                    infoTooltip: "Average SLA compliance calculated across all tables and DAGs monitored across all teams"
                  },
                  { 
                    title: "Tables SLA Compliance", 
                    value: metrics?.tablesCompliance || 0, 
                    suffix: "%", 
                    progress: metrics?.tablesCompliance || 0,
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: lastFetchFailed && !metrics,
                    infoTooltip: "Average SLA compliance percentage calculated across all table entities"
                  },
                  { 
                    title: "DAGs SLA Compliance", 
                    value: metrics?.dagsCompliance || 0, 
                    suffix: "%", 
                    progress: metrics?.dagsCompliance || 0,
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: lastFetchFailed && !metrics,
                    infoTooltip: "Average SLA compliance percentage calculated across all DAG entities"
                  },
                  { 
                    title: "Entities Monitored", 
                    value: metrics?.entitiesCount || 0, 
                    suffix: "",
                    loading: metricsLoading && !lastFetchFailed,
                    showDataUnavailable: lastFetchFailed && !metrics,
                    subtitle: metrics ? `${tables.length} Tables • ${dags.length} DAGs` : ""
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
                    title="Compliance Trend"
                    filters={['All', 'Tables', 'DAGs']}
                    onFilterChange={setChartFilter}
                    loading={metricsLoading && !lastFetchFailed}
                    chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} data={complianceTrends?.trend || []} loading={metricsLoading} />}
                  />
                </Box>

                <Box flex="1 1 500px" minWidth="500px">
                  <ChartCard
                    title="Team Performance Comparison"
                    loading={metricsLoading && !lastFetchFailed}
                    chart={<TeamComparisonChart entities={entities} teams={teams} selectedTenant={selectedTenant?.name || ''} loading={metricsLoading} hasMetrics={metrics !== null} />}
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
                    entities={tables}
                    type="table"
                    teams={teams}
                    onEditEntity={handleEditEntity}
                    onDeleteEntity={handleDeleteEntity}
                    onViewHistory={() => {}}
                    onViewDetails={handleViewDetails}
                    onSetNotificationTimeline={handleNotificationTimeline}
                    showActions={false}
                    hasMetrics={metrics !== null}
                    trendLabel={`${summaryDateRange.label} Trend`}
                  />
                )}
              </Box>

              <Box role="tabpanel" hidden={tabValue !== 1}>
                {tabValue === 1 && (
                  <EntityTable
                    entities={dags}
                    type="dag"
                    teams={teams}
                    onEditEntity={handleEditEntity}
                    onDeleteEntity={handleDeleteEntity}
                    onViewHistory={() => {}}
                    onViewDetails={handleViewDetails}
                    onViewTasks={handleViewTasks}
                    onSetNotificationTimeline={handleNotificationTimeline}
                    showActions={false}
                    hasMetrics={metrics !== null}
                    trendLabel={`${summaryDateRange.label} Trend`}
                  />
                )}
              </Box>
            </Box>
          )}
        </Box>

        {/* Team Tab Content */}
        {openTeamTabs.map((teamName) => (
          <Box key={teamName} role="tabpanel" hidden={activeTab !== teamName}>
            {activeTab === teamName && (
              <TeamDashboard
                teamName={teamName}
                tenantName={selectedTenant?.name || ''}
                dateRange={teamDateRanges[teamName]}
                onDateRangeChange={(range) => setTeamDateRanges((prev) => ({ ...prev, [teamName]: range }))}
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
        ))}
      </Box>

      {/* Modals */}
      <AddEntityModal
        open={openAddModal}
        onClose={() => setOpenAddModal(false)}
        teams={teams}
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
      />

      <EditEntityModal
        open={openEditModal}
        onClose={() => setOpenEditModal(false)}
        entity={selectedEntity}
        teams={teams}
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
          toast({
            title: 'Success',
            description: 'Notification timeline has been configured.',
            variant: 'default',
          });
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
