import React from 'react';
import { Box, Typography, Chip, Paper } from '@mui/material';
import { CheckCircle, Schedule, Cancel, AccessTime } from '@mui/icons-material';
import { format, subDays, parseISO } from 'date-fns';

interface SlaStatusData {
  date: string;
  sla_status: 'passed' | 'failed' | 'pending';
  expected_finish_time?: string;
  actual_finish_time?: string;
}

interface SlaStatusChartProps {
  data: SlaStatusData[];
  days?: number;
}

// Color mapping for SLA status
const STATUS_COLORS = {
  passed: '#4caf50', // Green
  failed: '#f44336', // Red
  pending: '#ff9800', // Amber/Orange
};

const STATUS_BG_COLORS = {
  passed: '#e8f5e9', // Light green
  failed: '#ffebee', // Light red
  pending: '#fff3e0', // Light amber
};

// Generate demo data if no data provided
const generateDemoSlaStatusData = (days = 30): SlaStatusData[] => {
  const data: SlaStatusData[] = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    
    // Generate random but realistic SLA status distribution
    const random = Math.random();
    let sla_status: 'passed' | 'failed' | 'pending';
    
    if (random < 0.75) {
      sla_status = 'passed'; // 75% passed
    } else if (random < 0.90) {
      sla_status = 'pending'; // 15% pending
    } else {
      sla_status = 'failed'; // 10% failed
    }
    
    // Generate realistic times
    const baseHour = 2 + Math.floor(Math.random() * 4); // 2-6 AM
    const expectedTime = new Date(date);
    expectedTime.setHours(baseHour, 0, 0, 0);
    
    let actualTime;
    if (sla_status === 'passed') {
      // Passed: actual is before or at expected
      actualTime = new Date(expectedTime);
      actualTime.setMinutes(actualTime.getMinutes() - Math.floor(Math.random() * 30));
    } else if (sla_status === 'failed') {
      // Failed: actual is after expected
      actualTime = new Date(expectedTime);
      actualTime.setMinutes(actualTime.getMinutes() + 30 + Math.floor(Math.random() * 60));
    } else {
      // Pending: no actual time yet
      actualTime = null;
    }
    
    data.push({
      date: format(date, 'yyyy-MM-dd'),
      sla_status,
      expected_finish_time: expectedTime.toISOString(),
      actual_finish_time: actualTime ? actualTime.toISOString() : undefined,
    });
  }
  
  return data;
};

const StatusIcon = ({ status }: { status: 'passed' | 'failed' | 'pending' }) => {
  const iconProps = { sx: { fontSize: 20 } };
  
  if (status === 'passed') {
    return <CheckCircle {...iconProps} sx={{ ...iconProps.sx, color: STATUS_COLORS.passed }} />;
  } else if (status === 'failed') {
    return <Cancel {...iconProps} sx={{ ...iconProps.sx, color: STATUS_COLORS.failed }} />;
  } else {
    return <Schedule {...iconProps} sx={{ ...iconProps.sx, color: STATUS_COLORS.pending }} />;
  }
};

const SlaStatusChart: React.FC<SlaStatusChartProps> = ({ data, days = 30 }) => {
  // Use provided data or generate demo data
  const chartData = data && data.length > 0 ? data : generateDemoSlaStatusData(days);
  
  // Sort by date (most recent first for timeline view)
  const sortedData = [...chartData].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  // Calculate summary stats
  const stats = sortedData.reduce((acc, item) => {
    acc[item.sla_status]++;
    return acc;
  }, { passed: 0, failed: 0, pending: 0 });
  
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
    <Box sx={{ width: '100%' }}>
      {/* Summary Stats */}
      <Box display="flex" justifyContent="center" gap={3} mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Box sx={{ 
            width: 12, 
            height: 12, 
            bgcolor: STATUS_COLORS.passed, 
            borderRadius: '50%' 
          }} />
          <Typography variant="body2" color="text.secondary">
            Passed: <strong>{stats.passed}</strong>
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box sx={{ 
            width: 12, 
            height: 12, 
            bgcolor: STATUS_COLORS.pending, 
            borderRadius: '50%' 
          }} />
          <Typography variant="body2" color="text.secondary">
            Pending: <strong>{stats.pending}</strong>
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box sx={{ 
            width: 12, 
            height: 12, 
            bgcolor: STATUS_COLORS.failed, 
            borderRadius: '50%' 
          }} />
          <Typography variant="body2" color="text.secondary">
            Failed: <strong>{stats.failed}</strong>
          </Typography>
        </Box>
      </Box>
      
      {/* Timeline View */}
      <Box 
        sx={{ 
          maxHeight: 400, 
          overflowY: 'auto',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        {sortedData.map((item, index) => {
          const itemDate = parseISO(item.date);
          const expectedTime = item.expected_finish_time ? parseISO(item.expected_finish_time) : null;
          const actualTime = item.actual_finish_time ? parseISO(item.actual_finish_time) : null;
          
          return (
            <Box
              key={item.date}
              sx={{
                display: 'flex',
                alignItems: 'center',
                p: 1.5,
                gap: 2,
                borderBottom: index < sortedData.length - 1 ? 1 : 0,
                borderColor: 'divider',
                bgcolor: index % 2 === 0 ? 'background.paper' : 'action.hover',
                '&:hover': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              {/* Date */}
              <Box sx={{ minWidth: 90 }}>
                <Typography variant="body2" fontWeight={500}>
                  {format(itemDate, 'MMM d')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {format(itemDate, 'yyyy')}
                </Typography>
              </Box>
              
              {/* Status Badge */}
              <Box sx={{ minWidth: 100 }}>
                <Chip
                  icon={<StatusIcon status={item.sla_status} />}
                  label={item.sla_status.toUpperCase()}
                  size="small"
                  sx={{
                    bgcolor: STATUS_BG_COLORS[item.sla_status],
                    color: STATUS_COLORS[item.sla_status],
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    borderRadius: 1,
                  }}
                />
              </Box>
              
              {/* Expected Time */}
              <Box sx={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Expected
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {expectedTime ? format(expectedTime, 'h:mm a') : 'N/A'}
                  </Typography>
                </Box>
              </Box>
              
              {/* Actual Time */}
              <Box sx={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Actual
                  </Typography>
                  <Typography 
                    variant="body2" 
                    fontWeight={500}
                    sx={{
                      color: item.sla_status === 'pending' 
                        ? 'text.disabled' 
                        : item.sla_status === 'passed'
                        ? STATUS_COLORS.passed
                        : STATUS_COLORS.failed
                    }}
                  >
                    {actualTime ? format(actualTime, 'h:mm a') : 'Pending'}
                  </Typography>
                </Box>
              </Box>
              
              {/* Time Difference Indicator */}
              {actualTime && expectedTime && (
                <Box sx={{ ml: 'auto' }}>
                  {item.sla_status === 'passed' ? (
                    <Chip
                      label="On Time"
                      size="small"
                      sx={{
                        bgcolor: STATUS_BG_COLORS.passed,
                        color: STATUS_COLORS.passed,
                        fontSize: '0.7rem',
                        height: 20,
                      }}
                    />
                  ) : item.sla_status === 'failed' ? (
                    <Chip
                      label="Late"
                      size="small"
                      sx={{
                        bgcolor: STATUS_BG_COLORS.failed,
                        color: STATUS_COLORS.failed,
                        fontSize: '0.7rem',
                        height: 20,
                      }}
                    />
                  ) : null}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default SlaStatusChart;
