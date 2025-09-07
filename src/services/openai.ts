import { Bindings, ChatRequest, ChatResponse } from '../types';
import { Logger } from '../utils/logger';
import { ContentFilter } from './content-filter';

export class OpenAIClient {
  private apiKey: string;
  private logger: Logger;
  private contentFilter: ContentFilter;
  private maxTokens: number;

  constructor(bindings: Bindings, sessionId: string) {
    this.apiKey = bindings.OPENAI_API_KEY;
    this.logger = new Logger(sessionId);
    this.contentFilter = new ContentFilter(bindings, sessionId);
    this.maxTokens = parseInt(bindings.MAX_MESSAGE_TOKENS) || 512;
  }

  async generateResponse(request: ChatRequest): Promise<ChatResponse> {
    try {
      // Filter input content
      const filterResult = await this.contentFilter.filterContent(request.text);
      if (!filterResult.isAllowed) {
        return {
          reply: "I'd prefer to keep our conversation positive and appropriate. How about we talk about something else? ❤️",
          sessionId: request.sessionId || this.generateSessionId()
        };
      }

      // Get system prompt based on persona
      const systemPrompt = this.contentFilter.generateSystemPrompt(request.persona);

      // Prepare OpenAI request
      const openaiRequest = {
        model: 'gpt-4o-mini', // Cost-effective model as requested
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.text }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.8, // Slightly creative but consistent
        frequency_penalty: 0.3, // Reduce repetition
        presence_penalty: 0.1
      };

      this.logger.info('Sending request to OpenAI', { 
        model: openaiRequest.model, 
        tokens: this.maxTokens,
        persona: request.persona
      });

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(openaiRequest)
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error('OpenAI API error', { 
          status: response.status, 
          error: errorData 
        });
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const reply = data.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response right now. Please try again! 💕";

      // Filter output content as well
      const outputFilter = await this.contentFilter.filterContent(reply);
      const finalReply = outputFilter.isAllowed ? reply : "Let me think of a better way to respond to that! ❤️";

      this.logger.info('OpenAI response generated', { 
        inputLength: request.text.length,
        outputLength: finalReply.length,
        tokensUsed: data.usage?.total_tokens
      });

      return {
        reply: finalReply.trim(),
        sessionId: request.sessionId || this.generateSessionId()
      };

    } catch (error) {
      this.logger.error('Error generating OpenAI response', error);
      return {
        reply: "I'm having some technical difficulties right now. Please try again in a moment! 🥰",
        sessionId: request.sessionId || this.generateSessionId()
      };
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}