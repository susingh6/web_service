/**
 * Notification Summary Component
 * Shows a compact summary of team notification settings that opens a modal when clicked
 */

import { useState } from 'react';
import { Box, Typography, Chip, Button, IconButton } from '@mui/material';
import { Bell, Mail, MessageSquare, AlertTriangle, Settings } from 'lucide-react';
import { Team } from '@shared/schema';
import { TeamNotificationSettings } from './TeamNotificationSettings';

interface NotificationSummaryProps {
  team: Team;
  tenantName: string;
}

export default function NotificationSummary({ team, tenantName }: NotificationSummaryProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const emailCount = team?.team_email?.length || 0;
  const slackCount = team?.team_slack?.length || 0;
  const pagerDutyCount = team?.team_pagerduty?.length || 0;
  const totalNotifications = emailCount + slackCount + pagerDutyCount;

  const handleToggleModal = () => {
    setIsModalOpen(!isModalOpen);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 1,
          px: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          backgroundColor: 'background.paper',
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: 'action.hover',
            borderColor: 'primary.main',
          }
        }}
        onClick={handleToggleModal}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Bell size={16} color="gray" />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            Notifications:
          </Typography>
        </Box>

        <Box display="flex" alignItems="center" gap={1}>
          {totalNotifications === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
              Not configured
            </Typography>
          ) : (
            <>
              {emailCount > 0 && (
                <Chip
                  icon={<Mail size={12} />}
                  label={emailCount}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    fontSize: '0.65rem', 
                    height: '20px',
                    '& .MuiChip-icon': { fontSize: '12px' }
                  }}
                />
              )}
              {slackCount > 0 && (
                <Chip
                  icon={<MessageSquare size={12} />}
                  label={slackCount}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    fontSize: '0.65rem', 
                    height: '20px',
                    '& .MuiChip-icon': { fontSize: '12px' }
                  }}
                />
              )}
              {pagerDutyCount > 0 && (
                <Chip
                  icon={<AlertTriangle size={12} />}
                  label={pagerDutyCount}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    fontSize: '0.65rem', 
                    height: '20px',
                    '& .MuiChip-icon': { fontSize: '12px' }
                  }}
                />
              )}
            </>
          )}
          <Settings size={14} color="gray" />
        </Box>
      </Box>

      {/* Modal */}
      {isModalOpen && (
        <TeamNotificationSettings
          team={team}
          tenantName={tenantName}
          variant="modal"
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}