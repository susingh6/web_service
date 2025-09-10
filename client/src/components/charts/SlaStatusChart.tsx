import React from 'react';
import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
  Cell,
} from 'recharts';
import { format, subDays } from 'date-fns';

interface SlaStatusData {
  date: string;
  status: 'passed' | 'failed' | 'pending';
  count?: number;
}

interface SlaStatusChartProps {
  data: SlaStatusData[];
  days?: number;
}

// Color mapping for SLA status
const STATUS_COLORS = {
  passed: '#4caf50', // Green
  failed: '#f44336', // Red
  pending: '#ff9800', // Orange
};

// Generate demo data if no data provided
const generateDemoSlaStatusData = (days = 30): SlaStatusData[] => {
  const data: SlaStatusData[] = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    
    // Generate random but realistic SLA status distribution
    const random = Math.random();
    let status: 'passed' | 'failed' | 'pending';
    
    if (random < 0.75) {
      status = 'passed'; // 75% passed
    } else if (random < 0.90) {
      status = 'pending'; // 15% pending
    } else {
      status = 'failed'; // 10% failed
    }
    
    data.push({
      date: format(date, 'yyyy-MM-dd'),
      status,
      count: 1,
    });
  }
  
  return data;
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload;
    return (
      <Box
        sx={{
          bgcolor: 'background.paper',
          p: 2,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          boxShadow: 2,
        }}
      >
        <Typography variant="body2" fontWeight={600}>
          {format(new Date(label), 'MMM d, yyyy')}
        </Typography>
        <Typography 
          variant="body2" 
          sx={{ 
            color: STATUS_COLORS[data?.status as keyof typeof STATUS_COLORS] || '#666',
            textTransform: 'capitalize',
          }}
        >
          Status: {data?.status}
        </Typography>
      </Box>
    );
  }
  return null;
};

const SlaStatusChart: React.FC<SlaStatusChartProps> = ({ data, days = 30 }) => {
  const theme = useTheme();
  
  // Use provided data or generate demo data
  const chartData = data && data.length > 0 ? data : generateDemoSlaStatusData(days);
  
  // Transform data for chart - group by date and create stacked format
  const processedData = chartData.reduce((acc, item) => {
    const existingDay = acc.find(d => d.date === item.date);
    
    if (existingDay) {
      existingDay[item.status] = (existingDay[item.status] || 0) + (item.count || 1);
    } else {
      acc.push({
        date: item.date,
        dateFormatted: format(new Date(item.date), 'MMM d'),
        passed: item.status === 'passed' ? (item.count || 1) : 0,
        failed: item.status === 'failed' ? (item.count || 1) : 0,
        pending: item.status === 'pending' ? (item.count || 1) : 0,
      });
    }
    
    return acc;
  }, [] as any[]);
  
  // Sort by date
  processedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  if (!chartData || chartData.length === 0) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100%">
        <Typography variant="body1" color="text.secondary">
          No SLA status data available
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={processedData}
          margin={{
            top: 10,
            right: 10,
            left: 10,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis
            dataKey="dateFormatted"
            axisLine={false}
            tickLine={false}
            tick={{
              fontSize: 12,
              fill: theme.palette.text.secondary,
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{
              fontSize: 12,
              fill: theme.palette.text.secondary,
            }}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Stacked bars for each status */}
          <Bar dataKey="passed" stackId="status" fill={STATUS_COLORS.passed} />
          <Bar dataKey="pending" stackId="status" fill={STATUS_COLORS.pending} />
          <Bar dataKey="failed" stackId="status" fill={STATUS_COLORS.failed} />
        </BarChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <Box display="flex" justifyContent="center" gap={3} mt={1}>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box sx={{ width: 12, height: 12, bgcolor: STATUS_COLORS.passed, borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            Passed
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box sx={{ width: 12, height: 12, bgcolor: STATUS_COLORS.pending, borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            Pending
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box sx={{ width: 12, height: 12, bgcolor: STATUS_COLORS.failed, borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            Failed
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default SlaStatusChart;