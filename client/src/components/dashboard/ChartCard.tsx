import { useState } from 'react';
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

const ChartCard = ({
  title,
  chart,
  filters,
  onFilterChange,
  actions = false,
  loading = false,
  height = 300,
}: ChartCardProps) => {
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

export default ChartCard;
