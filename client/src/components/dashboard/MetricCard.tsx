import { Card, CardContent, Typography, Box, LinearProgress, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';
import { TrendingUp, TrendingDown, TrendingFlat, Info } from '@mui/icons-material';
import { memo } from 'react';

interface MetricCardProps {
  title: string;
  value: number | string;
  trend?: number;
  progress?: number;
  icon?: React.ReactNode;
  suffix?: string;
  subtitle?: string;
  loading?: boolean;
}

const ProgressBar = styled(LinearProgress)(({ theme, value }) => ({
  height: 8,
  borderRadius: 4,
  backgroundColor: theme.palette.grey[200],
  '& .MuiLinearProgress-bar': {
    borderRadius: 4,
    backgroundColor: 
      value && value >= 95 ? theme.palette.success.main :
      value && value >= 85 ? theme.palette.warning.main :
      theme.palette.error.main,
  },
}));

// Use function declaration for better debugging in React DevTools
function MetricCardComponent({
  title,
  value,
  trend = 0,
  progress,
  icon,
  suffix = '',
  subtitle,
  loading = false,
}: MetricCardProps) {
  // Determine trend icon and color
  const trendIcon = trend > 0 ? (
    <TrendingUp color="success" fontSize="small" />
  ) : trend < 0 ? (
    <TrendingDown color="error" fontSize="small" />
  ) : (
    <TrendingFlat color="warning" fontSize="small" />
  );

  // Format trend value (add + sign for positive values)
  const trendFormatted = trend > 0 
    ? `+${trend.toFixed(1)}%` 
    : trend < 0 
    ? `${trend.toFixed(1)}%` 
    : '0.0%';
  
  // Determine trend color
  const trendColor = trend > 0 
    ? 'success.main' 
    : trend < 0 
    ? 'error.main' 
    : 'warning.main';

  return (
    <Card elevation={0} sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Typography color="text.secondary" fontWeight={500} variant="body2">
            {title}
          </Typography>
          {icon || (
            <Tooltip title="View more details">
              <Info color="primary" fontSize="small" />
            </Tooltip>
          )}
        </Box>
        
        {loading ? (
          <Box>
            <Box sx={{ width: '70%', height: 36, bgcolor: 'grey.100', borderRadius: 1, mb: 1 }} />
            <Box sx={{ width: '50%', height: 20, bgcolor: 'grey.100', borderRadius: 1 }} />
          </Box>
        ) : (
          <>
            <Box display="flex" alignItems="baseline">
              <Typography variant="h4" component="div" fontWeight={600}>
                {typeof value === 'number' && !isNaN(value) 
                  ? value % 1 === 0 
                    ? value 
                    : value.toFixed(1) 
                  : value}
                {suffix}
              </Typography>
              
              {trend !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                  {trendIcon}
                  <Typography variant="body2" fontWeight={500} color={trendColor} sx={{ ml: 0.5 }}>
                    {trendFormatted}
                  </Typography>
                </Box>
              )}
            </Box>
            
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </>
        )}
        
        {progress !== undefined && (
          <Box sx={{ mt: 2 }}>
            <ProgressBar 
              variant="determinate" 
              value={progress} 
              sx={{ 
                mt: 1,
                borderRadius: 1,
              }} 
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

// Memoize the component to prevent unnecessary re-renders
// Only re-render if props change
const MetricCard = memo<MetricCardProps>(MetricCardComponent, (prevProps, nextProps) => {
  // Custom comparison function to determine if the component should re-render
  // Return true if props are equal (no re-render needed)
  // Return false if props changed (re-render needed)
  return (
    prevProps.title === nextProps.title &&
    prevProps.value === nextProps.value &&
    prevProps.trend === nextProps.trend &&
    prevProps.progress === nextProps.progress &&
    prevProps.loading === nextProps.loading &&
    prevProps.suffix === nextProps.suffix
  );
});

// For better debugging in React DevTools
MetricCard.displayName = 'MetricCard';

export default MetricCard;
