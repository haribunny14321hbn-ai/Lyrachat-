import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { ModelProvider, Message, AppSettings } from '../types';

// Helper to convert base64 to parts for Gemini
const base64ToPart = (base64: string, mimeType: string = 'image/jpeg'): Part => {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  return {
    inlineData: {
      data: base64Data,
      mimeType
    }
  };
};

// Unified interface for responses
interface StreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

export class AIService {
  private geminiClient: GoogleGenAI | null = null;

  constructor() {}

  private getGeminiClient(): GoogleGenAI {
    if (!this.geminiClient) {
      this.geminiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return this.geminiClient;
  }

  async generateTitle(
    settings: AppSettings, 
    firstMessage: string,
    model: ModelProvider
  ): Promise<string> {
    const prompt = `Summarize this message in 3-5 words for a chat title. No quotes. Message: "${firstMessage.substring(0, 500)}"`;
    
    try {
      if (model === ModelProvider.Gemini) {
        const ai = this.getGeminiClient();
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return response.text?.trim() || 'New Chat';
      }
      // Fallback or other models could go here, but for now we skip to save complexity 
      // or use a simple heuristic if no API key is set for title generation.
      return firstMessage.split(' ').slice(0, 4).join(' ') + '...';
    } catch (e) {
      console.warn("Title generation failed", e);
      return 'New Chat';
    }
  }

  async streamResponse(
    messages: Message[],
    settings: AppSettings,
    callbacks: StreamCallbacks
  ) {
    const { activeModel, apiKeys, systemInstruction } = settings;
    
    try {
      if (activeModel === ModelProvider.Gemini) {
        await this.streamGemini(messages, systemInstruction, callbacks);
      } else {
        const apiKey = apiKeys[activeModel];
        if (!apiKey) {
          callbacks.onError(new Error(`Please provide an API key for ${activeModel} in Settings.`));
          return;
        }
        await this.streamStandardOpenAI(messages, apiKey, activeModel, systemInstruction, callbacks);
      }
    } catch (error) {
      console.error("AI Service Error:", error);
      callbacks.onError(error instanceof Error ? error : new Error("Unknown error occurred"));
    }
  }

  private async streamGemini(
    messages: Message[],
    systemInstruction: string,
    callbacks: StreamCallbacks
  ) {
    const ai = this.getGeminiClient();
    
    // Prepare history
    // Gemini SDK expects history to be alternating User/Model. 
    // The last message in `messages` is the new one we want to send.
    const historyMessages = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];

    const history = historyMessages.map(m => ({
      role: m.role,
      parts: m.image 
        ? [base64ToPart(m.image), { text: m.content }] 
        : [{ text: m.content }]
    }));

    // For the new message content
    const newParts = lastMessage.image 
      ? [base64ToPart(lastMessage.image), { text: lastMessage.content }] 
      : [{ text: lastMessage.content }];

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstruction,
      },
      history: history
    });

    try {
      const result = await chat.sendMessageStream({
        message: { parts: newParts }
      });

      let fullText = "";
      for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          callbacks.onChunk(text);
        }
      }
      callbacks.onComplete(fullText);
    } catch (err: any) {
        // Simple error handling
        throw err;
    }
  }

  private async streamStandardOpenAI(
    messages: Message[],
    apiKey: string,
    provider: ModelProvider,
    systemInstruction: string,
    callbacks: StreamCallbacks
  ) {
    let baseUrl = 'https://api.openai.com/v1';
    let modelName = 'gpt-4o-mini'; 

    if (provider === ModelProvider.DeepSeek) {
      baseUrl = 'https://api.deepseek.com';
      modelName = 'deepseek-chat';
    }

    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages.map(m => {
             if (m.image && provider === ModelProvider.OpenAI) { // OpenAI Vision format
                 return {
                     role: m.role,
                     content: [
                         { type: "text", text: m.content },
                         { type: "image_url", image_url: { url: m.image } }
                     ]
                 };
             }
             return { role: m.role, content: m.content };
        })
      ],
      stream: true
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API Error ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    if (!reader) throw new Error("No response body");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.includes('[DONE]')) return callbacks.onComplete(fullText);
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              callbacks.onChunk(content);
            }
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }
    callbacks.onComplete(fullText);
  }
}

export const aiService = new AIService();