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
  task_context?: string;
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

export const agentApi = {
  // Get conversation summaries for a DAG
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

  // Send a new message to the agent
  sendMessage: async (dagId: number, request: SendMessageRequest): Promise<SendMessageResponse> => {
    if (config.mock?.agent) {
      // Simulate network delays for different stages
      await new Promise(resolve => setTimeout(resolve, 500)); // Sending delay
      
      // Mock response with incident context awareness
      let mockResponse = `Based on my analysis of the current task status for DAG ${dagId}, everything appears to be running normally. The last execution completed successfully. No issues detected in the monitored tasks.`;
      
      if (request.incident_context) {
        mockResponse = `I see there's an issue with the ${request.incident_context.task_name} task. Let me analyze the error: "${request.incident_context.error_summary}". Based on the context, this appears to be a ${request.incident_context.task_name} failure. The most common causes for this type of error are:

1. **Data source connectivity issues** - Check if upstream data sources are accessible
2. **Memory or resource constraints** - The job might need more resources to process the data
3. **Schema changes** - Upstream schema might have changed, causing transformation failures
4. **Dependency failures** - Check if dependent tasks completed successfully

Would you like me to investigate any of these areas specifically? I can also help you check the logs${request.incident_context.logs_url ? ' at the provided URL' : ''} for more detailed diagnostics.`;
      }
      
      return {
        conversation_id: Date.now().toString(),
        agent_response: mockResponse,
        status: 'complete',
      };
    }
    
    const res = await apiRequest('POST', config.endpoints.agent.sendMessage(dagId), request);
    return await res.json();
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