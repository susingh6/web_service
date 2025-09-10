import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  TooltipProps
} from 'recharts';

// Generate tenant-specific team data
const generateTeamData = (entities: any[], teams: any[], selectedTenant?: string) => {
  if (!entities || !teams || entities.length === 0 || teams.length === 0) {
    return [];
  }

  // Filter entities by tenant if specified
  let filteredEntities = entities;
  if (selectedTenant) {
    filteredEntities = entities.filter(entity => entity.tenant_name === selectedTenant);
  }

  // Get teams that have entities in the filtered tenant
  const relevantTeamIds = new Set(filteredEntities.map(entity => entity.teamId));
  const relevantTeams = teams.filter(team => relevantTeamIds.has(team.id));

  // Group entities by team and calculate averages - only consider entity owners
  const teamStats = relevantTeams.map(team => {
    const teamEntities = filteredEntities.filter(entity => 
      entity.teamId === team.id && entity.is_entity_owner === true
    );
    const tables = teamEntities.filter(entity => entity.type === 'table');
    const dags = teamEntities.filter(entity => entity.type === 'dag');
    
    const calcAvg = (items: any[]) => {
      if (items.length === 0) return 0;
      const sum = items.reduce((acc, item) => acc + (item.currentSla || 0), 0);
      return parseFloat((sum / items.length).toFixed(1));
    };
    
    return {
      name: team.name,
      tables: calcAvg(tables),
      dags: calcAvg(dags),
    };
  }).filter(team => team.tables > 0 || team.dags > 0); // Only include teams with data

  return teamStats;
};

interface TeamComparisonChartProps {
  data?: any[];
  entities?: any[];
  teams?: any[];
  selectedTenant?: string;
  loading?: boolean;
}

const TeamComparisonChart = ({
  data,
  entities = [],
  teams = [],
  selectedTenant,
  loading = false,
}: TeamComparisonChartProps) => {
  const theme = useTheme();
  
  // Show loading state
  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Loading team performance data...
        </Typography>
      </Box>
    );
  }

  // Use provided data or generate from entities/teams
  const chartData = data || generateTeamData(entities, teams, selectedTenant);
  
  // Show empty state if no data
  if (!chartData || chartData.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No team performance data available for selected tenant and date range
        </Typography>
      </Box>
    );
  }
  
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <Box 
          sx={{ 
            backgroundColor: 'background.paper',
            border: `1px solid ${theme.palette.divider}`,
            p: 1.5,
            borderRadius: 1,
            boxShadow: theme.shadows[2],
          }}
        >
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            {label}
          </Typography>
          
          {payload.map((entry) => (
            <Box key={entry.name} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <Box 
                sx={{ 
                  width: 10, 
                  height: 10, 
                  backgroundColor: entry.color,
                  borderRadius: 1,
                  mr: 1,
                }} 
              />
              <Typography variant="body2" sx={{ mr: 1 }}>
                {entry.name}:
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {entry.value}%
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    return null;
  };
  
  // Typography is now imported at the top of the file
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis 
          dataKey="name"
          tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
        />
        <YAxis 
          domain={[0, 100]} 
          ticks={[0, 25, 50, 75, 100]}
          tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          formatter={(value) => (
            <span style={{ 
              color: theme.palette.text.primary, 
              fontSize: '0.875rem',
            }}>
              {value}
            </span>
          )} 
        />
        <Bar 
          dataKey="tables" 
          name="Tables" 
          fill={theme.palette.primary.main} 
          barSize={30}
          radius={[2, 2, 0, 0]}
        />
        <Bar 
          dataKey="dags" 
          name="DAGs" 
          fill={theme.palette.success.main} 
          barSize={30}
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TeamComparisonChart;
