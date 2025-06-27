import { useState, useEffect } from 'react';
import { Box, Grid, Button, Typography, Tabs, Tab } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchDashboardSummary } from '@/features/sla/slices/dashboardSlice';
import { fetchEntities, fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { Entity } from '@/features/sla/types';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import TeamComparisonChart from '@/components/dashboard/TeamComparisonChart';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import AddEntityModal from '@/components/modals/AddEntityModal';
import BulkUploadModal from '@/components/modals/BulkUploadModal';
import EntityDetailsDrawer from '@/components/modals/EntityDetailsDrawer';
import EditEntityModal from '@/components/modals/EditEntityModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

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
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [chartFilter, setChartFilter] = useState('All');
  
  // Fetch dashboard data
  useEffect(() => {
    dispatch(fetchDashboardSummary());
    dispatch(fetchEntities({}));
    dispatch(fetchTeams());
  }, [dispatch]);
  
  // Filter entities based on tab
  const tables = entities.filter((entity) => entity.type === 'table');
  const dags = entities.filter((entity) => entity.type === 'dag');
  
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
  
  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1" fontWeight={600} fontFamily="Inter, sans-serif">
          Overall SLA Performance
        </Typography>
        
        <Box display="flex" alignItems="center" gap={2}>
          <DateRangePicker />
        </Box>
      </Box>
      
      {/* Metrics Cards */}
      <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
        {[
          { title: "Overall SLA Compliance", value: metrics?.overallCompliance || 0, suffix: "%", progress: metrics?.overallCompliance || 0 },
          { title: "Tables SLA Compliance", value: metrics?.tablesCompliance || 0, suffix: "%", progress: metrics?.tablesCompliance || 0 },
          { title: "DAGs SLA Compliance", value: metrics?.dagsCompliance || 0, suffix: "%", progress: metrics?.dagsCompliance || 0 },
          { title: "Entities Monitored", value: metrics?.entitiesCount || 0, suffix: "" }
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
            title="Compliance Trend (Last 30 Days)"
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
            actions={true}
            chart={<TeamComparisonChart />}
          />
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
              onViewHistory={() => {}}
              onViewDetails={handleViewDetails}
              showActions={false} // Hide actions in summary pages
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
              showActions={false} // Hide actions in summary pages
            />
          )}
        </Box>
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
    </Box>
  );
};

export default Summary;
