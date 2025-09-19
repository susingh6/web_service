import { apiRequest } from '@/lib/queryClient';
import { config } from '@/config';

export interface ConversationSummary {
  id: string;
  date_key: string; // e.g., "2025-09-10"
  task_name: string;
  summary: string;
  timestamp: string | Date; // ISO string or Date object
  status: 'resolved' | 'pending' | 'failed';
  messageCount: number;
}

export interface FullConversation {
  id: string;
  date_key: string;
  task_name: string;
  messages: {
    id: string;
    type: 'user' | 'agent';
    content: string;
    timestamp: string | Date; // ISO string or Date object
  }[];
  status: 'resolved' | 'pending' | 'failed';
}

export interface SendMessageRequest {
  message: string;
  dag_id: number;
  conversation_history?: ConversationMessage[];
  user_context?: {
    email?: string;
    session_id?: string;
  };
  incident_context?: {
    notification_id: string;
    task_name: string;
    error_summary: string;
    logs_url?: string;
  };
}

export interface SendMessageResponse {
  conversation_id: string;
  agent_response: string;
  status: 'complete' | 'pending';
  confidence?: number;
  sources?: Array<{ name: string; url: string }>;
}

export interface ConversationMessage {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: Date | string;
  confidence?: number;
  sources?: Array<{ name: string; url: string }>;
}

export interface ConversationHistory {
  messages: ConversationMessage[];
  dag_id: number;
  user_email?: string;
  last_updated: Date | string;
}

// Mock data for agent conversations
const mockConversationSummaries: ConversationSummary[] = [
  {
    id: '1',
    date_key: '2025-09-10',
    task_name: 'daily_aggregation_task',
    summary: 'Investigated job failure during maintenance window - resolved with retry logic',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'resolved',
    messageCount: 6,
  },
  {
    id: '2',
    date_key: '2025-09-10', 
    task_name: 'data_quality_check',
    summary: 'Performance optimization for increased data volume - provided ETA updates',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    status: 'resolved',
    messageCount: 4,
  },
  {
    id: '3',
    date_key: '2025-09-09',
    task_name: 'user_segmentation_job',
    summary: 'Memory optimization for large dataset processing',
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    status: 'resolved',
    messageCount: 8,
  },
];

const mockFullConversations: Record<string, FullConversation> = {
  '1': {
    id: '1',
    date_key: '2025-09-10',
    task_name: 'daily_aggregation_task',
    messages: [
      {
        id: '1',
        type: 'user',
        content: 'The daily aggregation job failed this morning. Can you investigate?',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '2',
        type: 'agent',
        content: 'I\'ll investigate the failure right away. Let me check the logs...',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 30000).toISOString(),
      },
      {
        id: '3',
        type: 'agent',
        content: 'I found the issue - the source table was locked during the maintenance window. I\'ll reschedule the job with proper retry logic.',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 60000).toISOString(),
      },
      {
        id: '4',
        type: 'user',
        content: 'Thanks! How can we prevent this in the future?',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 120000).toISOString(),
      },
      {
        id: '5',
        type: 'agent',
        content: 'I recommend adding a pre-check for table locks and implementing exponential backoff retry logic.',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 150000).toISOString(),
      },
    ],
    status: 'resolved',
  },
  '2': {
    id: '2',
    date_key: '2025-09-10',
    task_name: 'data_quality_check',
    messages: [
      {
        id: '1',
        type: 'user',
        content: 'Why is the job taking longer than usual today?',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
      {
        id: '2',
        type: 'agent',
        content: 'The job is processing 40% more data than yesterday due to increased upstream activity. Current ETA is 15 more minutes.',
        timestamp: new Date(Date.now() - 30 * 60 * 1000 + 30000).toISOString(),
      },
    ],
    status: 'resolved',
  },
};

// Utility functions for localStorage management
const getStorageKey = (dagId: number) => `agent-chat-${dagId}`;

const loadFromLocalStorage = (dagId: number): ConversationMessage[] => {
  try {
    const stored = localStorage.getItem(getStorageKey(dagId));
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Failed to load conversation from localStorage:', error);
    return [];
  }
};

const saveToLocalStorage = (dagId: number, messages: ConversationMessage[]) => {
  try {
    localStorage.setItem(getStorageKey(dagId), JSON.stringify(messages));
  } catch (error) {
    console.warn('Failed to save conversation to localStorage:', error);
  }
};

export const agentApi = {
  // Load conversation history from FastAPI (on modal open)
  loadConversationHistory: async (dagId: number, limit: number = 10): Promise<ConversationMessage[]> => {
    try {
      const res = await apiRequest('GET', `${config.endpoints.agent.loadHistory(dagId)}?limit=${limit}`);
      const data = await res.json();
      
      // Save to localStorage for session use
      const messages = data.messages || [];
      saveToLocalStorage(dagId, messages);
      
      return messages;
    } catch (error) {
      console.warn('Failed to load conversation history from FastAPI, using localStorage:', error);
      return loadFromLocalStorage(dagId);
    }
  },

  // Save conversation to FastAPI (on modal close)
  saveConversationHistory: async (dagId: number, messages: ConversationMessage[], userContext?: { email?: string; session_id?: string }): Promise<boolean> => {
    if (messages.length === 0) return true;
    
    try {
      await apiRequest('POST', config.endpoints.agent.saveConversation(dagId), {
        messages,
        user_context: userContext,
        last_updated: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Failed to save conversation to FastAPI:', error);
      return false;
    }
  },

  // Get conversation summaries for a DAG (still using mock for now)
  getConversationSummaries: async (dagId: number): Promise<ConversationSummary[]> => {
    if (config.mock?.agent) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));
      // Return last 10 summaries for the specific DAG
      return mockConversationSummaries.slice(0, 10);
    }
    
    const res = await apiRequest('GET', config.endpoints.agent.conversationSummaries(dagId));
    return await res.json();
  },

  // Get full conversation by ID
  getFullConversation: async (conversationId: string): Promise<FullConversation> => {
    if (config.mock?.agent) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const conversation = mockFullConversations[conversationId];
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }
      return conversation;
    }
    
    const res = await apiRequest('GET', config.endpoints.agent.fullConversation(conversationId));
    return await res.json();
  },

  // Send message to Agent FastAPI with conversation history
  sendMessage: async (dagId: number, message: string, conversationHistory?: ConversationMessage[], userContext?: { email?: string; session_id?: string }, incidentContext?: any): Promise<SendMessageResponse> => {
    // First add user message to localStorage immediately
    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: message,
      timestamp: new Date()
    };
    
    const currentHistory = conversationHistory || loadFromLocalStorage(dagId);
    const updatedHistory = [...currentHistory, userMessage];
    saveToLocalStorage(dagId, updatedHistory);

    try {
      // Build request payload for your Agent FastAPI
      const requestPayload: SendMessageRequest = {
        message,
        dag_id: dagId,
        conversation_history: updatedHistory,
        user_context: userContext,
        incident_context: incidentContext
      };

      // Call your Agent FastAPI
      const res = await apiRequest('POST', config.endpoints.agent.chat(dagId), requestPayload);
      const response = await res.json();

      // Add agent response to localStorage
      const agentMessage: ConversationMessage = {
        id: `agent-${Date.now()}`,
        type: 'agent',
        content: response.agent_response || response.message || 'I received your message but couldn\'t generate a response.',
        timestamp: new Date(),
        confidence: response.confidence,
        sources: response.sources
      };

      const finalHistory = [...updatedHistory, agentMessage];
      saveToLocalStorage(dagId, finalHistory);

      return {
        conversation_id: response.conversation_id || `conv-${Date.now()}`,
        agent_response: agentMessage.content,
        status: response.status || 'complete',
        confidence: response.confidence,
        sources: response.sources
      };

    } catch (error) {
      console.error('Agent FastAPI call failed:', error);
      
      // Fallback error response
      const errorMessage: ConversationMessage = {
        id: `agent-error-${Date.now()}`,
        type: 'agent',
        content: incidentContext 
          ? 'I encountered an error while analyzing your job failure. Let me help you troubleshoot this issue. Can you provide more details about what happened?'
          : 'I encountered an error while processing your message. Please try again or rephrase your question.',
        timestamp: new Date()
      };

      const errorHistory = [...updatedHistory, errorMessage];
      saveToLocalStorage(dagId, errorHistory);

      return {
        conversation_id: `error-conv-${Date.now()}`,
        agent_response: errorMessage.content,
        status: 'complete'
      };
    }
  },

  // Send a message with incident context using enhanced agent endpoint
  sendMessageWithIncident: async (dagId: number, request: SendMessageRequest): Promise<SendMessageResponse> => {
    if (config.mock?.agent) {
      // Use the same mock logic as sendMessage for now
      return agentApi.sendMessage(dagId, request);
    }
    
    // Use the enhanced agent chat endpoint with incident context and OAuth claims
    const res = await apiRequest('POST', config.endpoints.agent.chatWithIncident(dagId), request);
    return await res.json();
  },
};