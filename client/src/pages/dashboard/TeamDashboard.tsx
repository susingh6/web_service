import { useState, useEffect } from 'react';
import { Box, Grid, Typography, Tabs, Tab, Card, CardContent, Chip, Paper, Button } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon } from '@mui/icons-material';
import { useParams } from 'wouter';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchEntities, fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { Entity, Team } from '@/features/sla/types';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import EntityDetailsDrawer from '@/components/modals/EntityDetailsDrawer';
import EditEntityModal from '@/components/modals/EditEntityModal';
import AddEntityModal from '@/components/modals/AddEntityModal';
import BulkUploadModal from '@/components/modals/BulkUploadModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { getFromCache } from '@/lib/cacheUtils';

const TeamDashboard = () => {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id || '0');
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
  const [isAddButtonHovered, setIsAddButtonHovered] = useState(false);
  const [isBulkButtonHovered, setIsBulkButtonHovered] = useState(false);
  const [chartFilter, setChartFilter] = useState('All');
  
  // Get current team info
  const team = teams.find((t: Team) => t.id === teamId);
  
  // Fetch data
  useEffect(() => {
    if (teamId && !isNaN(teamId)) {
      dispatch(fetchEntities({ teamId }));
    }
    dispatch(fetchTeams());
  }, [dispatch, teamId]);
  
  // Preload AddEntityModal when Add Entity button is hovered
  useEffect(() => {
    if (isAddButtonHovered) {
      // This will trigger the modal component to be loaded in memory
      // before the user actually clicks the button
      const tenantOptions = getFromCache('tenants');
      const teamOptions = getFromCache('teams');
      const dagOptions = getFromCache('dags');
      
      // Preload both Table and DAG related data to ensure both form types
      // are ready, regardless of which tab the user selects first
      console.log('Preloading modal data on hover for both Table and DAG forms');
      
      // Touch the AddEntityModal component to ensure it's preloaded
      // This approach ensures the component is ready when the user clicks
      import('@/components/modals/AddEntityModal');
    }
  }, [isAddButtonHovered]);

  // Preload BulkUploadModal when Bulk Upload button is hovered
  useEffect(() => {
    if (isBulkButtonHovered) {
      console.log('Preloading bulk upload modal data on hover');
      
      // Touch the BulkUploadModal component to ensure it's preloaded
      import('@/components/modals/BulkUploadModal');
    }
  }, [isBulkButtonHovered]);
  
  // Filter entities for this team
  const teamEntities = entities.filter((entity) => entity.teamId === teamId);
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
  
  if (!team) {
    return (
      <Box p={4}>
        <Typography variant="h5" color="error">Team not found</Typography>
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
                onMouseEnter={() => setIsAddButtonHovered(true)}
                onMouseLeave={() => setIsAddButtonHovered(false)}
              >
                Add Entity
              </Button>
              
              <Button
                variant="outlined"
                color="primary"
                startIcon={<UploadIcon />}
                onClick={handleBulkUpload}
                onMouseEnter={() => setIsBulkButtonHovered(true)}
                onMouseLeave={() => setIsBulkButtonHovered(false)}
              >
                Bulk Upload
              </Button>
            </Box>
          </Box>
        </Paper>
        
        {/* Metrics Cards */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Overall SLA Compliance"
              value={overallComplianceAvg}
              trend={1.2}
              progress={overallComplianceAvg}
              suffix="%"
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Tables SLA Compliance"
              value={tablesComplianceAvg}
              trend={0.8}
              progress={tablesComplianceAvg}
              suffix="%"
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <MetricCard
              title="DAGs SLA Compliance"
              value={dagsComplianceAvg}
              trend={-0.3}
              progress={dagsComplianceAvg}
              suffix="%"
            />
          </Grid>
        </Grid>
        
        {/* Charts */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} lg={6}>
            <ChartCard
              title="Compliance Trend (Last 30 Days)"
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setChartFilter}
              chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
            />
          </Grid>
          
          <Grid item xs={12} lg={6}>
            <ChartCard
              title="Top 5 Entities Performance"
              chart={<EntityPerformanceChart entities={teamEntities.slice(0, 5)} />}
            />
          </Grid>
        </Grid>
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
              onViewHistory={() => {}}
              onViewDetails={handleViewDetails}
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
            />
          )}
        </Box>
      </Box>
      
      {/* Modals */}
      <EntityDetailsDrawer
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
    </Box>
  );
};

export default TeamDashboard;
