import { useEffect, useMemo } from 'react';
import { Box, Typography, Grid } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { fetchEntities } from '@/features/sla/slices/entitiesSlice';
import { fetchDashboardSummary } from '@/features/sla/slices/dashboardSlice';
import MetricCard from '@/components/dashboard/MetricCard';
import ChartCard from '@/components/dashboard/ChartCard';
import ComplianceTrendChart from '@/components/dashboard/ComplianceTrendChart';
import EntityTable from '@/components/dashboard/EntityTable';
import { Entity } from '@shared/schema';

interface TeamDashboardProps {
  teamName: string;
  tenantName: string;
  onEditEntity: (entity: Entity) => void;
  onDeleteEntity: (id: number) => void;
  onViewDetails: (entity: Entity) => void;
}

const TeamDashboard = ({ 
  teamName, 
  tenantName, 
  onEditEntity, 
  onDeleteEntity, 
  onViewDetails 
}: TeamDashboardProps) => {
  const dispatch = useAppDispatch();
  const { list: entities, teams } = useAppSelector((state) => state.entities);
  
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
  
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" component="h2" fontWeight={600} mb={3}>
        {teamName} Team Dashboard
      </Typography>
      
      {/* Team-specific Metrics */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Overall SLA Compliance"
            value={teamMetrics.overallCompliance}
            suffix="%"
            progress={teamMetrics.overallCompliance}
            infoTooltip={`Average SLA compliance for ${teamName} team`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Tables SLA Compliance"
            value={teamMetrics.tablesCompliance}
            suffix="%"
            progress={teamMetrics.tablesCompliance}
            infoTooltip={`Average SLA compliance for ${teamName} team tables`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="DAGs SLA Compliance"
            value={teamMetrics.dagsCompliance}
            suffix="%"
            progress={teamMetrics.dagsCompliance}
            infoTooltip={`Average SLA compliance for ${teamName} team DAGs`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Entities Monitored"
            value={teamMetrics.entitiesCount}
            suffix=""
            subtitle={`${tables.length} Tables • ${dags.length} DAGs`}
          />
        </Grid>
      </Grid>
      
      {/* Team Compliance Trend Chart */}
      <Box mb={4}>
        <ChartCard
          title={`${teamName} Team Compliance Trend`}
          filters={['All', 'Tables', 'DAGs']}
          chart={<ComplianceTrendChart filter="all" />}
        />
      </Box>
      
      {/* Team Entities Table */}
      <Box>
        <EntityTable
          entities={teamEntities}
          type="all"
          teams={teams}
          onEditEntity={onEditEntity}
          onDeleteEntity={onDeleteEntity}
          onViewHistory={() => {}}
          onViewDetails={onViewDetails}
          showActions={true}
        />
      </Box>
    </Box>
  );
};

export default TeamDashboard;