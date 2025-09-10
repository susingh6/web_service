import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close,
  SmartToy,
  Send,
  History,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Chat,
} from '@mui/icons-material';
import { Entity } from '@shared/schema';
import { format } from 'date-fns';

interface AgentWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  dagEntity: Entity | null;
}

interface Conversation {
  id: string;
  timestamp: Date;
  userMessage: string;
  agentResponse: string;
  status: 'resolved' | 'pending' | 'failed';
}

const AgentWorkspaceModal: React.FC<AgentWorkspaceModalProps> = ({
  open,
  onClose,
  dagEntity,
}) => {
  const [message, setMessage] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  // Lazy load last 10 conversations when modal opens
  useEffect(() => {
    if (open && dagEntity) {
      setLoading(true);
      // Simulate API call to fetch last 10 conversations
      setTimeout(() => {
        const mockConversations: Conversation[] = [
          {
            id: '1',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            userMessage: 'The daily aggregation job failed this morning. Can you investigate?',
            agentResponse: 'I found the issue - the source table was locked during the maintenance window. I\'ve rescheduled the job to run now with proper retry logic.',
            status: 'resolved',
          },
          {
            id: '2', 
            timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
            userMessage: 'Why is the job taking longer than usual today?',
            agentResponse: 'The job is processing 40% more data than yesterday due to increased upstream activity. Current ETA is 15 more minutes.',
            status: 'resolved',
          },
        ];
        // Limit to last 10 conversations
        setConversations(mockConversations.slice(0, 10));
        setLoading(false);
      }, 800); // Simulate network delay
    }
  }, [open, dagEntity]);

  const handleSendMessage = () => {
    if (!message.trim()) return;

    const newConversation: Conversation = {
      id: Date.now().toString(),
      timestamp: new Date(),
      userMessage: message,
      agentResponse: 'Processing your request... I\'ll analyze the DAG status and get back to you shortly.',
      status: 'pending',
    };

    setConversations(prev => [newConversation, ...prev]);
    setMessage('');

    // Simulate agent response
    setTimeout(() => {
      setConversations(prev => 
        prev.map(conv => 
          conv.id === newConversation.id 
            ? { 
                ...conv, 
                agentResponse: 'Based on my analysis, the DAG is running normally. The last execution completed successfully at ' + format(new Date(), 'HH:mm') + '. No issues detected.',
                status: 'resolved' as const 
              }
            : conv
        )
      );
    }, 2000);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved': return <CheckCircle color="success" fontSize="small" />;
      case 'pending': return <Warning color="warning" fontSize="small" />;
      case 'failed': return <ErrorIcon color="error" fontSize="small" />;
      default: return <Chat color="info" fontSize="small" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'success';
      case 'pending': return 'warning';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { height: '80vh', display: 'flex', flexDirection: 'column' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box display="flex" alignItems="center" gap={1}>
          <SmartToy color="secondary" />
          <Typography variant="h6">
            Agent Workspace - {dagEntity?.name || 'DAG'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 2 }}>
        {/* DAG Status Overview */}
        <Paper elevation={1} sx={{ p: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" gutterBottom>
            DAG Status Overview
          </Typography>
          <Box display="flex" gap={2} alignItems="center">
            <Chip 
              label={dagEntity?.status || 'Unknown'} 
              color={dagEntity?.status === 'Passed' ? 'success' : dagEntity?.status === 'Failed' ? 'error' : 'warning'}
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              Last Updated: {dagEntity?.lastRefreshed ? format(new Date(dagEntity.lastRefreshed), 'MMM dd, HH:mm') : 'N/A'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              SLA: {dagEntity?.currentSla || 'N/A'}%
            </Typography>
          </Box>
        </Paper>

        {/* AI Agent Note */}
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>AI Agent Monitoring:</strong> This workspace allows you to communicate with an AI agent that continuously monitors this DAG for issues and can help with troubleshooting.
          </Typography>
        </Alert>

        {/* Conversation History */}
        <Box flex={1} display="flex" flexDirection="column">
          <Typography variant="subtitle2" gutterBottom display="flex" alignItems="center" gap={1}>
            <History fontSize="small" />
            Recent Conversations (Last 10)
          </Typography>
          
          <Paper 
            elevation={1} 
            sx={{ 
              flex: 1, 
              overflow: 'auto', 
              maxHeight: '300px',
              mb: 2,
              position: 'relative',
            }}
          >
            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" p={4}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                  Loading conversations...
                </Typography>
              </Box>
            ) : conversations.length === 0 ? (
              <Box display="flex" justifyContent="center" alignItems="center" p={4}>
                <Typography variant="body2" color="text.secondary">
                  No conversations yet. Start by asking the AI agent about this DAG.
                </Typography>
              </Box>
            ) : (
              <List dense>
                {conversations.map((conversation, index) => (
                <React.Fragment key={conversation.id}>
                  <ListItem alignItems="flex-start">
                    <ListItemIcon sx={{ minWidth: 32, mt: 1 }}>
                      {getStatusIcon(conversation.status)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight={500}>
                            You
                          </Typography>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Chip 
                              label={conversation.status} 
                              size="small" 
                              color={getStatusColor(conversation.status) as any}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {format(conversation.timestamp, 'MMM dd, HH:mm')}
                            </Typography>
                          </Box>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            {conversation.userMessage}
                          </Typography>
                          <Box sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                            <Typography variant="body2" color="text.secondary" fontWeight={500}>
                              Agent Response:
                            </Typography>
                            <Typography variant="body2" color="text.primary">
                              {conversation.agentResponse}
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                  </ListItem>
                    {index < conversations.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Box>

        {/* New Message Input */}
        <Box display="flex" gap={1}>
          <TextField
            fullWidth
            placeholder="Ask the AI agent about this DAG..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            multiline
            maxRows={3}
            size="small"
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!message.trim()}
            startIcon={<Send />}
            sx={{ minWidth: 'auto', px: 2 }}
          >
            Send
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default AgentWorkspaceModal;