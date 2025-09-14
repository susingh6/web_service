import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  TooltipProps 
} from 'recharts';
import { format, parseISO, differenceInDays, startOfMonth, isSameMonth, addMonths } from 'date-fns';

// Generate compliance data from real entities
const generateDataFromEntities = (entities: any[]) => {
  const data = [];
  const now = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Calculate compliance based on entities
    const tables = entities.filter(e => e.type === 'table');
    const dags = entities.filter(e => e.type === 'dag');
    
    // Calculate compliance percentages from entity statuses
    const tablesCompliance = tables.length > 0 
      ? (tables.filter(t => t.sla_status === 'compliant').length / tables.length) * 100
      : 0;
    
    const dagsCompliance = dags.length > 0
      ? (dags.filter(d => d.sla_status === 'compliant').length / dags.length) * 100
      : 0;
    
    const overallCompliance = entities.length > 0
      ? (entities.filter(e => e.sla_status === 'compliant').length / entities.length) * 100
      : 0;
    
    data.push({
      date: format(date, 'yyyy-MM-dd'),
      dateFormatted: format(date, 'MMM d'),
      overall: parseFloat(overallCompliance.toFixed(1)),
      tables: parseFloat(tablesCompliance.toFixed(1)),
      dags: parseFloat(dagsCompliance.toFixed(1)),
    });
  }
  
  return data;
};

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

// Helper function to aggregate daily data to monthly snapshots (last available day per month)
// Also ensures months with no data appear on the X-axis with null Y values, keeping the chart continuous.
const aggregateToMonthly = (dailyData: any[]): any[] => {
  if (!dailyData || dailyData.length === 0) return [];

  // Sort by date ascending to make "last in month" selection easy
  const sorted = [...dailyData].sort((a, b) => a.date.localeCompare(b.date));

  // Build a map of monthKey -> last item in that month
  const monthToLastItem = new Map<string, any>();
  for (const item of sorted) {
    const d = parseISO(item.date);
    const monthKey = format(startOfMonth(d), 'yyyy-MM');
    const prev = monthToLastItem.get(monthKey);
    if (!prev || item.date > prev.date) {
      monthToLastItem.set(monthKey, item);
    }
  }

  // Build a contiguous month list from first to last month
  const firstDate = startOfMonth(parseISO(sorted[0].date));
  const lastDate = startOfMonth(parseISO(sorted[sorted.length - 1].date));

  const out: any[] = [];
  for (let m = firstDate; m <= lastDate; m = addMonths(m, 1)) {
    const key = format(m, 'yyyy-MM');
    const lastInMonth = monthToLastItem.get(key);
    if (lastInMonth) {
      out.push({
        date: format(m, 'yyyy-MM-dd'),
        dateFormatted: format(m, 'MMM yyyy'),
        overall: lastInMonth.overall ?? null,
        tables: lastInMonth.tables ?? null,
        dags: lastInMonth.dags ?? null,
        isMonthly: true,
      });
    } else {
      // month without data: show X-axis label with null Y values
      out.push({
        date: format(m, 'yyyy-MM-dd'),
        dateFormatted: format(m, 'MMM yyyy'),
        overall: null,
        tables: null,
        dags: null,
        isMonthly: true,
      });
    }
  }

  return out;
};

// Demo data - only used as fallback when no entities are available
const generateDemoData = () => {
  const data = [];
  const now = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Generate somewhat realistic data with random fluctuations
    const baseOverall = 94 + Math.random() * 2;
    const baseTables = 96 + Math.random() * 2;
    const baseDags = 88 + Math.random() * 3;
    
    data.push({
      date: format(date, 'yyyy-MM-dd'),
      dateFormatted: format(date, 'MMM d'),
      overall: parseFloat(baseOverall.toFixed(1)),
      tables: parseFloat(baseTables.toFixed(1)),
      dags: parseFloat(baseDags.toFixed(1)),
    });
  }
  
  return data;
};

interface ComplianceTrendChartProps {
  data?: any[];
  startDate?: Date;
  endDate?: Date;
  filter?: 'all' | 'tables' | 'dags';
  entities?: any[];
  selectedTenant?: string;
  loading?: boolean;
}

const ComplianceTrendChart = ({
  data,
  filter = 'all',
  entities = [],
  selectedTenant,
  loading = false
}: ComplianceTrendChartProps) => {
  const theme = useTheme();
  
  // Show loading state
  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Loading compliance trends...
        </Typography>
      </Box>
    );
  }

  // Use provided data (from cache) or generate from entities as fallback
  let chartData = data || [];
  
  // Determine if we should use monthly aggregation
  const useMonthlyAggregation = shouldUseMonthlyAggregation(chartData);
  
  // Aggregate to monthly if date range > 40 days
  if (useMonthlyAggregation) {
    chartData = aggregateToMonthly(chartData);
  }

  // Calculate dynamic Y-axis domain for better visualization of variations
  const calculateYAxisDomain = (data: any[]) => {
    if (!data || data.length === 0) return [0, 100];
    
    const allValues = data.flatMap(d => [d.overall, d.tables, d.dags]).filter(v => v != null);
    if (allValues.length === 0) return [0, 100];
    
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const range = maxValue - minValue;
    
    // If all values are very high (>90%) and have small variations (<10% range)
    // zoom in to better show the variations
    if (minValue > 90 && range < 10) {
      const padding = Math.max(1, range * 0.2); // 20% padding or minimum 1%
      return [Math.max(0, Math.floor(minValue - padding)), Math.min(100, Math.ceil(maxValue + padding))];
    }
    
    // For normal cases, use full 0-100 range
    return [0, 100];
  };

  const yAxisDomain = calculateYAxisDomain(chartData);
  
  // Show empty state if no data
  if (!chartData || chartData.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No compliance trend data available for selected date range
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
            {payload[0]?.payload.dateFormatted}
            {payload[0]?.payload.isMonthly && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (Monthly Average)
              </Typography>
            )}
          </Typography>
          
          {payload.map((entry) => (
            <Box key={entry.name} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
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
  
  // Filter lines based on the selected filter
  const renderLines = () => {
    if (filter === 'all' || filter === undefined) {
      return (
        <>
          <Line 
            type="monotone" 
            dataKey="overall" 
            stroke={theme.palette.primary.main} 
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            connectNulls
            name="Overall"
          />
          <Line 
            type="monotone" 
            dataKey="tables" 
            stroke={theme.palette.success.main} 
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            connectNulls
            name="Tables"
          />
          <Line 
            type="monotone" 
            dataKey="dags" 
            stroke={theme.palette.warning.main} 
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            connectNulls
            name="DAGs"
          />
        </>
      );
    } else if (filter === 'tables') {
      return (
        <Line 
          type="monotone" 
          dataKey="tables" 
          stroke={theme.palette.success.main} 
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
          connectNulls
          name="Tables"
        />
      );
    } else {
      return (
        <Line 
          type="monotone" 
          dataKey="dags" 
          stroke={theme.palette.warning.main} 
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
          connectNulls
          name="DAGs"
        />
      );
    }
  };
  
  // Typography is now imported at the top of the file
  
  return (
    <>
      {chartData.length > 0 ? (
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
              domain={yAxisDomain} 
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
            {renderLines()}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <Box 
          display="flex" 
          flexDirection="column"
          alignItems="center" 
          justifyContent="center" 
          height="100%"
          minHeight={300}
          sx={{ 
            color: 'text.secondary',
            fontSize: '14px',
            backgroundColor: 'background.paper',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No compliance data available
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {selectedTenant ? `No entities found for "${selectedTenant}" tenant` : 'No entities found'}
          </Typography>
        </Box>
      )}
    </>
  );
};

export default ComplianceTrendChart;
