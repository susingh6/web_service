import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography,
  Tabs,
  Tab,
  Button,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Drawer
} from '@mui/material';
import { Add, Edit, Delete, Notifications, Assignment, Close } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchEntities, fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { fetchDashboardSummary } from '@/features/sla/slices/dashboardSlice';
import { Entity } from '@/features/sla/slices/entitiesSlice';
import AddEntityModal from '@/components/modals/AddEntityModal';
import EditEntityModal from '@/components/modals/EditEntityModal';
import BulkUploadModal from '@/components/modals/BulkUploadModal';
import EntityDetailsModal from '@/components/modals/EntityDetailsModal';
import TaskManagementModal from '@/components/modals/TaskManagementModal';
import { NotificationTimelineModal } from '@/components/notifications/timeline/NotificationTimelineModal';
import TeamSelector from '@/components/dashboard/TeamSelector';
import TeamDashboard from '@/pages/dashboard/TeamDashboard';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { type Tenant } from '@/lib/tenantCache';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useEntityMutation, CACHE_PATTERNS, useCacheManager } from '@/utils/cache-management';

const Summary = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { deleteEntity } = useEntityMutation();
  const cacheManager = useCacheManager();
  
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
  // Use React Query for tenants (consistent with other CRUD operations)
  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ['/api/tenants'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/tenants');
      return response.json();
    }
  });
  
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [openTeamTabs, setOpenTeamTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('summary');
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  
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
        ...(selectedTenant?.name ? [CACHE_PATTERNS.DASHBOARD.SUMMARY(selectedTenant.name)] : [])
      ];
      
      // Invalidate using cache manager for consistency
      cacheManager.invalidateCache(invalidationKeys);
      
      // CRITICAL: Force Redux store refresh - this ensures UI updates immediately
      dispatch(fetchEntities({}));
      if (selectedTenant?.name) {
        dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
      }
      
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
      if (selectedTenant?.name) {
        dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
      }
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
  
  // Set default tenant when tenants are loaded
  useEffect(() => {
    if (tenants.length > 0 && !selectedTenant) {
      const defaultTenant = tenants.find(t => t.name === 'Data Engineering') || tenants[0];
      setSelectedTenant(defaultTenant);
    }
  }, [tenants, selectedTenant]);

  useEffect(() => {
    if (selectedTenant?.name) {
      dispatch(fetchDashboardSummary({ tenantName: selectedTenant.name }));
      // Always load ALL entities for Summary dashboard - don't filter by team
      dispatch(fetchEntities({})); // Load ALL entities for summary dashboard
      // Load teams data for chart display (silent load for summary page)
      dispatch(fetchTeams());
      setTeamsLoaded(true);
    }
  }, [dispatch, selectedTenant?.name]);
  
  // Filter entities based on tab and tenant - only show entity owners
  const filterEntitiesByTenant = (entities: Entity[]) => {
    if (!selectedTenant) return [];
    // Filter by tenant_name and only show entity owners
    return entities.filter(entity => 
      entity.tenant_name === selectedTenant.name && entity.is_entity_owner === true
    );
  };

  const filterEntitiesByTab = (entities: Entity[]) => {
    if (tabValue === 0) return entities; // All entities
    if (tabValue === 1) return entities.filter(entity => entity.type === 'table'); // Tables only
    if (tabValue === 2) return entities.filter(entity => entity.type === 'dag'); // DAGs only
    return entities;
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

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleEntityAction = (action: 'view' | 'edit' | 'delete', entity: Entity) => {
    setSelectedEntity(entity);
    if (action === 'view') {
      setOpenDetailsDrawer(true);
    } else if (action === 'edit') {
      setOpenEditModal(true);
    } else if (action === 'delete') {
      setOpenDeleteDialog(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (selectedEntity) {
      await deleteEntity.mutateAsync(selectedEntity.id);
    }
    setOpenDeleteDialog(false);
    setSelectedEntity(null);
  };

  const handleCloseModals = () => {
    setOpenAddModal(false);
    setOpenBulkModal(false);
    setOpenEditModal(false);
    setOpenDeleteDialog(false);
    setOpenDetailsDrawer(false);
    setOpenNotificationModal(false);
    setOpenTaskModal(false);
    setSelectedEntity(null);
  };

  const handleTeamTabOpen = (teamId: string) => {
    if (!openTeamTabs.includes(teamId)) {
      setOpenTeamTabs(prev => [...prev, teamId]);
    }
    setActiveTab(`team-${teamId}`);
  };

  const handleTeamTabClose = (teamId: string) => {
    setOpenTeamTabs(prev => prev.filter(id => id !== teamId));
    if (activeTab === `team-${teamId}`) {
      setActiveTab('summary');
    }
  };

  // Filter entities by tenant and tab
  const filteredEntities = filterEntitiesByTab(filterEntitiesByTenant(entities));
  
  // Get the DAGs and Tables for the charts - filtered by tenant
  const tenantFilteredEntities = filterEntitiesByTenant(entities);
  const dags = tenantFilteredEntities.filter(entity => entity.type === 'dag');
  const tables = tenantFilteredEntities.filter(entity => entity.type === 'table');

  const getTabLabel = (index: number) => {
    const labels = ['All', 'Tables', 'DAGs'];
    const counts = [
      filteredEntities.length,
      filterEntitiesByTab(filterEntitiesByTenant(entities)).filter(e => e.type === 'table').length,
      filterEntitiesByTab(filterEntitiesByTenant(entities)).filter(e => e.type === 'dag').length
    ];
    return `${labels[index]} (${counts[index]})`;
  };

  if (tenantsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Typography>Loading tenants...</Typography>
      </Box>
    );
  }

  if (!selectedTenant) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Typography>No tenants available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header with tenant selector */}
      <Box sx={{ 
        borderBottom: 1, 
        borderColor: 'divider', 
        px: 2, 
        py: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        backgroundColor: 'background.paper'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" component="h1">
            Overall SLA Performance
          </Typography>
          {isConnected && (
            <Chip 
              label="Live" 
              color="success" 
              size="small" 
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Team Selector for opening new team tabs */}
          <TeamSelector 
            teams={teams}
            onTeamSelect={handleTeamTabOpen}
            selectedTeams={openTeamTabs}
          />
          
          {/* Tenant Filter */}
          <FormControl variant="outlined" size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="tenant-filter-label">Tenant</InputLabel>
            <Select
              labelId="tenant-filter-label"
              id="tenant-filter"
              value={selectedTenant?.name || ''}
              onChange={handleTenantChange}
              label="Tenant"
              disabled={!selectedTenant}
            >
              {tenants.map((tenant) => (
                <MenuItem key={tenant.id} value={tenant.name}>
                  {tenant.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Tab Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}>
        <Tabs value={activeTab} variant="scrollable" scrollButtons="auto">
          <Tab 
            value="summary" 
            label="Summary" 
            onClick={() => setActiveTab('summary')}
          />
          {openTeamTabs.map(teamId => {
            const team = teams.find(t => t.id === parseInt(teamId));
            return (
              <Tab
                key={`team-${teamId}`}
                value={`team-${teamId}`}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {team?.name || `Team ${teamId}`}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTeamTabClose(teamId);
                      }}
                      sx={{ ml: 1, p: 0.25 }}
                    >
                      <Close fontSize="small" />
                    </IconButton>
                  </Box>
                }
                onClick={() => setActiveTab(`team-${teamId}`)}
              />
            );
          })}
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'summary' ? (
          <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            {/* Charts Section - Temporarily disabled */}
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Dashboard Charts
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Charts section will be available soon. Selected tenant: {selectedTenant?.name || 'None'}
              </Typography>
            </Paper>
            
            {/* Entities Section */}
            <Paper sx={{ mt: 2, p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Entities ({selectedTenant?.name})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => setOpenAddModal(true)}
                    size="small"
                  >
                    Add Entity
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={() => setOpenBulkModal(true)}
                    size="small"
                  >
                    Bulk Add
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Assignment />}
                    onClick={() => setOpenTaskModal(true)}
                    size="small"
                  >
                    Task Management
                  </Button>
                </Box>
              </Box>

              {/* Entity Tabs */}
              <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 2 }}>
                <Tab label={getTabLabel(0)} />
                <Tab label={getTabLabel(1)} />
                <Tab label={getTabLabel(2)} />
              </Tabs>

              {/* Entity List */}
              {entitiesLoading ? (
                <Typography>Loading entities...</Typography>
              ) : filteredEntities.length === 0 ? (
                <Typography color="textSecondary">
                  No entities found for {selectedTenant?.name}
                </Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 1 }}>
                  {filteredEntities.map((entity) => (
                    <Box
                      key={entity.id}
                      sx={{
                        p: 2,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <Box>
                        <Typography variant="subtitle1" fontWeight="medium">
                          {entity.name}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {entity.type.toUpperCase()} • {entity.teamName}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton 
                          size="small" 
                          onClick={() => handleEntityAction('view', entity)}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={() => handleEntityAction('edit', entity)}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={() => handleEntityAction('delete', entity)}
                          color="error"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small"
                          onClick={() => setOpenNotificationModal(true)}
                        >
                          <Notifications fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </Box>
        ) : (
          // Team Dashboard
          openTeamTabs.map(teamId => (
            activeTab === `team-${teamId}` && (
              <TeamDashboard
                key={teamId}
                teamId={parseInt(teamId)}
                onClose={() => handleTeamTabClose(teamId)}
              />
            )
          ))
        )}
      </Box>

      {/* Modals and Drawers */}
      <AddEntityModal
        open={openAddModal}
        onClose={handleCloseModals}
      />

      <EditEntityModal
        open={openEditModal}
        onClose={handleCloseModals}
        entity={selectedEntity}
      />

      <BulkUploadModal
        open={openBulkModal}
        onClose={handleCloseModals}
      />

      <TaskManagementModal
        open={openTaskModal}
        onClose={handleCloseModals}
        entities={filteredEntities}
      />

      <NotificationTimelineModal
        open={openNotificationModal}
        onClose={handleCloseModals}
        entity={selectedEntity}
      />

      <EntityDetailsModal
        open={openDetailsDrawer}
        onClose={handleCloseModals}
        entity={selectedEntity}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDeleteDialog} onClose={handleCloseModals}>
        <DialogTitle>Delete Entity</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{selectedEntity?.name}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModals}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Summary;