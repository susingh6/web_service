import { useState, useEffect } from 'react';
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
import TeamDashboard from '@/components/dashboard/TeamDashboard';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { getTenants, getDefaultTenant, preloadTenantCache, type Tenant } from '@/lib/tenantCache';
import { useWebSocket } from '@/hooks/useWebSocket';

const Summary = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  
  const { metrics, isLoading: metricsLoading } = useAppSelector((state) => state.dashboard);
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
  const [selectedTenant, setSelectedTenant] = useState<Tenant>(getDefaultTenant);
  const [tenants, setTenants] = useState<Tenant[]>(getTenants);
  const [openTeamTabs, setOpenTeamTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('summary');
  
  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    onEntityUpdated: (data) => {
      console.log('Entity updated via WebSocket:', data);
      // Invalidate and refetch entities to show updated data
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      dispatch(fetchEntities({}));
      dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
      
      // Show toast notification about the update
      toast({
        title: "Entity Updated",
        description: `${data.entityName} has been updated and is now marked as NEW`,
        variant: "default",
      });
    },
    onCacheUpdated: (data) => {
      console.log('Cache updated via WebSocket:', data);
      // Refresh all dashboard data
      dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
      dispatch(fetchEntities({}));
      dispatch(fetchTeams());
      
      toast({
        title: "Data Refreshed",
        description: "Dashboard data has been updated with latest information",
        variant: "default",
      });
    },
    onConnect: () => {
      console.log('WebSocket connected - real-time updates enabled');
    },
    onDisconnect: () => {
      console.log('WebSocket disconnected - real-time updates disabled');
    }
  });
  
  // Fetch dashboard data and preload tenant cache
  useEffect(() => {
    dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
    dispatch(fetchEntities({})); // Load ALL entities for team dashboards
    dispatch(fetchTeams());
    
    // Preload tenant cache for future use
    preloadTenantCache().then(() => {
      setTenants(getTenants());
    });
  }, [dispatch, selectedTenant.name]);
  
  // Filter entities based on tab and tenant
  const filterEntitiesByTenant = (entities: Entity[]) => {
    // Filter by tenant_name - entities are already filtered by backend API
    return entities.filter(entity => entity.tenant_name === selectedTenant.name);
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
      console.log(`Switching to tenant: ${tenant.name}`);
      
      // Invalidate cached dashboard data to force fresh fetch
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      
      dispatch(fetchDashboardSummary({ tenantName: tenant.name }));
      // Do NOT refetch entities - we need all entities for team dashboards
    }
  };

  const handleAddTeamTab = (teamName: string) => {
    if (!openTeamTabs.includes(teamName)) {
      setOpenTeamTabs([...openTeamTabs, teamName]);
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
  
  const handleDeleteEntity = (id: number) => {
    const entity = entities.find(e => e.id === id);
    if (entity) {
      setSelectedEntity(entity);
      setOpenDeleteDialog(true);
    }
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
      
      // This would be a real API call in production
      // await dispatch(deleteEntity(selectedEntity.id)).unwrap();
      
      toast({
        title: 'Success',
        description: `${selectedEntity.name} has been deleted.`,
        variant: 'default',
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/entities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      
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

  const handleTestEntityUpdate = async () => {
    try {
      // Select a random entity from the current tenant to update
      const tenantEntities = entities.filter(e => e.tenant_name === selectedTenant.name);
      if (tenantEntities.length === 0) {
        toast({
          title: 'No Entities',
          description: 'No entities available to update for this tenant',
          variant: 'destructive',
        });
        return;
      }

      const randomEntity = tenantEntities[Math.floor(Math.random() * tenantEntities.length)];
      const team = teams.find(t => t.id === randomEntity.teamId);
      
      const response = await fetch('/api/test/simulate-entity-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entityName: randomEntity.name,
          entityType: randomEntity.type,
          teamName: team?.name || 'Unknown',
          tenantName: selectedTenant.name,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Test Update Sent',
          description: `Simulated update for ${result.entityName} - watch for real-time changes!`,
          variant: 'default',
        });
      } else {
        throw new Error('Failed to send test update');
      }
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: `Failed to send test update: ${error}`,
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
                value={selectedTenant.name}
                onChange={handleTenantChange}
                label="Tenant"
              >
                {tenants.map((tenant) => (
                  <MenuItem key={tenant.id} value={tenant.name}>
                    {tenant.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DateRangePicker />
            <Button
              variant="outlined"
              size="small"
              onClick={handleTestEntityUpdate}
              sx={{ 
                borderColor: isConnected ? 'success.main' : 'error.main',
                color: isConnected ? 'success.main' : 'error.main',
                '&:hover': {
                  borderColor: isConnected ? 'success.dark' : 'error.dark',
                  backgroundColor: isConnected ? 'success.light' : 'error.light'
                }
              }}
            >
              Test Real-time Update
            </Button>
          </Box>
        </Box>
      )}
      
      {/* Dynamic Tabs System */}
      <Box sx={{ mb: 4, bgcolor: 'background.paper', borderRadius: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={(_, newValue) => handleDynamicTabChange(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ 
              minWidth: 'auto',
              flexGrow: 1,
              '& .MuiTabs-scrollButtons': {
                '&.Mui-disabled': { opacity: 0.3 }
              }
            }}
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
                    infoTooltip: "Average SLA compliance calculated across all tables and DAGs monitored across all teams"
                  },
                  { 
                    title: "Tables SLA Compliance", 
                    value: metrics?.tablesCompliance || 0, 
                    suffix: "%", 
                    progress: metrics?.tablesCompliance || 0,
                    infoTooltip: "Average SLA compliance percentage calculated across all table entities"
                  },
                  { 
                    title: "DAGs SLA Compliance", 
                    value: metrics?.dagsCompliance || 0, 
                    suffix: "%", 
                    progress: metrics?.dagsCompliance || 0,
                    infoTooltip: "Average SLA compliance percentage calculated across all DAG entities"
                  },
                  { 
                    title: "Entities Monitored", 
                    value: metrics?.entitiesCount || 0, 
                    suffix: "",
                    subtitle: `${tables.length} Tables • ${dags.length} DAGs`
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
                    loading={metricsLoading}
                    chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
                  />
                </Box>
                
                <Box flex="1 1 500px" minWidth="500px">
                  <ChartCard
                    title="Team Performance Comparison"
                    loading={metricsLoading}
                    chart={<TeamComparisonChart entities={entities} teams={teams} selectedTenant={selectedTenant.name} />}
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
                tenantName={selectedTenant.name}
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
