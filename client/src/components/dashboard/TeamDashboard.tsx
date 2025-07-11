import { useMemo, useState } from 'react';
import { Box, Typography, Tabs, Tab, Button } from '@mui/material';
import { Add as AddIcon, Upload as UploadIcon } from '@mui/icons-material';
import { useAppSelector } from '@/lib/store';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import EntityPerformanceChart from '@/components/dashboard/EntityPerformanceChart';
import EntityTable from '@/components/dashboard/EntityTable';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { Entity } from '@shared/schema';

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
  const { list: entities, teams } = useAppSelector((state) => state.entities);
  
  // State for chart filters and tabs
  const [chartFilter, setChartFilter] = useState('All');
  const [tabValue, setTabValue] = useState(0);
  const [performanceFilter, setPerformanceFilter] = useState('All');
  
  // Find the team ID for this team
  const currentTeam = teams.find(team => team.name === teamName);
  
  // Filter entities for this specific team
  const teamEntities = useMemo(() => {
    if (!currentTeam) return [];
    return entities.filter(entity => 
      entity.teamId === currentTeam.id && 
      entity.tenant_name === tenantName
    );
  }, [entities, currentTeam, tenantName]);
  
  const tables = teamEntities.filter(entity => entity.type === 'table');
  const dags = teamEntities.filter(entity => entity.type === 'dag');
  
  // Calculate team-specific metrics
  const teamMetrics = useMemo(() => {
    if (teamEntities.length === 0) {
      return {
        overallCompliance: 0,
        tablesCompliance: 0,
        dagsCompliance: 0,
        entitiesCount: 0
      };
    }
    
    const calculateCompliance = (entities: Entity[]) => {
      if (entities.length === 0) return 0;
      const total = entities.reduce((sum, entity) => sum + (entity.currentSla || 0), 0);
      return Math.round((total / entities.length) * 10) / 10;
    };
    
    return {
      overallCompliance: calculateCompliance(teamEntities),
      tablesCompliance: calculateCompliance(tables),
      dagsCompliance: calculateCompliance(dags),
      entitiesCount: teamEntities.length
    };
  }, [teamEntities, tables, dags]);
  
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };
  
  return (
    <Box sx={{ p: 3 }}>
      {/* Team Header Section */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" fontWeight={600} sx={{ mb: 1 }}>
          {teamName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {currentTeam?.description || `Team responsible for ${teamName} operations`}
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
            {teamEntities.length} {teamEntities.length === 1 ? 'Entity' : 'Entities'} • {tables.length} {tables.length === 1 ? 'Table' : 'Tables'} • {dags.length} {dags.length === 1 ? 'DAG' : 'DAGs'}
          </Typography>
          <Box display="flex" gap={1}>
            <Box sx={{ 
              bgcolor: 'success.main', 
              color: 'white', 
              px: 1, 
              py: 0.5, 
              borderRadius: 1, 
              fontSize: '0.75rem',
              fontWeight: 500
            }}>
              Active
            </Box>
            <Box sx={{ 
              bgcolor: 'info.main', 
              color: 'white', 
              px: 1, 
              py: 0.5, 
              borderRadius: 1, 
              fontSize: '0.75rem',
              fontWeight: 500
            }}>
              Monitoring
            </Box>
            <Box sx={{ 
              bgcolor: 'warning.main', 
              color: 'white', 
              px: 1, 
              py: 0.5, 
              borderRadius: 1, 
              fontSize: '0.75rem',
              fontWeight: 500
            }}>
              SLA
            </Box>
          </Box>
        </Box>
      </Box>
      
      {/* Header with action buttons */}
      <Box display="flex" justifyContent="flex-end" alignItems="center" mb={3}>
        <Box display="flex" gap={2} alignItems="center">
          <DateRangePicker />
          
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onAddEntity}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              borderRadius: 2,
              px: 3
            }}
          >
            Add Entity
          </Button>
          
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={onBulkUpload}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              borderRadius: 2,
              px: 3
            }}
          >
            Bulk Upload
          </Button>
        </Box>
      </Box>
      
      {/* Team-specific Metrics */}
      <Box display="flex" flexWrap="wrap" gap={3} mb={4}>
        {[
          { 
            title: "Overall SLA Compliance", 
            value: teamMetrics.overallCompliance || 0, 
            suffix: "%", 
            progress: teamMetrics.overallCompliance || 0,
            infoTooltip: `Average SLA compliance for ${teamName} team`
          },
          { 
            title: "Tables SLA Compliance", 
            value: teamMetrics.tablesCompliance || 0, 
            suffix: "%", 
            progress: teamMetrics.tablesCompliance || 0,
            infoTooltip: `Average SLA compliance for ${teamName} team tables`
          },
          { 
            title: "DAGs SLA Compliance", 
            value: teamMetrics.dagsCompliance || 0, 
            suffix: "%", 
            progress: teamMetrics.dagsCompliance || 0,
            infoTooltip: `Average SLA compliance for ${teamName} team DAGs`
          },
          { 
            title: "Entities Monitored", 
            value: teamMetrics.entitiesCount || 0, 
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
            chart={<ComplianceTrendChart filter={chartFilter.toLowerCase() as 'all' | 'tables' | 'dags'} />}
          />
        </Box>
        
        <Box flex="1 1 500px" minWidth="500px">
          <ChartCard
            title="Top 5 Entities Performance"
            filters={['All', 'Tables', 'DAGs']}
            onFilterChange={setPerformanceFilter}
            chart={<EntityPerformanceChart entities={teamEntities} filter={performanceFilter} />}
          />
        </Box>
      </Box>
      
      {/* Tables/DAGs Sub-tabs */}
      <Tabs 
        value={tabValue} 
        onChange={handleTabChange} 
        sx={{ 
          mb: 3,
          '& .MuiTabs-indicator': {
            backgroundColor: 'primary.main'
          }
        }}
      >
        <Tab 
          label="Tables" 
          sx={{ 
            fontWeight: 500, 
            textTransform: 'none',
            fontSize: '1rem',
            minHeight: 48,
            px: 3,
            '&.Mui-selected': { fontWeight: 600 } 
          }} 
        />
        <Tab 
          label="DAGs" 
          sx={{ 
            fontWeight: 500, 
            textTransform: 'none',
            fontSize: '1rem',
            minHeight: 48,
            px: 3,
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
  );
};

export default TeamDashboard;