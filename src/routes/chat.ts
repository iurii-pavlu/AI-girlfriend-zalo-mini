import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, ChatRequest, ChatResponse } from '../types';
import { OpenAIClient } from '../services/openai';
import { DatabaseService } from '../services/database';
import { SubscriptionService } from '../services/subscription';
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

    // Check subscription status
    const subscriptionStatus = await subService.getSubscriptionStatus(userId);
    
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

    logger.info('Processing chat request', { 
      userId,
      textLength: body.text.length,
      persona: body.persona || 'caring_girlfriend',
      messagesLeft: subscriptionStatus.messagesLeft
    });

    // Get or create session
    let session = await db.getSession(sessionId);
    if (!session) {
      session = await db.createSession(userId, body.persona || 'caring_girlfriend');
      sessionId = session.id;
    }

    // Increment message count for free users
    if (subscriptionStatus.subscriptionType === 'free') {
      await subService.incrementMessageCount(userId);
    }

    // Save user message
    await db.saveMessage(sessionId, body.text, 'user');

    // Generate AI response
    const chatResponse = await openai.generateResponse({
      text: body.text,
      sessionId: sessionId,
      persona: session.persona
    });

    // Save assistant message
    await db.saveMessage(sessionId, chatResponse.reply, 'assistant');

    // Log analytics
    await db.logEvent(sessionId, 'chat_message', {
      userId,
      userMessageLength: body.text.length,
      assistantMessageLength: chatResponse.reply.length,
      persona: session.persona,
      subscriptionType: subscriptionStatus.subscriptionType
    });

    // Get updated subscription status
    const newStatus = await subService.getSubscriptionStatus(userId);

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
    logger.error('Chat endpoint error', error);
    
    // Return user-friendly error message
    return c.json({ 
      error: 'Em đang gặp khó khăn trong việc phản hồi. Anh thử lại nhé! 💕',
      reply: 'Xin lỗi anh, em gặp sự cố. Anh gửi lại tin nhắn được không! ❤️',
      sessionId: sessionId
    }, 500);
  }
});

export default chat;