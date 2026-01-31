
export type Role = 'user' | 'model' | 'system';

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  timestamp: Date;
  attachments?: string[]; // Base64 strings or URLs
  groundingSources?: Array<{
    title: string;
    uri: string;
  }>;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastModified: Date;
}
