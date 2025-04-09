import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, useTheme } from '@mui/material';
import { useLocation } from 'wouter';
import { useAppDispatch } from '@/lib/store';
import { fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { Team } from '@/features/sla/types';
import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '@/features/sla/api';

const Navigation = () => {
  const theme = useTheme();
  const [location, setLocation] = useLocation();
  const dispatch = useAppDispatch();
  const [value, setValue] = useState(0);
  
  // Fetch teams data
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    staleTime: 300000, // 5 minutes
  });

  useEffect(() => {
    dispatch(fetchTeams());
  }, [dispatch]);

  // Update selected tab based on location
  useEffect(() => {
    if (location === '/') {
      setValue(0); // Summary tab
    } else if (location.startsWith('/team/')) {
      const teamId = parseInt(location.split('/')[2]);
      const teamIndex = teams.findIndex((team: Team) => team.id === teamId);
      if (teamIndex !== -1) {
        setValue(teamIndex + 1); // +1 because Summary is at index 0
      }
    }
  }, [location, teams]);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    
    if (newValue === 0) {
      setLocation('/');
    } else {
      const teamIndex = newValue - 1; // -1 because Summary is at index 0
      if (teams[teamIndex]) {
        setLocation(`/team/${teams[teamIndex].id}`);
      }
    }
  };

  return (
    <Box 
      sx={{ 
        backgroundColor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
      }}
    >
      <Box sx={{ maxWidth: '100%', overflow: 'auto' }}>
        <Tabs 
          value={value} 
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          textColor="primary"
          indicatorColor="primary"
          aria-label="dashboard navigation tabs"
        >
          <Tab 
            label="Summary" 
            sx={{ 
              minWidth: 100,
              fontWeight: 500,
              textTransform: 'none',
              fontSize: '0.9rem',
              '&.Mui-selected': {
                fontWeight: 600,
              },
            }} 
          />
          
          {teams.map((team: Team) => (
            <Tab
              key={team.id}
              label={team.name}
              sx={{ 
                minWidth: 120,
                fontWeight: 500,
                textTransform: 'none',
                fontSize: '0.9rem',
                '&.Mui-selected': {
                  fontWeight: 600,
                },
              }}
            />
          ))}
        </Tabs>
      </Box>
    </Box>
  );
};

export default Navigation;
