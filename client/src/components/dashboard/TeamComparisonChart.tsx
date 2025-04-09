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

// Demo data - in a real app, this would come from an API
const generateDemoData = () => [
  {
    name: 'Data Eng.',
    tables: 94.6,
    dags: 91.8,
  },
  {
    name: 'Marketing',
    tables: 87.2,
    dags: 90.5,
  },
  {
    name: 'Finance',
    tables: 96.7,
    dags: 97.3,
  },
  {
    name: 'Product',
    tables: 82.9,
    dags: 78.4,
  },
];

interface TeamComparisonChartProps {
  data?: any[];
}

const TeamComparisonChart = ({
  data = generateDemoData(),
}: TeamComparisonChartProps) => {
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
                {entry.name === 'tables' ? 'Tables' : 'DAGs'}:
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
        data={data}
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
