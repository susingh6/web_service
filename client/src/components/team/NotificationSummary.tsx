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
                  variant="filled"
                  sx={{ 
                    fontSize: '0.65rem', 
                    height: '20px',
                    fontWeight: 500,
                    bgcolor: '#e8f5e8',
                    color: '#2e7d32',
                    borderColor: '#81c784',
                    '& .MuiChip-icon': { 
                      fontSize: '12px',
                      color: '#2e7d32'
                    },
                    '&:hover': {
                      bgcolor: '#c8e6c9'
                    }
                  }}
                />
              )}
              {slackCount > 0 && (
                <Chip
                  icon={<MessageSquare size={12} />}
                  label={slackCount}
                  size="small"
                  variant="filled"
                  sx={{ 
                    fontSize: '0.65rem', 
                    height: '20px',
                    fontWeight: 500,
                    bgcolor: '#f3e5f5',
                    color: '#7b1fa2',
                    borderColor: '#ba68c8',
                    '& .MuiChip-icon': { 
                      fontSize: '12px',
                      color: '#7b1fa2'
                    },
                    '&:hover': {
                      bgcolor: '#e1bee7'
                    }
                  }}
                />
              )}
              {pagerDutyCount > 0 && (
                <Chip
                  icon={<AlertTriangle size={12} />}
                  label={pagerDutyCount}
                  size="small"
                  variant="filled"
                  sx={{ 
                    fontSize: '0.65rem', 
                    height: '20px',
                    fontWeight: 500,
                    bgcolor: '#fff3e0',
                    color: '#ef6c00',
                    borderColor: '#ffb74d',
                    '& .MuiChip-icon': { 
                      fontSize: '12px',
                      color: '#ef6c00'
                    },
                    '&:hover': {
                      bgcolor: '#ffe0b2'
                    }
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