import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, useTheme } from '@mui/material';
import { useLocation } from 'wouter';
import { useAppDispatch } from '@/lib/store';
import { fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { Team } from '@/features/sla/types';
import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '@/features/sla/api';
import { fetchWithCache, getFromCache } from '@/lib/cacheUtils';

const Navigation = () => {
  const theme = useTheme();
  const [location, setLocation] = useLocation();
  const dispatch = useAppDispatch();
  const [value, setValue] = useState(0);
  const [cachedTeams, setCachedTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Fetch teams data from API for Redux state
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    staleTime: 300000, // 5 minutes
  });

  // Load cached team names for tabs
  useEffect(() => {
    loadTeamCache();
    
    // Also dispatch the normal team fetch for Redux state
    dispatch(fetchTeams());
  }, [dispatch]);
  
  // Function to load teams from cache or fetch if needed
  const loadTeamCache = async () => {
    setLoading(true);
    try {
      // First try to get from cache without API call
      const cachedValues = getFromCache('teams');
      setCachedTeams(cachedValues);
      
      // Then fetch in background to refresh the cache if needed
      const freshValues = await fetchWithCache('https://api.example.com/teams', 'teams');
      setCachedTeams(freshValues);
    } catch (error) {
      console.error('Error loading team cache:', error);
    } finally {
      setLoading(false);
    }
  };

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
      
      // If we have real team data
      if (teams && teams.length > 0 && teams[teamIndex]) {
        setLocation(`/team/${teams[teamIndex].id}`);
      } else {
        // Otherwise use the cached team name for the tab
        const teamName = cachedTeams[teamIndex];
        if (teamName) {
          // For cached teams without real data yet, we'll use the index as a temporary ID
          setLocation(`/team/${teamIndex + 1}`);
        }
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
          
          {/* First show real team data if available */}
          {teams.length > 0 ? (
            teams.map((team: Team) => (
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
            ))
          ) : (
            /* Otherwise use cached team names */
            cachedTeams.map((teamName, index) => (
              <Tab
                key={`cache-${index}`}
                label={teamName}
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
            ))
          )}
        </Tabs>
      </Box>
    </Box>
  );
};

export default Navigation;
