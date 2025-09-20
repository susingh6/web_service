import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  Chip
} from '@mui/material';
import { Close as CloseIcon, Campaign as CampaignIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buildUrl } from '@/config';
import { useAuth } from '@/hooks/use-auth';

interface AdminBroadcastMessage {
  id: number;
  message: string;
  dateKey: string;
  deliveryType: 'immediate' | 'login_triggered';
  isActive: boolean;
  createdByUserId: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BroadcastMessagePopup = () => {
  const { isAuthenticated } = useAuth();
  const [currentMessage, setCurrentMessage] = useState<AdminBroadcastMessage | null>(null);
  const [seenMessages, setSeenMessages] = useState<Set<number>>(new Set());

  // Fetch active broadcast messages only when authenticated
  const { data: messages = [] } = useQuery<AdminBroadcastMessage[]>({
    queryKey: ['broadcast-messages'],
    queryFn: async () => {
      const response = await fetch(buildUrl('/api/v1/admin/broadcast-messages'), {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('Failed to fetch broadcast messages');
      const data = await response.json();
      
      // Filter only active messages that haven't expired
      const now = new Date();
      return data.filter((message: AdminBroadcastMessage) => 
        message.isActive && 
        (!message.expiresAt || new Date(message.expiresAt) > now)
      );
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 1 * 60 * 1000, // Refetch every 1 minute
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  // Load seen messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('seenBroadcastMessages');
    if (saved) {
      try {
        const messageIds = JSON.parse(saved);
        setSeenMessages(new Set(messageIds));
      } catch (error) {
        console.error('Failed to parse seen broadcast messages:', error);
      }
    }
  }, []);

  // Check for new immediate delivery messages
  useEffect(() => {
    if (messages.length === 0) return;

    // Find the most recent immediate delivery message that hasn't been seen
    const immediateMessages = messages
      .filter(msg => msg.deliveryType === 'immediate')
      .filter(msg => !seenMessages.has(msg.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (immediateMessages.length > 0 && !currentMessage) {
      setCurrentMessage(immediateMessages[0]);
    }
  }, [messages, seenMessages, currentMessage]);

  const handleClose = () => {
    if (currentMessage) {
      // Mark message as seen
      const newSeenMessages = new Set(Array.from(seenMessages).concat(currentMessage.id));
      setSeenMessages(newSeenMessages);
      
      // Save to localStorage
      localStorage.setItem('seenBroadcastMessages', JSON.stringify(Array.from(newSeenMessages)));
      
      setCurrentMessage(null);
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  if (!currentMessage) return null;

  return (
    <Dialog
      open={true}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      data-testid="dialog-broadcast-message"
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <CampaignIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Admin Message
            </Typography>
          </Box>
          <IconButton
            onClick={handleClose}
            size="small"
            data-testid="button-close-broadcast"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ py: 1 }}>
          {/* Message content */}
          <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>
            {currentMessage.message}
          </Typography>

          {/* Message metadata */}
          <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Message Information
            </Typography>
            <Box display="flex" flexDirection="column" gap={1}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Type:</Typography>
                <Chip 
                  label={currentMessage.deliveryType === 'immediate' ? 'Immediate' : 'Login Triggered'}
                  color={currentMessage.deliveryType === 'immediate' ? 'warning' : 'info'}
                  size="small"
                />
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Sent:</Typography>
                <Typography variant="body2">{formatTimeAgo(new Date(currentMessage.createdAt))}</Typography>
              </Box>
              {currentMessage.expiresAt && (
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Expires:</Typography>
                  <Typography variant="body2">
                    {new Date(currentMessage.expiresAt).toLocaleString()}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button 
          onClick={handleClose} 
          variant="contained" 
          fullWidth
          data-testid="button-close-broadcast-message"
        >
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BroadcastMessagePopup;