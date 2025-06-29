import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { Entity } from '@shared/schema';

// Generate demo data for entity performance
const generateEntityPerformanceData = (entity: Entity, days = 30) => {
  const data = [];
  const now = new Date();
  const seed = entity.id * 1000; // Use entity ID for consistent but varied random data
  
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    
    // Generate somewhat realistic data with some random variation
    // Use sine function for more natural-looking fluctuations
    const angle = i / 5 + seed;
    const variation = Math.sin(angle) * 3;
    
    // Base the SLA on the entity's current SLA with variation
    const baseSla = entity.currentSla || entity.slaTarget;
    const slaValue = Math.min(100, Math.max(80, baseSla + variation));
    
    data.push({
      date: format(date, 'yyyy-MM-dd'),
      dateFormatted: format(date, 'MMM d'),
      value: parseFloat(slaValue.toFixed(1)),
      name: entity.name,
    });
  }
  
  return data;
};

interface EntityPerformanceChartProps {
  entities: Entity[];
  days?: number;
  filter?: 'all' | 'tables' | 'dags';
}

const EntityPerformanceChart = ({ entities, days = 30, filter = 'all' }: EntityPerformanceChartProps) => {
  const theme = useTheme();
  
  if (!entities || entities.length === 0) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100%">
        <Typography variant="body1" color="text.secondary">
          No entity data available
        </Typography>
      </Box>
    );
  }
  
  // Filter entities based on the filter prop
  const filteredEntities = entities.filter(entity => {
    if (filter === 'all') return true;
    if (filter === 'tables') return entity.type === 'table';
    if (filter === 'dags') return entity.type === 'dag';
    return true;
  });

  if (filteredEntities.length === 0) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100%">
        <Typography variant="body1" color="text.secondary">
          No {filter === 'all' ? '' : filter} data available
        </Typography>
      </Box>
    );
  }
  
  // Generate data for each filtered entity
  const allData = filteredEntities.flatMap(entity => 
    generateEntityPerformanceData(entity, days)
  );
  
  // Group data by date
  const groupedData: Record<string, any> = {};
  allData.forEach(item => {
    if (!groupedData[item.date]) {
      groupedData[item.date] = {
        date: item.date,
        dateFormatted: item.dateFormatted,
      };
    }
    groupedData[item.date][item.name] = item.value;
  });
  
  const chartData = Object.values(groupedData);
  
  // Generate colors for entities
  const colors = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.info.main,
  ];
  
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
            {payload[0]?.payload.dateFormatted}
          </Typography>
          
          {payload.map((entry, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <Box 
                sx={{ 
                  width: 10, 
                  height: 10, 
                  backgroundColor: entry.color,
                  borderRadius: '50%',
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
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis 
          dataKey="dateFormatted"
          interval="preserveStartEnd"
          tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
        />
        <YAxis 
          domain={[80, 100]} 
          ticks={[80, 85, 90, 95, 100]}
          tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        
        {/* Target line */}
        <Line
          type="monotone"
          dataKey={(item) => entities[0]?.slaTarget || 95}
          stroke={theme.palette.error.main}
          strokeDasharray="5 5"
          strokeWidth={1}
          dot={false}
          activeDot={false}
          name="Target"
        />
        
        {/* Entity lines */}
        {entities.map((entity, index) => (
          <Line
            key={entity.id}
            type="monotone"
            dataKey={entity.name}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            name={entity.name}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default EntityPerformanceChart;
