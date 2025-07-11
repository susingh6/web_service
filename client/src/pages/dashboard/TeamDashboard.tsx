import { useState, useEffect } from 'react';
import { Box, Typography, Tabs, Tab, Card, CardContent, Chip, Paper, Button } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchEntities } from '@/features/sla/slices/entitiesSlice';
import { Entity, Team } from '@shared/schema';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';

interface TeamDashboardProps {
  teamName: string;
  tenantName: string;
  onEditEntity: (entity: Entity) => void;
  onDeleteEntity: (id: number) => void;
  onViewDetails: (entity: Entity) => void;
  onAddEntity: () => void;
  onBulkUpload: () => void;
  onNotificationTimeline: (entity: Entity) => void;
  onViewTasks: (entity: Entity) => void;
}

const TeamDashboard = ({ 
  teamName, 
  tenantName, 
  onEditEntity, 
  onDeleteEntity, 
  onViewDetails, 
  onAddEntity, 
  onBulkUpload, 
  onNotificationTimeline, 
  onViewTasks 
}: TeamDashboardProps) => {
  const dispatch = useAppDispatch();
  const { list: entities, teams, isLoading } = useAppSelector((state) => state.entities);
  
  const [tabValue, setTabValue] = useState(0);
  const [chartFilter, setChartFilter] = useState('All');
  const [entitiesChartFilter, setEntitiesChartFilter] = useState('All');
  
  // Get current team info by name
  const team = teams.find((t: Team) => t.name === teamName);
  
  // Fetch data when team is found
  useEffect(() => {
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
  
  // Show loading state when team is not found
  if (!team) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="text.secondary">
          Loading team dashboard for {teamName}...
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
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
                onClick={onAddEntity}
              >
                Add Entity
              </Button>
              
              <Button
                variant="outlined"
                color="primary"
                startIcon={<UploadIcon />}
                onClick={onBulkUpload}
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
              trend: 1.5, 
              progress: dagsComplianceAvg, 
              suffix: "%",
              infoTooltip: `Average SLA compliance percentage calculated across all DAG entities for ${team.name} team`
            },
            { 
              title: "Entities Monitored", 
              value: teamEntities.length, 
              trend: 0, 
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
              loading={isLoading}
              chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
            />
          </Box>
          
          <Box flex="1 1 500px" minWidth="500px">
            <ChartCard
              title="Top 5 Entities Performance"
              filters={['All', 'Tables', 'DAGs']}
              onFilterChange={setEntitiesChartFilter}
              loading={isLoading}
              chart={<EntityPerformanceChart entities={teamEntities} filter={entitiesChartFilter} />}
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
              onEditEntity={onEditEntity}
              onDeleteEntity={onDeleteEntity}
              onViewHistory={() => {}}
              onViewDetails={onViewDetails}
              onSetNotificationTimeline={onNotificationTimeline}
              showActions={true}
            />
          )}
        </Box>
        
        <Box role="tabpanel" hidden={tabValue !== 1}>
          {tabValue === 1 && (
            <EntityTable
              entities={dags}
              type="dag"
              teams={teams}
              onEditEntity={onEditEntity}
              onDeleteEntity={onDeleteEntity}
              onViewHistory={() => {}}
              onViewDetails={onViewDetails}
              onViewTasks={onViewTasks}
              onSetNotificationTimeline={onNotificationTimeline}
              showActions={true}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default TeamDashboard;