import { Card, CardContent, Typography, Box, LinearProgress, Tooltip, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import { TrendingUp, TrendingDown, TrendingFlat, Info } from '@mui/icons-material';

interface MetricCardProps {
  title: string;
  value: number | string;
  trend?: number;
  progress?: number;
  icon?: React.ReactNode;
  suffix?: string;
  subtitle?: string;
  loading?: boolean;
  infoTooltip?: string;
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

const MetricCard = ({
  title,
  value,
  trend = 0,
  progress,
  icon,
  suffix = '',
  subtitle,
  loading = false,
  infoTooltip,
}: MetricCardProps) => {
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
          <Box display="flex" alignItems="center" gap={0.5}>
            <Typography color="text.secondary" fontWeight={500} variant="body2">
              {title}
            </Typography>
            {infoTooltip && (
              <Tooltip title={infoTooltip} arrow placement="top">
                <IconButton size="small" sx={{ p: 0.5 }}>
                  <Info fontSize="small" color="primary" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          {icon}
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

export default MetricCard;
