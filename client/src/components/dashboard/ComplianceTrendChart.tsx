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

// Demo data - in a real app, this would come from an API
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
}

const ComplianceTrendChart = ({
  data = generateDemoData(),
  filter = 'all',
}: ComplianceTrendChartProps) => {
  const theme = useTheme();
  
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
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
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
  );
};

export default ComplianceTrendChart;
