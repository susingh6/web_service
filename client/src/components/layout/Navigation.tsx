import { useState, useEffect, useCallback } from 'react';
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
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  
  // Fetch teams data lazily - only when needed by user interaction
  const { data: teams = [], refetch: refetchTeams } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
    staleTime: 300000, // 5 minutes
    enabled: false, // Don't fetch on component mount
  });

  // Function to load teams from cache or fetch if needed
  const loadTeamCache = async () => {
    setLoading(true);
    try {
      // First try to get from cache without API call
      const cachedValues = getFromCache('teams');
      setCachedTeams(cachedValues);
      
      // Skip background fetch for now since we don't have real endpoints configured
      // TODO: Replace with real API endpoint when backend is fully configured
    } catch (error) {
      console.error('Error loading team cache:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Memoize the loadTeamsData function to prevent dependency issues
  const memoizedLoadTeamsData = useCallback(() => {
    if (!teamsLoaded) {
      dispatch(fetchTeams());
      refetchTeams();
      setTeamsLoaded(true);
    }
  }, [dispatch, refetchTeams, teamsLoaded]);
  
  // Load cached team names for tabs to display the navigation
  useEffect(() => {
    loadTeamCache();
    
    // Initialize - only fetch teams data if we're not on the summary page
    if (location !== '/' && location.startsWith('/team/')) {
      memoizedLoadTeamsData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, location]);

  // Update selected tab based on location
  useEffect(() => {
    if (location === '/') {
      setValue(0); // Summary tab
    } else if (location.startsWith('/team/')) {
      // If we're navigating to a team page, ensure team data is loaded
      if (!teamsLoaded) {
        memoizedLoadTeamsData();
      }
      
      const teamId = parseInt(location.split('/')[2]);
      const teamIndex = teams.findIndex((team) => team.id === teamId);
      if (teamIndex !== -1) {
        setValue(teamIndex + 1); // +1 because Summary is at index 0
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, teams, teamsLoaded]);
  
  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    
    if (newValue === 0) {
      // Going to summary tab - no need to fetch team data
      setLocation('/');
    } else {
      // Going to a team tab - ensure team data is loaded
      if (!teamsLoaded) {
        memoizedLoadTeamsData();
      }
      
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
      <Box sx={{ 
        width: '100%', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        px: 2
      }}>
        <Box sx={{ flex: 1, maxWidth: 'calc(100% - 150px)', overflow: 'auto' }}>
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
              teams.map((team) => (
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
        
        {/* No entity type buttons on the right anymore */}
      </Box>
    </Box>
  );
};

export default Navigation;