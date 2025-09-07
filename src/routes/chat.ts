import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, ChatRequest, ChatResponse } from '../types';
import { OpenAIClient } from '../services/openai';
import { DatabaseService } from '../services/database';
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
    sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const logger = new Logger(sessionId);

    // Validate input
    if (!body.text || body.text.trim().length === 0) {
      logger.warn('Empty message received');
      return c.json({ error: 'Message text is required' }, 400);
    }

    if (body.text.length > 1000) {
      logger.warn('Message too long', { length: body.text.length });
      return c.json({ error: 'Message too long (max 1000 characters)' }, 400);
    }

    logger.info('Processing chat request', { 
      textLength: body.text.length,
      persona: body.persona || 'caring_girlfriend'
    });

    // Initialize services
    const openai = new OpenAIClient(c.env, sessionId);
    const db = new DatabaseService(c.env, sessionId);

    // Get or create session
    let session = await db.getSession(sessionId);
    if (!session) {
      session = await db.createSession('anonymous', body.persona || 'caring_girlfriend');
      sessionId = session.id;
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
      userMessageLength: body.text.length,
      assistantMessageLength: chatResponse.reply.length,
      persona: session.persona
    });

    const response: ChatResponse = {
      reply: chatResponse.reply,
      sessionId: sessionId
    };

    logger.info('Chat completed successfully', {
      responseLength: chatResponse.reply.length
    });

    return c.json(response);

  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Chat endpoint error', error);
    
    // Return user-friendly error message
    return c.json({ 
      error: 'I\'m having trouble responding right now. Please try again! 💕',
      reply: 'Sorry, I encountered an issue. Please try sending your message again! ❤️',
      sessionId: sessionId
    }, 500);
  }
});

export default chat;