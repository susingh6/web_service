import { useState, useEffect } from 'react';
import { Box, Grid, Typography, Tabs, Tab, Card, CardContent, Chip, Paper, Button } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon } from '@mui/icons-material';
import { useParams } from 'wouter';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchEntities, fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { Entity, Team } from '@shared/schema';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import EntityDetailsModal from '@/components/modals/EntityDetailsModal';
import EditEntityModal from '@/components/modals/EditEntityModal';
import AddEntityModal from '@/components/modals/AddEntityModal';
import BulkUploadModal from '@/components/modals/BulkUploadModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import TaskManagementModal from '@/components/modals/TaskManagementModal';
import { NotificationTimelineModal } from '@/components/notifications/timeline/NotificationTimelineModal';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

const TeamDashboard = () => {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  
  const { list: entities, teams, isLoading } = useAppSelector((state) => state.entities);
  
  const [tabValue, setTabValue] = useState(0);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [openDetailsDrawer, setOpenDetailsDrawer] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openBulkModal, setOpenBulkModal] = useState(false);
  const [openTasksModal, setOpenTasksModal] = useState(false);
  const [openNotificationTimelineModal, setOpenNotificationTimelineModal] = useState(false);
  const [chartFilter, setChartFilter] = useState('All');
  const [entitiesChartFilter, setEntitiesChartFilter] = useState('All');
  
  // Get current team info - try both ID and name lookup
  const team = teams.find((t: Team) => {
    const teamId = parseInt(id || '0');
    return t.id === teamId || t.name.toLowerCase() === (id || '').toLowerCase();
  });
  
  // Debug logging for team lookup
  useEffect(() => {
    if (id && teams.length > 0) {
      console.log('TeamDashboard: Looking for team with ID/name:', id);
      console.log('Available teams:', teams.map(t => ({ id: t.id, name: t.name })));
      console.log('Found team:', team);
    }
  }, [id, teams, team]);
  
  // Fetch data
  useEffect(() => {
    dispatch(fetchTeams());
    if (team?.id) {
      dispatch(fetchEntities({ teamId: team.id }));
    }
  }, [dispatch, team?.id]);
  
  // Filter entities for this team
  const teamEntities = entities.filter((entity) => entity.teamId === team?.id);
  const tables = teamEntities.filter((entity) => entity.type === 'table');
  const dags = teamEntities.filter((entity) => entity.type === 'dag');
  
  // Calculate team metrics
  const calculateAvgSla = (items: Entity[]) => {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, item) => acc + (item.currentSla || 0), 0);
    return parseFloat((sum / items.length).toFixed(1));
  };
  
  const tablesComplianceAvg = calculateAvgSla(tables);
  const dagsComplianceAvg = calculateAvgSla(dags);
  const overallComplianceAvg = calculateAvgSla(teamEntities);
  
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
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

  const handleViewTasks = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenTasksModal(true);
  };

  const handleSetNotificationTimeline = (entity: Entity) => {
    setSelectedEntity(entity);
    setOpenNotificationTimelineModal(true);
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
  
  if (isLoading) {
    return (
      <Box p={4} display="flex" justifyContent="center">
        <Typography>Loading team data...</Typography>
      </Box>
    );
  }
  
  if (!team && teams.length > 0) {
    return (
      <Box p={4}>
        <Typography variant="h5" color="error">Team not found</Typography>
        <Typography variant="body2" sx={{ mt: 2 }}>
          Looking for team: "{id}"
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Available teams: {teams.map(t => `${t.name} (ID: ${t.id})`).join(', ')}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
          Try visiting: /teams/1 or /teams/pgm
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box>
      <Box mb={4}>
        <Paper elevation={0} sx={{ p: 3, borderRadius: 2, mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography variant="h4" component="h1" fontWeight={600} fontFamily="Inter, sans-serif">
                {team.name}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                {team.description || `Team dashboard for ${team.name}`}
              </Typography>
              <Box display="flex" alignItems="center" mt={2}>
                <Chip 
                  label={`${teamEntities.length} Entities`} 
                  size="small" 
                  sx={{ mr: 1, bgcolor: 'primary.light', color: 'white' }} 
                />
                <Chip 
                  label={`${tables.length} Tables`} 
                  size="small" 
                  sx={{ mr: 1, bgcolor: 'info.light', color: 'white' }} 
                />
                <Chip 
                  label={`${dags.length} DAGs`} 
                  size="small" 
                  sx={{ bgcolor: 'secondary.light', color: 'white' }} 
                />
              </Box>
            </Box>
            
            <Box display="flex" alignItems="center" gap={2}>
              <DateRangePicker />
              
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={handleAddEntity}
              >
                Add Entity
              </Button>
              
              <Button
                variant="outlined"
                color="primary"
                startIcon={<UploadIcon />}
                onClick={handleBulkUpload}
              >
                Bulk Upload
              </Button>
            </Box>
          </Box>
        </Paper>
        
        {/* Metrics Cards */}
        <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
          {[
            { 
              title: "Overall SLA Compliance", 
              value: overallComplianceAvg, 
              trend: 1.2, 
              progress: overallComplianceAvg, 
              suffix: "%",
              infoTooltip: `Average SLA compliance calculated across all tables and DAGs for ${team.name} team`
            },
            { 
              title: "Tables SLA Compliance", 
              value: tablesComplianceAvg, 
              trend: 0.8, 
              progress: tablesComplianceAvg, 
              suffix: "%",
              infoTooltip: `Average SLA compliance percentage calculated across all table entities for ${team.name} team`
            },
            { 
              title: "DAGs SLA Compliance", 
              value: dagsComplianceAvg, 
              trend: -0.3, 
              progress: dagsComplianceAvg, 
              suffix: "%",
              infoTooltip: `Average SLA compliance percentage calculated across all DAG entities for ${team.name} team`
            }
          ].map((card, idx) => (
            <Box key={card.title} flex="1 1 300px" minWidth="300px">
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
              chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
            />
          </Box>
          
          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title="Top 5 Entities Performance"
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setEntitiesChartFilter}
              chart={<EntityPerformanceChart entities={teamEntities.slice(0, 5)} filter={entitiesChartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
            />
          </Box>
        </Box>
      </Box>
      
      {/* Entities Tables */}
      <Box sx={{ mb: 4, bgcolor: 'background.paper', borderRadius: 1 }}>
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
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
              onViewHistory={handleViewDetails}
              onViewDetails={handleViewDetails}
              onSetNotificationTimeline={handleSetNotificationTimeline}
              showActions={true} // Show actions in team tabs
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
              onViewHistory={handleViewDetails}
              onViewDetails={handleViewDetails}
              onViewTasks={handleViewTasks}
              onSetNotificationTimeline={handleSetNotificationTimeline}
              showActions={true} // Show actions in team tabs
            />
          )}
        </Box>
      </Box>
      
      {/* Modals */}
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
      
      <AddEntityModal
        open={openAddModal}
        onClose={() => setOpenAddModal(false)}
        teams={teams}
      />
      
      <BulkUploadModal
        open={openBulkModal}
        onClose={() => setOpenBulkModal(false)}
      />
      
      <TaskManagementModal
        isOpen={openTasksModal}
        onClose={() => {
          setOpenTasksModal(false);
          setSelectedEntity(null);
        }}
        dag={selectedEntity}
      />
      
      <NotificationTimelineModal
        open={openNotificationTimelineModal}
        onClose={() => {
          setOpenNotificationTimelineModal(false);
          setSelectedEntity(null);
        }}
        entity={selectedEntity}
      />
    </Box>
  );
};

export default TeamDashboard;
