import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, useTheme } from '@mui/material';
import { useLocation } from 'wouter';
import { useAppDispatch } from '@/lib/store';
import { fetchTeams } from '@/features/sla/slices/entitiesSlice';
import { Team } from '@/features/sla/types';
import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '@/features/sla/api';
import { fetchWithCache, getFromCache, updateCache } from '@/lib/cacheUtils';

const Navigation = () => {
  const theme = useTheme();
  const [location, setLocation] = useLocation();
  const dispatch = useAppDispatch();
  const [value, setValue] = useState(0);
  const [cachedTeams, setCachedTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Fetch teams data from API for Redux state
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
    staleTime: 300000, // 5 minutes
  });

  // Load cached team names for tabs
  useEffect(() => {
    loadTeamCache();
    
    // Also dispatch the normal team fetch for Redux state
    dispatch(fetchTeams());
    
    // Set up event listeners to detect cache changes from other components
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'teams' && event.newValue) {
        try {
          // Update the cached teams when the cache is modified elsewhere
          const updatedTeams = JSON.parse(event.newValue);
          setCachedTeams(updatedTeams);
          console.log('Navigation detected team cache update from localStorage:', updatedTeams);
        } catch (error) {
          console.error('Error parsing updated team cache:', error);
        }
      }
    };
    
    // This handler is for our custom updateCache event
    const handleCustomStorageEvent = (event: StorageEvent) => {
      if (event.key === 'teams' && event.newValue) {
        try {
          // Update the cached teams when our custom updateCache function is used
          const updatedTeams = JSON.parse(event.newValue);
          setCachedTeams(updatedTeams);
          console.log('Navigation detected team cache update from custom event:', updatedTeams);
          
          // Also update our data
          loadTeamCache();
        } catch (error) {
          console.error('Error parsing updated team cache from custom event:', error);
        }
      }
    };
    
    // Add event listeners for both storage changes and our custom events
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('storage', handleCustomStorageEvent);
    
    // Clean up the event listeners on component unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('storage', handleCustomStorageEvent);
    };
  }, [dispatch]);
  
  // Function to load teams from cache or fetch if needed
  const loadTeamCache = async () => {
    setLoading(true);
    try {
      // First try to get from cache without API call
      const cachedValues = getFromCache('teams');
      setCachedTeams(cachedValues);
      
      // Then fetch in background to refresh the cache if needed
      // Rather than just using fetchWithCache, we'll fetch data and 
      // explicitly update the cache with our updateCache function
      // to make sure other components get notified
      try {
        // Simulating a real API call for demo purposes
        console.log('Fetching team data from API...');
        
        // In a real app, this would be an actual API call:
        // const response = await fetch('https://api.example.com/teams');
        // const data = await response.json();
        // const teamNames = data.map(team => team.name);
        
        // Simulate a network delay
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // For our demo, just use some predefined values
        // In a real app, these would come from the API
        const teamNames = ['PGM', 'Core', 'Viewer Product', 'IOT', 'CDM'];
        
        // Update the cache and notify all components
        updateCache('teams', teamNames);
        setCachedTeams(teamNames);
      } catch (error) {
        console.error('Error fetching teams from API:', error);
      }
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
      const teamIndex = teams.findIndex((team) => team.id === teamId);
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
      <Box sx={{ maxWidth: '100%', overflow: 'auto', display: 'flex', alignItems: 'center' }}>
        {/* For debugging - add a test button */}
        {import.meta.env.DEV && (
          <button 
            onClick={() => {
              const newTeam = `Test Team ${Math.floor(Math.random() * 100)}`;
              const updatedTeams = [...cachedTeams, newTeam];
              updateCache('teams', updatedTeams);
            }}
            style={{ padding: '4px 8px', fontSize: '0.7rem', margin: '0 8px' }}
          >
            Add Test Tab
          </button>
        )}
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
    </Box>
  );
};

export default Navigation;
