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
  deliveryType: 'immediate' | 'login_triggered' | 'immediate_and_login_triggered';
  isActive: boolean;
  createdByUserId: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  excludeDateKeys?: string[]; // Optional array of dates (YYYY-MM-DD) when message should not be shown
}

const BroadcastMessagePopup = () => {
  const { isAuthenticated } = useAuth();
  const [currentMessage, setCurrentMessage] = useState<AdminBroadcastMessage | null>(null);
  const [seenMessages, setSeenMessages] = useState<Set<number>>(new Set());
  const [seenThisSession, setSeenThisSession] = useState<Set<number>>(new Set());
  const [hasShownLoginMessages, setHasShownLoginMessages] = useState(false);

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

    // Load session-seen messages from sessionStorage
    const sessionSaved = sessionStorage.getItem('seenBroadcastMessagesThisSession');
    if (sessionSaved) {
      try {
        const messageIds = JSON.parse(sessionSaved);
        setSeenThisSession(new Set(messageIds));
      } catch (error) {
        console.error('Failed to parse session broadcast messages:', error);
      }
    }
  }, []);

  // Check for new broadcast messages (immediate, login_triggered, or immediate_and_login_triggered)
  useEffect(() => {
    if (messages.length === 0) return;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Find the most recent message that should be displayed
    const displayMessages = messages
      .filter(msg => {
        // For 'login_triggered': only show on initial load (at login), not when new messages are created
        if (msg.deliveryType === 'login_triggered') {
          const excludeDates = msg.excludeDateKeys || [];
          const shouldShow = !excludeDates.includes(today) && !seenThisSession.has(msg.id);
          // Only show if we haven't shown login messages yet (i.e., this is the login)
          return shouldShow && !hasShownLoginMessages;
        }
        // For 'immediate_and_login_triggered': show on login OR immediately when created (tracked in sessionStorage)
        if (msg.deliveryType === 'immediate_and_login_triggered') {
          const excludeDates = msg.excludeDateKeys || [];
          const shouldShow = !excludeDates.includes(today) && !seenThisSession.has(msg.id);
          // Show immediately if created mid-session, OR on login
          return shouldShow;
        }
        // For 'immediate': show if not already seen (tracked in localStorage)
        if (msg.deliveryType === 'immediate') {
          return !seenMessages.has(msg.id);
        }
        return false;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (displayMessages.length > 0 && !currentMessage) {
      setCurrentMessage(displayMessages[0]);
    }
    
    // Mark that we've shown all login messages only when:
    // 1. No current message is being displayed (user isn't in the middle of viewing messages)
    // 2. No more messages in displayMessages queue
    // 3. All login_triggered and immediate_and_login_triggered messages have been seen this session
    if (!hasShownLoginMessages && !currentMessage && displayMessages.length === 0) {
      const unseenLoginMessages = messages.filter(msg => 
        (msg.deliveryType === 'login_triggered' || msg.deliveryType === 'immediate_and_login_triggered') && 
        !seenThisSession.has(msg.id)
      );
      
      // Only set the flag if there were login messages and they've all been seen now
      const today = new Date().toISOString().split('T')[0];
      const allLoginMessagesSeen = unseenLoginMessages.every(msg => {
        const excludeDates = msg.excludeDateKeys || [];
        return excludeDates.includes(today); // Only unseen because of exclude date
      });
      
      if (unseenLoginMessages.length === 0 || allLoginMessagesSeen) {
        setHasShownLoginMessages(true);
      }
    }
  }, [messages, seenMessages, seenThisSession, currentMessage, hasShownLoginMessages]);

  const handleClose = () => {
    if (currentMessage) {
      if (currentMessage.deliveryType === 'login_triggered' || currentMessage.deliveryType === 'immediate_and_login_triggered') {
        // Track 'login_triggered' and 'immediate_and_login_triggered' messages in sessionStorage (shows again on next login)
        const newSeenThisSession = new Set(Array.from(seenThisSession).concat(currentMessage.id));
        setSeenThisSession(newSeenThisSession);
        
        // Save to sessionStorage (clears on logout/browser close)
        sessionStorage.setItem('seenBroadcastMessagesThisSession', JSON.stringify(Array.from(newSeenThisSession)));
      } else if (currentMessage.deliveryType === 'immediate') {
        // Track 'immediate' messages in localStorage (permanent until manually cleared)
        const newSeenMessages = new Set(Array.from(seenMessages).concat(currentMessage.id));
        setSeenMessages(newSeenMessages);
        
        // Save to localStorage
        localStorage.setItem('seenBroadcastMessages', JSON.stringify(Array.from(newSeenMessages)));
      }
      
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
                  label={
                    currentMessage.deliveryType === 'immediate' ? 'Immediate' : 
                    currentMessage.deliveryType === 'login_triggered' ? 'Login Triggered' : 'Immediate & Login'
                  }
                  color={
                    currentMessage.deliveryType === 'immediate' ? 'warning' : 
                    currentMessage.deliveryType === 'immediate_and_login_triggered' ? 'secondary' : 'info'
                  }
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