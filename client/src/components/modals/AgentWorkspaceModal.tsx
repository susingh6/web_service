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
  Add,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { Entity } from '@shared/schema';
import { format } from 'date-fns';
import { agentApi, ConversationSummary, FullConversation } from '@/features/sla/agentApi';

interface AgentWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  dagEntity: Entity | null;
}

// Types are now imported from agentApi

interface CurrentConversation {
  userMessage: string;
  agentResponse: string;
  status: 'sending' | 'waiting' | 'complete';
}

const AgentWorkspaceModal: React.FC<AgentWorkspaceModalProps> = ({
  open,
  onClose,
  dagEntity,
}) => {
  const [message, setMessage] = useState('');
  const [conversationSummaries, setConversationSummaries] = useState<(ConversationSummary & { timestamp: Date })[]>([]);
  const [expandedConversations, setExpandedConversations] = useState<Map<string, FullConversation & { messages: Array<{ id: string; type: 'user' | 'agent'; content: string; timestamp: Date; }> }>>(new Map());
  const [loadingConversations, setLoadingConversations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<CurrentConversation | null>(null);

  // Lazy load last 10 conversation summaries when modal opens
  useEffect(() => {
    if (open && dagEntity) {
      setLoading(true);
      
      // API call to fetch conversation summaries
      agentApi.getConversationSummaries(dagEntity.id)
        .then(summaries => {
          // Convert string timestamps to Date objects for display
          const summariesWithDates = summaries.map(s => ({
            ...s,
            timestamp: new Date(s.timestamp)
          }));
          setConversationSummaries(summariesWithDates);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load conversation summaries:', error);
          setLoading(false);
        });
    }
  }, [open, dagEntity]);

  // Load full conversation when user clicks expand
  const handleExpandConversation = async (conversationId: string) => {
    if (expandedConversations.has(conversationId)) {
      // Collapse if already expanded
      const newExpanded = new Map(expandedConversations);
      newExpanded.delete(conversationId);
      setExpandedConversations(newExpanded);
      return;
    }

    // Mark as loading
    setLoadingConversations(prev => new Set([...Array.from(prev), conversationId]));

    // API call to fetch full conversation
    agentApi.getFullConversation(conversationId)
      .then(fullConversation => {
        // Convert string timestamps to Date objects for display
        const conversationWithDates = {
          ...fullConversation,
          messages: fullConversation.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        };
        
        setExpandedConversations(prev => {
          const newMap = new Map(prev);
          newMap.set(conversationId, conversationWithDates);
          return newMap;
        });
        setLoadingConversations(prev => {
          const newSet = new Set(prev);
          newSet.delete(conversationId);
          return newSet;
        });
      })
      .catch(error => {
        console.error('Failed to load full conversation:', error);
        setLoadingConversations(prev => {
          const newSet = new Set(prev);
          newSet.delete(conversationId);
          return newSet;
        });
      });
  };

  const handleSendMessage = () => {
    if (!message.trim() || !dagEntity) return;

    // Create current conversation
    setCurrentConversation({
      userMessage: message,
      agentResponse: '',
      status: 'sending',
    });

    const messageText = message;
    setMessage('');

    // Mark as sending
    setTimeout(() => {
      setCurrentConversation(prev => prev ? { ...prev, status: 'waiting' } : null);
      
      // API call to send message
      agentApi.sendMessage(dagEntity.id, { message: messageText })
        .then(response => {
          setCurrentConversation(prev => prev ? {
            ...prev,
            agentResponse: response.agent_response,
            status: 'complete'
          } : null);
          
          // Auto-close current conversation after 3 seconds
          setTimeout(() => {
            setCurrentConversation(null);
            // Refresh conversation summaries to include new conversation
            if (dagEntity) {
              agentApi.getConversationSummaries(dagEntity.id)
                .then(summaries => {
                  const summariesWithDates = summaries.map(s => ({
                    ...s,
                    timestamp: new Date(s.timestamp)
                  }));
                  setConversationSummaries(summariesWithDates);
                })
                .catch(error => console.error('Failed to refresh summaries:', error));
            }
          }, 3000);
        })
        .catch(error => {
          console.error('Failed to send message:', error);
          setCurrentConversation(prev => prev ? {
            ...prev,
            agentResponse: 'Sorry, I encountered an error while processing your message. Please try again.',
            status: 'complete'
          } : null);
        });
    }, 500);
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
        {/* Development Warning */}
        <Alert severity="info">
          <Typography variant="body2">
            <strong>Under Development:</strong> This agent workspace feature is currently being developed. 
            Some functionality may be limited or use mock data.
          </Typography>
        </Alert>

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
            <strong>AI Agent Monitoring:</strong> Agent will only monitor AI tasks in "View Tasks" set by user. Use this workspace to communicate with the AI agent for task-specific troubleshooting and assistance.
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
            ) : conversationSummaries.length === 0 ? (
              <Box display="flex" justifyContent="center" alignItems="center" p={4}>
                <Typography variant="body2" color="text.secondary">
                  No conversations yet. Start by asking the AI agent about this DAG.
                </Typography>
              </Box>
            ) : (
              <List dense>
                {conversationSummaries.map((summary, index) => (
                <React.Fragment key={summary.id}>
                  <ListItem alignItems="flex-start">
                    <ListItemIcon sx={{ minWidth: 32, mt: 1 }}>
                      {getStatusIcon(summary.status)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {summary.task_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {summary.date_key} • {summary.messageCount} messages
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Chip 
                              label={summary.status} 
                              size="small" 
                              color={getStatusColor(summary.status) as any}
                            />
                            <IconButton 
                              size="small"
                              onClick={() => handleExpandConversation(summary.id)}
                              disabled={loadingConversations.has(summary.id)}
                            >
                              {loadingConversations.has(summary.id) ? (
                                <CircularProgress size={16} />
                              ) : expandedConversations.has(summary.id) ? (
                                <ExpandLess fontSize="small" />
                              ) : (
                                <Add fontSize="small" />
                              )}
                            </IconButton>
                            <Typography variant="caption" color="text.secondary">
                              {format(new Date(summary.timestamp), 'MMM dd, HH:mm')}
                            </Typography>
                          </Box>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {summary.summary}
                          </Typography>
                          
                          {/* Expanded full conversation */}
                          {expandedConversations.has(summary.id) && (
                            <Paper variant="outlined" sx={{ mt: 1, p: 1, bgcolor: 'background.default' }}>
                              <Typography variant="caption" fontWeight={500} color="text.secondary">
                                Full Conversation:
                              </Typography>
                              {expandedConversations.get(summary.id)?.messages.map((msg, msgIndex) => (
                                <Box key={msg.id} sx={{ mt: 1, mb: 1 }}>
                                  <Typography variant="caption" fontWeight={500} color={msg.type === 'user' ? 'primary.main' : 'secondary.main'}>
                                    {msg.type === 'user' ? 'You' : 'Agent'} • {format(new Date(msg.timestamp), 'HH:mm')}
                                  </Typography>
                                  <Typography variant="body2" sx={{ ml: 1 }}>
                                    {msg.content}
                                  </Typography>
                                </Box>
                              ))}
                            </Paper>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                    {index < conversationSummaries.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Box>

        {/* Current Conversation */}
        {currentConversation && (
          <Paper elevation={2} sx={{ p: 2, mb: 2, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
            <Typography variant="subtitle2" color="primary.main" gutterBottom>
              Current Conversation
            </Typography>
            
            {/* User message */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" fontWeight={500} color="primary.main">
                You • {format(new Date(), 'HH:mm')}
              </Typography>
              <Typography variant="body2" sx={{ ml: 1 }}>
                {currentConversation.userMessage}
              </Typography>
            </Box>

            {/* Agent response */}
            <Box sx={{ bgcolor: 'background.paper', p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" fontWeight={500} color="secondary.main">
                Agent • {currentConversation.status === 'sending' ? 'Sending...' : currentConversation.status === 'waiting' ? 'Thinking...' : format(new Date(), 'HH:mm')}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} sx={{ ml: 1, mt: 0.5 }}>
                {currentConversation.status === 'sending' || currentConversation.status === 'waiting' ? (
                  <>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      {currentConversation.status === 'sending' ? 'Sending message...' : 'Agent is analyzing...'}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2">
                    {currentConversation.agentResponse}
                  </Typography>
                )}
              </Box>
            </Box>
          </Paper>
        )}

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