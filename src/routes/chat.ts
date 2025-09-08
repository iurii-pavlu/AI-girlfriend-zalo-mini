import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, ChatRequest, ChatResponse } from '../types';
import { OpenAIClient } from '../services/openai';
import { DatabaseService } from '../services/database';
import { SubscriptionService } from '../services/subscription';
import { MemoryPlusService } from '../services/memory-plus';
import { VietVibesService } from '../services/viet-vibes';
import { Logger } from '../utils/logger';

const chat = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
chat.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
}));

chat.post('/', async (c) => {
  let sessionId = 'anonymous';
  
  try {
    const body = await c.req.json() as ChatRequest;
    const userId = c.req.header('x-user-id') || 'anonymous';
    sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const logger = new Logger(sessionId);

    // Validate input
    if (!body.text || body.text.trim().length === 0) {
      logger.warn('Empty message received');
      return c.json({ error: 'Tin nhắn không được để trống' }, 400);
    }

    if (body.text.length > 1000) {
      logger.warn('Message too long', { length: body.text.length });
      return c.json({ error: 'Tin nhắn quá dài (tối đa 1000 ký tự)' }, 400);
    }

    // Initialize services
    const subService = new SubscriptionService(c.env, userId);
    const openai = new OpenAIClient(c.env, sessionId);
    const db = new DatabaseService(c.env, sessionId);
    const memoryService = new MemoryPlusService(c.env, sessionId);
    const vietVibesService = new VietVibesService(c.env, sessionId);

    // Check subscription status (bypass for demo)
    let subscriptionStatus;
    try {
      subscriptionStatus = await subService.getSubscriptionStatus(userId);
      
      if (!subscriptionStatus.canChat) {
        logger.warn('User cannot chat - subscription limit reached', { userId });
        return c.json({
          error: 'Bạn đã hết lượt tin nhắn miễn phí',
          needsPayment: true,
          showPaywall: true,
          messagesLeft: 0,
          subscriptionStatus
        }, 403);
      }
    } catch (error) {
      // Fallback: Allow chat if subscription service fails
      logger.warn('Subscription service failed, allowing chat', error);
      subscriptionStatus = {
        canChat: true,
        messagesLeft: 10,
        subscriptionType: 'free',
        needsPayment: false,
        showPaywall: false
      };
    }

    logger.info('Processing chat request', { 
      userId,
      textLength: body.text.length,
      persona: body.persona || 'caring_girlfriend',
      messagesLeft: subscriptionStatus.messagesLeft
    });

    // Get or create session (with error handling)
    let session;
    try {
      session = await db.getSession(sessionId);
      if (!session) {
        session = await db.createSession(userId, body.persona || 'caring_girlfriend');
        sessionId = session.id;
      }
    } catch (error) {
      logger.warn('Database session error, using fallback', error);
      // Fallback session
      session = {
        id: sessionId || `session_${Date.now()}`,
        user_id: userId,
        persona: body.persona || 'caring_girlfriend',
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };
      sessionId = session.id;
    }

    // Increment message count for free users (with error handling)
    try {
      if (subscriptionStatus.subscriptionType === 'free') {
        await subService.incrementMessageCount(userId);
      }
    } catch (error) {
      logger.warn('Failed to increment message count', error);
    }

    // Save user message (with error handling)
    try {
      await db.saveMessage(sessionId, body.text, 'user');
    } catch (error) {
      logger.warn('Failed to save user message', error);
    }

    // Check OpenAI API key
    if (!c.env.OPENAI_API_KEY) {
      logger.error('OpenAI API key not configured');
      throw new Error('OpenAI API key missing');
    }

    // Generate AI response with Memory Plus + Viet Vibes enhancement
    let chatResponse;
    try {
      // Analyze Vietnamese linguistic patterns in user input
      const vietAnalysis = await vietVibesService.analyzeVietnamesePatterns(body.text, userId);
      
      // Process conversation for memories (extract important info from user message)
      await memoryService.processConversationForMemories(userId, body.text, '');
      
      // Update relationship stage
      const relationshipStage = await memoryService.updateRelationshipStage(sessionId, userId);
      
      // Update Viet Vibes preferences based on detected patterns
      await vietVibesService.updatePreferencesFromUsage(userId, vietAnalysis);
      
      // Generate Viet Vibes + Memory enhanced response
      chatResponse = await openai.generateResponseWithMemoryAndVibes({
        text: body.text,
        sessionId: sessionId,
        persona: session.persona,
        userId: userId,
        memoryService: memoryService,
        vietVibesService: vietVibesService,
        relationshipStage: relationshipStage,
        vietAnalysis: vietAnalysis
      });
      
      // After AI response, store any new memories from the conversation
      await memoryService.processConversationForMemories(userId, body.text, chatResponse.reply);
      
      logger.info('Memory Plus + Viet Vibes enhanced response', {
        relationshipStage,
        memoriesUsed: true,
        vietRegion: vietAnalysis.detectedRegion,
        emotionalTone: vietAnalysis.emotionalTone,
        culturalRefs: vietAnalysis.culturalReferences.length
      });
      
    } catch (enhancementError) {
      logger.warn('Enhanced services failed, falling back to basic response', enhancementError);
      
      // Fallback to basic response if enhanced services fail
      chatResponse = await openai.generateResponse({
        text: body.text,
        sessionId: sessionId,
        persona: session.persona
      });
    }

    // Save assistant message (with error handling)
    try {
      await db.saveMessage(sessionId, chatResponse.reply, 'assistant');
    } catch (error) {
      logger.warn('Failed to save assistant message', error);
    }

    // Log analytics (with error handling)
    try {
      await db.logEvent(sessionId, 'chat_message', {
        userId,
        userMessageLength: body.text.length,
        assistantMessageLength: chatResponse.reply.length,
        persona: session.persona,
        subscriptionType: subscriptionStatus.subscriptionType
      });
    } catch (error) {
      logger.warn('Failed to log analytics', error);
    }

    // Get updated subscription status (with error handling)
    let newStatus = subscriptionStatus;
    try {
      newStatus = await subService.getSubscriptionStatus(userId);
    } catch (error) {
      logger.warn('Failed to get updated subscription status', error);
    }

    const response = {
      reply: chatResponse.reply,
      sessionId: sessionId,
      subscriptionStatus: newStatus,
      showPaywall: newStatus.showPaywall
    };

    logger.info('Chat completed successfully', {
      responseLength: chatResponse.reply.length,
      newMessagesLeft: newStatus.messagesLeft
    });

    return c.json(response);

  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Chat endpoint error', {
      error: error.message,
      stack: error.stack,
      userId
    });
    
    // Return user-friendly error message
    return c.json({ 
      error: 'Em đang gặp khó khăn trong việc phản hồi. Anh thử lại nhé! 💕',
      reply: 'Xin lỗi anh, em gặp sự cố. Anh gửi lại tin nhắn được không! ❤️',
      sessionId: sessionId
    }, 500);
  }
});

export default chat;