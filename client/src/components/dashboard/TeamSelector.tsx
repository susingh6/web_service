import { useState } from 'react';
import { 
  Box, 
  IconButton, 
  Menu, 
  MenuItem, 
  Typography, 
  Tooltip,
  Chip
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

interface TeamSelectorProps {
  teams: any[];
  openTeamTabs: string[];
  onAddTeamTab: (teamName: string) => void;
  onLoadTeams?: () => void;
}

const TeamSelector = ({ teams, openTeamTabs, onAddTeamTab, onLoadTeams }: TeamSelectorProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    // Load teams when "+" button is clicked to populate dropdown
    if (onLoadTeams) {
      onLoadTeams();
    }
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelectTeam = (teamName: string) => {
    onAddTeamTab(teamName);
    handleClose();
  };

  // Filter out teams that are already open
  const availableTeams = teams.filter(team => !openTeamTabs.includes(team.name));

  return (
    <Box>
      <Tooltip title="Add Team Tab">
        <IconButton
          onClick={handleClick}
          size="small"
          component="span"
          sx={{
            backgroundColor: 'action.hover',
            color: 'primary.main',
            '&:hover': {
              backgroundColor: 'action.selected',
            },
          }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        PaperProps={{
          style: {
            maxHeight: 300, // Limit height to show scrollbar
            width: 320, // Increased width for tenant chips
            overflowY: 'auto', // Enable vertical scrolling
          },
        }}
      >
        {availableTeams.length > 0 ? (
          availableTeams.map((team) => (
            <MenuItem 
              key={team.id} 
              onClick={() => handleSelectTeam(team.name)}
              sx={{ 
                minWidth: 150,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 0.75,
                py: 1
              }}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  flex: 1,
                  fontWeight: 500,
                  color: 'text.primary',
                  fontSize: '0.9rem'
                }}
              >
                {team.name}
              </Typography>
              {team.tenant_name && (
                <Box
                  sx={{ 
                    px: 0.75,
                    py: 0.25,
                    borderRadius: '10px',
                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                    border: '1px solid rgba(25, 118, 210, 0.2)',
                    fontSize: '0.65rem',
                    fontWeight: 500,
                    color: 'primary.main',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  {team.tenant_name}
                </Box>
              )}
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              All teams are open
            </Typography>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

export default TeamSelector;