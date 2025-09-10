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
import { format, subDays, parseISO, differenceInDays, startOfMonth } from 'date-fns';
import { Entity } from '@shared/schema';

// Helper function to determine if date range exceeds 40 days
const shouldUseMonthlyAggregation = (data: any[]): boolean => {
  if (!data || data.length <= 1) return false;
  
  // Parse first and last dates
  const firstDate = parseISO(data[0].date);
  const lastDate = parseISO(data[data.length - 1].date);
  
  // Calculate difference in days
  const daysDifference = differenceInDays(lastDate, firstDate);
  
  return daysDifference > 40;
};

// Helper function to aggregate daily entity data to monthly averages
const aggregateToMonthlyEntities = (dailyData: any[]): any[] => {
  if (!dailyData || dailyData.length === 0) return [];
  
  const monthlyMap = new Map<string, {
    values: number[];
    entityName: string;
    entityId: number;
    count: number;
    monthKey: string;
    firstDate: Date;
  }>();
  
  // Group data by month and entity
  dailyData.forEach(item => {
    const date = parseISO(item.date);
    const monthStart = startOfMonth(date);
    const monthKey = format(monthStart, 'yyyy-MM');
    const mapKey = `${monthKey}-${item.id}`;
    
    if (!monthlyMap.has(mapKey)) {
      monthlyMap.set(mapKey, {
        values: [],
        entityName: item.name,
        entityId: item.id,
        count: 0,
        monthKey,
        firstDate: monthStart
      });
    }
    
    const monthData = monthlyMap.get(mapKey)!;
    monthData.values.push(item.value || 0);
    monthData.count++;
  });
  
  // Calculate monthly averages
  const monthlyData = Array.from(monthlyMap.values())
    .sort((a, b) => a.firstDate.getTime() - b.firstDate.getTime() || a.entityName.localeCompare(b.entityName))
    .map(monthInfo => {
      const avgValue = monthInfo.values.length > 0 
        ? monthInfo.values.reduce((sum, val) => sum + val, 0) / monthInfo.values.length 
        : 0;
      
      return {
        date: format(monthInfo.firstDate, 'yyyy-MM-dd'),
        dateFormatted: format(monthInfo.firstDate, 'MMM yyyy'),
        value: parseFloat(avgValue.toFixed(1)),
        name: monthInfo.entityName,
        id: monthInfo.entityId,
        isMonthly: true
      };
    });
  
  return monthlyData;
};

// Generate demo data for entity performance
const generateEntityPerformanceData = (entity: Entity, days = 30, startDate?: Date, endDate?: Date) => {
  const data = [];
  let actualDays = days;
  
  // Calculate days from date range if provided
  if (startDate && endDate) {
    actualDays = differenceInDays(endDate, startDate) + 1;
  }
  
  const now = endDate || new Date();
  const seed = entity.id * 1000; // Use entity ID for consistent but varied random data
  
  for (let i = actualDays - 1; i >= 0; i--) {
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
      id: entity.id,
      isMonthly: false,
    });
  }
  
  return data;
};

interface EntityPerformanceChartProps {
  entities: Entity[];
  days?: number;
  filter?: 'all' | 'tables' | 'dags';
  dateRange?: {
    startDate: Date;
    endDate: Date;
    label: string;
  };
}

const EntityPerformanceChart = ({ entities, days = 30, filter = 'all', dateRange }: EntityPerformanceChartProps) => {
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
    generateEntityPerformanceData(entity, days, dateRange?.startDate, dateRange?.endDate)
  );
  
  // Determine if we should use monthly aggregation
  const useMonthlyAggregation = shouldUseMonthlyAggregation(allData);
  
  // Aggregate to monthly if date range > 40 days
  let processedData = allData;
  if (useMonthlyAggregation) {
    processedData = aggregateToMonthlyEntities(allData);
  }
  
  // Group data by date
  const groupedData: Record<string, any> = {};
  processedData.forEach(item => {
    if (!groupedData[item.date]) {
      groupedData[item.date] = {
        date: item.date,
        dateFormatted: item.dateFormatted,
        isMonthly: item.isMonthly || false
      };
    }
    groupedData[item.date][item.id.toString()] = item.value;
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
            {payload[0]?.payload.isMonthly && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (Monthly Average)
              </Typography>
            )}
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
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
              dataKey={(item) => filteredEntities[0]?.slaTarget || 95}
              stroke={theme.palette.error.main}
              strokeDasharray="5 5"
              strokeWidth={1}
              dot={false}
              activeDot={false}
              name="Target"
            />
            
            {/* Entity lines */}
            {filteredEntities.map((entity, index) => (
              <Line
                key={entity.id}
                type="monotone"
                dataKey={entity.id.toString()}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                name={entity.name}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Box>
      
      {/* Legend */}
      <Box sx={{ 
        p: 2, 
        borderTop: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        {/* Target line legend */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box 
            sx={{ 
              width: 20, 
              height: 2, 
              backgroundColor: theme.palette.error.main,
              borderStyle: 'dashed',
              borderWidth: '1px 0',
              borderColor: theme.palette.error.main,
            }} 
          />
          <Typography variant="body2" color="text.secondary">
            Target
          </Typography>
        </Box>
        
        {/* Entity legends */}
        {filteredEntities.map((entity, index) => (
          <Box key={entity.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box 
              sx={{ 
                width: 20, 
                height: 2, 
                backgroundColor: colors[index % colors.length],
              }} 
            />
            <Typography variant="body2" color="text.secondary">
              {entity.name}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default EntityPerformanceChart;
