import { Bindings, ChatRequest, ChatResponse } from '../types';
import { Logger } from '../utils/logger';
import { ContentFilter } from './content-filter';
import { MemoryPlusService } from './memory-plus';
import { VietVibesService } from './viet-vibes';

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
          reply: "Em muốn chúng ta nói chuyện tích cực và phù hợp hơn. Chúng ta nói về chủ đề khác nhé anh? ❤️",
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
      const reply = data.choices?.[0]?.message?.content || "Em xin lỗi, em không thể tạo phản hồi ngay bây giờ. Anh thử lại nhé! 💕";

      // Filter output content as well
      const outputFilter = await this.contentFilter.filterContent(reply);
      const finalReply = outputFilter.isAllowed ? reply : "Để em suy nghĩ cách trả lời hay hơn nhé! ❤️";

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
        reply: "Em đang gặp một chút khó khăn kỹ thuật. Anh thử lại sau một chút nhé! 🥰",
        sessionId: request.sessionId || this.generateSessionId()
      };
    }
  }

  // Generate memory-enhanced response using Memory Plus service
  async generateResponseWithMemory(request: ChatRequest & { 
    userId: string, 
    memoryService: MemoryPlusService 
  }): Promise<ChatResponse> {
    try {
      // Filter input content
      const filterResult = await this.contentFilter.filterContent(request.text);
      if (!filterResult.isAllowed) {
        return {
          reply: "Em muốn chúng ta nói chuyện tích cực và phù hợp hơn. Chúng ta nói về chủ đề khác nhé anh? ❤️",
          sessionId: request.sessionId || this.generateSessionId()
        };
      }

      // Get base system prompt
      const baseSystemPrompt = this.contentFilter.generateSystemPrompt(request.persona);
      
      // Enhance prompt with memory context
      const memoryEnhancedPrompt = await request.memoryService.generateMemoryEnhancedPrompt(
        request.userId, 
        baseSystemPrompt
      );

      // Prepare OpenAI request with enhanced prompt
      const openaiRequest = {
        model: 'gpt-4o-mini', // Cost-effective model
        messages: [
          { role: 'system', content: memoryEnhancedPrompt },
          { role: 'user', content: request.text }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.8, // Creative but consistent
        frequency_penalty: 0.3, // Reduce repetition
        presence_penalty: 0.1
      };

      this.logger.info('Sending memory-enhanced request to OpenAI', { 
        model: openaiRequest.model, 
        tokens: this.maxTokens,
        persona: request.persona,
        hasMemoryContext: true
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
        this.logger.error('OpenAI API error (memory-enhanced)', { 
          status: response.status, 
          error: errorData 
        });
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const reply = data.choices?.[0]?.message?.content || "Em xin lỗi, em không thể tạo phản hồi ngay bây giờ. Anh thử lại nhé! 💕";

      // Filter output content
      const outputFilter = await this.contentFilter.filterContent(reply);
      const finalReply = outputFilter.isAllowed ? reply : "Để em suy nghĩ cách trả lời hay hơn nhé! ❤️";

      this.logger.info('Memory-enhanced response generated', { 
        inputLength: request.text.length,
        outputLength: finalReply.length,
        tokensUsed: data.usage?.total_tokens,
        memoryEnhanced: true
      });

      return {
        reply: finalReply.trim(),
        sessionId: request.sessionId || this.generateSessionId()
      };

    } catch (error) {
      this.logger.error('Error generating memory-enhanced response', error);
      throw error; // Re-throw to allow fallback in chat route
    }
  }

  // Generate response with both Memory Plus and Viet Vibes enhancement
  async generateResponseWithMemoryAndVibes(request: ChatRequest & {
    userId: string,
    memoryService: MemoryPlusService,
    vietVibesService: VietVibesService,
    relationshipStage: string,
    vietAnalysis: any
  }): Promise<ChatResponse> {
    try {
      // Filter input content
      const filterResult = await this.contentFilter.filterContent(request.text);
      if (!filterResult.isAllowed) {
        // Use Vietnamese culturally appropriate rejection
        const pronouns = await request.vietVibesService.getPronouns(request.userId, request.relationshipStage);
        return {
          reply: `${pronouns.self} muốn chúng ta nói chuyện tích cực và phù hợp hơn. Chúng ta nói về chủ đề khác nhé ${pronouns.other}? ❤️`,
          sessionId: request.sessionId || this.generateSessionId()
        };
      }

      // Get base system prompt
      const baseSystemPrompt = this.contentFilter.generateSystemPrompt(request.persona);
      
      // Enhance prompt with Memory Plus context
      const memoryEnhancedPrompt = await request.memoryService.generateMemoryEnhancedPrompt(
        request.userId, 
        baseSystemPrompt
      );
      
      // Further enhance with Viet Vibes cultural context
      const fullEnhancedPrompt = await request.vietVibesService.generateVietVibesPrompt(
        request.userId,
        memoryEnhancedPrompt,
        request.relationshipStage,
        request.vietAnalysis.emotionalTone
      );

      // Prepare OpenAI request with both enhancements
      const openaiRequest = {
        model: 'gpt-4o-mini', // Cost-effective model
        messages: [
          { role: 'system', content: fullEnhancedPrompt },
          { role: 'user', content: request.text }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.85, // Slightly higher for more Vietnamese cultural creativity
        frequency_penalty: 0.3, // Reduce repetition
        presence_penalty: 0.2, // Encourage diverse Vietnamese expressions
        top_p: 0.9 // Focus on most probable Vietnamese responses
      };

      this.logger.info('Sending Memory Plus + Viet Vibes enhanced request to OpenAI', { 
        model: openaiRequest.model, 
        tokens: this.maxTokens,
        persona: request.persona,
        hasMemoryContext: true,
        hasVietVibes: true,
        relationshipStage: request.relationshipStage,
        vietRegion: request.vietAnalysis.detectedRegion,
        emotionalTone: request.vietAnalysis.emotionalTone
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
        this.logger.error('OpenAI API error (Memory + Viet Vibes)', { 
          status: response.status, 
          error: errorData 
        });
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as any;
      let reply = data.choices?.[0]?.message?.content || "Em xin lỗi, em không thể tạo phản hồi ngay bây giờ. Anh thử lại nhé! 💕";

      // Post-process reply for Vietnamese authenticity
      reply = await this.postProcessVietnameseResponse(reply, request.vietVibesService, request.userId, request.relationshipStage);

      // Filter output content
      const outputFilter = await this.contentFilter.filterContent(reply);
      const finalReply = outputFilter.isAllowed ? reply : "Để em suy nghĩ cách trả lời hay hơn nhé anh yêu! ❤️";

      this.logger.info('Memory Plus + Viet Vibes response generated', { 
        inputLength: request.text.length,
        outputLength: finalReply.length,
        tokensUsed: data.usage?.total_tokens,
        memoryEnhanced: true,
        vietVibesEnhanced: true,
        relationshipStage: request.relationshipStage
      });

      return {
        reply: finalReply.trim(),
        sessionId: request.sessionId || this.generateSessionId()
      };

    } catch (error) {
      this.logger.error('Error generating Memory Plus + Viet Vibes response', error);
      throw error; // Re-throw to allow fallback in chat route
    }
  }

  // Post-process response to ensure Vietnamese authenticity
  private async postProcessVietnameseResponse(
    reply: string, 
    vietVibesService: VietVibesService, 
    userId: string, 
    relationshipStage: string
  ): Promise<string> {
    try {
      // Get appropriate pronouns for consistency check
      const pronouns = await vietVibesService.getPronouns(userId, relationshipStage);
      
      // Simple post-processing to ensure Vietnamese authenticity
      let processedReply = reply;
      
      // Ensure proper Vietnamese pronouns are used
      if (!processedReply.includes(pronouns.self) && !processedReply.includes('em')) {
        // If no Vietnamese pronouns detected, add them naturally
        processedReply = processedReply.replace(/^/, `${pronouns.self} `);
      }
      
      // Ensure Vietnamese sentence endings
      if (!processedReply.match(/[nhé|nha|ạ|đấy|ha]\s*[!.?]*\s*$/)) {
        // Add appropriate Vietnamese ending based on relationship stage
        const endings = {
          'new': 'ạ',
          'getting_to_know': 'nhé', 
          'close': 'nha',
          'intimate': 'nha',
          'long_term': 'ơi'
        };
        const ending = endings[relationshipStage] || 'nhé';
        
        // Replace final punctuation with Vietnamese ending
        processedReply = processedReply.replace(/[!.?]\s*$/, ` ${ending}! `);
      }
      
      return processedReply;
      
    } catch (error) {
      // If post-processing fails, return original reply
      return reply;
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}