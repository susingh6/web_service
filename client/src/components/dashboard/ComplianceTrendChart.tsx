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
import { format } from 'date-fns';

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
}

const ComplianceTrendChart = ({
  data,
  filter = 'all',
  entities = [],
  selectedTenant
}: ComplianceTrendChartProps) => {
  const theme = useTheme();
  
  // Use provided data (from cache) or generate from entities as fallback
  const chartData = data || [];
  
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
            name="Overall"
          />
          <Line 
            type="monotone" 
            dataKey="tables" 
            stroke={theme.palette.success.main} 
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            name="Tables"
          />
          <Line 
            type="monotone" 
            dataKey="dags" 
            stroke={theme.palette.warning.main} 
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
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
              domain={[0, 100]} 
              ticks={[0, 20, 40, 60, 80, 100]}
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
