export enum ModelProvider {
  Gemini = 'Gemini',
  OpenAI = 'OpenAI',
  DeepSeek = 'DeepSeek'
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  image?: string; // Base64 string
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: ModelProvider;
}

export interface UserProfile {
  name: string;
  avatarUrl?: string; // URL or Base64
}

export interface AppSettings {
  apiKeys: {
    [ModelProvider.Gemini]?: string;
    [ModelProvider.OpenAI]?: string;
    [ModelProvider.DeepSeek]?: string;
  };
  systemInstruction: string;
  activeModel: ModelProvider;
  profile: UserProfile;
  darkMode: boolean;
  enterToSend: boolean;
}

export const DEFAULT_SYSTEM_INSTRUCTION = 
`You are Lyra, a friendly, intelligent, and witty AI companion. 
You answer clearly and concisely. 
You care about the user's well-being and productivity.
When relevant, format your answers with Markdown.`;

export const DEFAULT_SETTINGS: AppSettings = {
  apiKeys: {},
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
  activeModel: ModelProvider.Gemini,
  profile: {
    name: 'User',
  },
  darkMode: true,
  enterToSend: true,
};
