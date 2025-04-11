import { useState, memo, useCallback } from 'react';
import { Card, CardContent, Typography, Box, ToggleButton, ToggleButtonGroup, IconButton, Tooltip } from '@mui/material';
import { FileDownload, Print } from '@mui/icons-material';

interface ChartCardProps {
  title: string;
  chart: React.ReactNode;
  filters?: string[];
  onFilterChange?: (filter: string) => void;
  actions?: boolean;
  loading?: boolean;
  height?: number | string;
}

// Use function declaration for better debugging in React DevTools
function ChartCardComponent({
  title,
  chart,
  filters,
  onFilterChange,
  actions = false,
  loading = false,
  height = 300,
}: ChartCardProps) {
  const [filter, setFilter] = useState<string>(filters && filters.length > 0 ? filters[0] : 'All');

  const handleFilterChange = (event: React.MouseEvent<HTMLElement>, newFilter: string) => {
    if (newFilter !== null) {
      setFilter(newFilter);
      if (onFilterChange) {
        onFilterChange(newFilter);
      }
    }
  };

  return (
    <Card elevation={0} sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={500} fontFamily="Inter, sans-serif">
            {title}
          </Typography>
          
          <Box display="flex" alignItems="center">
            {filters && filters.length > 0 && (
              <ToggleButtonGroup
                value={filter}
                exclusive
                onChange={handleFilterChange}
                size="small"
                sx={{ mr: actions ? 2 : 0 }}
              >
                {filters.map((option) => (
                  <ToggleButton 
                    key={option} 
                    value={option}
                    sx={{ 
                      px: 2, 
                      py: 0.5, 
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '0.8125rem',
                      '&.Mui-selected': {
                        backgroundColor: 'primary.main',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'primary.dark',
                          color: 'white',
                        }
                      }
                    }}
                  >
                    {option}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
            
            {actions && (
              <Box>
                <Tooltip title="Download CSV">
                  <IconButton size="small" color="inherit" sx={{ color: 'text.secondary' }}>
                    <FileDownload fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Print">
                  <IconButton size="small" color="inherit" sx={{ color: 'text.secondary' }}>
                    <Print fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        </Box>
        
        <Box sx={{ height, width: '100%', position: 'relative' }}>
          {loading ? (
            <Box 
              sx={{ 
                height: '100%',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1,
              }}
            >
              <Box 
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '3px solid rgba(0, 0, 0, 0.1)',
                  borderTopColor: 'primary.main',
                  animation: 'spin 1s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }}
              />
            </Box>
          ) : null}
          
          {chart}
        </Box>
      </CardContent>
    </Card>
  );
};

// Memoize the component to prevent unnecessary re-renders
const ChartCard = memo<ChartCardProps>(ChartCardComponent, (prevProps, nextProps) => {
  // Always memoize based on specific prop equality
  const basicPropsEqual = 
    prevProps.title === nextProps.title &&
    prevProps.height === nextProps.height &&
    prevProps.actions === nextProps.actions &&
    prevProps.loading === nextProps.loading;
  
  // Efficient array comparison for filters
  const filtersEqual = 
    (!prevProps.filters && !nextProps.filters) ||
    (prevProps.filters?.length === nextProps.filters?.length &&
     prevProps.filters?.every((f, i) => f === nextProps.filters?.[i]));
  
  // The chart prop is a React node which may change reference on each render
  // We'll let parent components control when this should re-render
  
  // Explicit return with boolean to satisfy TypeScript
  return Boolean(basicPropsEqual && filtersEqual);
});

// Better debugging in React DevTools
ChartCard.displayName = 'ChartCard';

export default ChartCard;
