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

interface AgentWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  dagEntity: Entity | null;
}

interface ConversationSummary {
  id: string;
  date_key: string; // e.g., "2025-09-10"
  task_name: string;
  summary: string;
  timestamp: Date;
  status: 'resolved' | 'pending' | 'failed';
  messageCount: number;
}

interface FullConversation {
  id: string;
  date_key: string;
  task_name: string;
  messages: {
    id: string;
    type: 'user' | 'agent';
    content: string;
    timestamp: Date;
  }[];
  status: 'resolved' | 'pending' | 'failed';
}

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
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
  const [expandedConversations, setExpandedConversations] = useState<Map<string, FullConversation>>(new Map());
  const [loadingConversations, setLoadingConversations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<CurrentConversation | null>(null);

  // Lazy load last 10 conversation summaries when modal opens
  useEffect(() => {
    if (open && dagEntity) {
      setLoading(true);
      // Simulate API call to fetch last 10 conversation summaries
      setTimeout(() => {
        const mockSummaries: ConversationSummary[] = [
          {
            id: '1',
            date_key: '2025-09-10',
            task_name: 'daily_aggregation_task',
            summary: 'Investigated job failure during maintenance window - resolved with retry logic',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
            status: 'resolved',
            messageCount: 6,
          },
          {
            id: '2',
            date_key: '2025-09-10', 
            task_name: 'data_quality_check',
            summary: 'Performance optimization for increased data volume - provided ETA updates',
            timestamp: new Date(Date.now() - 30 * 60 * 1000),
            status: 'resolved',
            messageCount: 4,
          },
          {
            id: '3',
            date_key: '2025-09-09',
            task_name: 'user_segmentation_job',
            summary: 'Memory optimization for large dataset processing',
            timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000),
            status: 'resolved',
            messageCount: 8,
          },
        ];
        // Limit to last 10 conversation summaries
        setConversationSummaries(mockSummaries.slice(0, 10));
        setLoading(false);
      }, 800); // Simulate network delay
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
    setLoadingConversations(prev => new Set([...prev, conversationId]));

    // Simulate API call to fetch full conversation
    setTimeout(() => {
      const mockFullConversation: FullConversation = {
        id: conversationId,
        date_key: '2025-09-10',
        task_name: 'daily_aggregation_task',
        messages: [
          {
            id: '1',
            type: 'user',
            content: 'The daily aggregation job failed this morning. Can you investigate?',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          {
            id: '2',
            type: 'agent',
            content: 'I\'ll investigate the failure right away. Let me check the logs...',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 30000),
          },
          {
            id: '3',
            type: 'agent',
            content: 'I found the issue - the source table was locked during the maintenance window. I\'ll reschedule the job with proper retry logic.',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 60000),
          },
          {
            id: '4',
            type: 'user',
            content: 'Thanks! How can we prevent this in the future?',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 120000),
          },
          {
            id: '5',
            type: 'agent',
            content: 'I recommend adding a pre-check for table locks and implementing exponential backoff retry logic.',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 150000),
          },
        ],
        status: 'resolved',
      };

      setExpandedConversations(prev => new Map([...prev, [conversationId, mockFullConversation]]));
      setLoadingConversations(prev => {
        const newSet = new Set(prev);
        newSet.delete(conversationId);
        return newSet;
      });
    }, 1000);
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;

    // Create current conversation
    setCurrentConversation({
      userMessage: message,
      agentResponse: '',
      status: 'sending',
    });

    setMessage('');

    // Simulate sending and waiting for response
    setTimeout(() => {
      setCurrentConversation(prev => prev ? { ...prev, status: 'waiting' } : null);
      
      // Simulate agent response
      setTimeout(() => {
        setCurrentConversation(prev => prev ? {
          ...prev,
          agentResponse: 'Based on my analysis of the current task status, everything appears to be running normally. The last execution completed successfully at ' + format(new Date(), 'HH:mm') + '. No issues detected in the monitored tasks.',
          status: 'complete'
        } : null);
        
        // Auto-close current conversation after 3 seconds
        setTimeout(() => {
          setCurrentConversation(null);
          // Refresh conversation summaries to include new conversation
          // In real implementation, this would be handled by the API
        }, 3000);
      }, 2000);
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
                              {format(summary.timestamp, 'MMM dd, HH:mm')}
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
                                    {msg.type === 'user' ? 'You' : 'Agent'} • {format(msg.timestamp, 'HH:mm')}
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