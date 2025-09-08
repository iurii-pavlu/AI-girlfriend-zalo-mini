import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, MessageRequest, MessageResponse } from '../types';
import { OpenAIClient } from '../services/openai';
import { GoogleCloudClient } from '../services/google-cloud';
import { DatabaseService } from '../services/database';
import { Logger } from '../utils/logger';
import { isValidAudioFormat, validateAudioSize, generateAudioFilename } from '../utils/audio';

const message = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
message.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
  maxAge: 3600
}));

message.post('/', async (c) => {
  let sessionId = c.req.header('x-session-id') || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const logger = new Logger(sessionId);

  try {
    const contentType = c.req.header('content-type') || '';
    let userText = '';

    // Handle both text and audio inputs
    if (contentType.includes('application/json')) {
      // Text input
      const body = await c.req.json() as MessageRequest;
      userText = body.text || '';
      sessionId = body.sessionId || sessionId;
    } else if (isValidAudioFormat(contentType)) {
      // Audio input
      const audioBuffer = await c.req.arrayBuffer();
      
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return c.json({ error: 'No audio data received' }, 400);
      }

      // Validate audio size
      const isValidSize = await validateAudioSize(audioBuffer, 5);
      if (!isValidSize) {
        return c.json({ error: 'Audio file too large (max 5MB)' }, 400);
      }

      // Convert speech to text
      const googleClient = new GoogleCloudClient(c.env, sessionId);
      const sttResult = await googleClient.speechToText(audioBuffer);
      userText = sttResult.text;

      logger.info('Audio converted to text', { 
        audioSize: audioBuffer.byteLength,
        textLength: userText.length,
        confidence: sttResult.confidence
      });
    } else {
      return c.json({ error: 'Invalid content type. Send JSON with text or audio data' }, 400);
    }

    // Validate text
    if (!userText || userText.trim().length === 0) {
      return c.json({ 
        error: 'No text to process',
        text: '',
        audioUrl: '',
        sessionId: sessionId
      }, 400);
    }

    logger.info('Processing complete message pipeline', { 
      textLength: userText.length,
      sessionId 
    });

    // Initialize services
    const openai = new OpenAIClient(c.env, sessionId);
    const googleClient = new GoogleCloudClient(c.env, sessionId);
    const db = new DatabaseService(c.env, sessionId);

    // Get or create session
    let session = await db.getSession(sessionId);
    if (!session) {
      session = await db.createSession('anonymous', 'caring_girlfriend');
      sessionId = session.id;
    }

    // Save user message
    await db.saveMessage(sessionId, userText, 'user', contentType.includes('audio') ? 'voice' : 'text');

    // Generate AI response
    const chatResponse = await openai.generateResponse({
      text: userText,
      sessionId: sessionId,
      persona: session.persona
    });

    // Convert response to speech
    const audioBuffer = await googleClient.textToSpeech({
      text: chatResponse.reply
    });

    // Store audio in R2 (Cloudflare object storage)
    const audioFilename = generateAudioFilename();
    await c.env.R2.put(audioFilename, audioBuffer, {
      httpMetadata: {
        contentType: 'audio/mpeg'
      }
    });

    // Generate public URL for audio
    const audioUrl = `${c.env.APP_BASE_URL}/audio/${audioFilename}`;

    // Save assistant message with audio URL
    await db.saveMessage(sessionId, chatResponse.reply, 'assistant', 'voice', audioUrl);

    // Log analytics
    await db.logEvent(sessionId, 'complete_message_pipeline', {
      userTextLength: userText.length,
      assistantTextLength: chatResponse.reply.length,
      audioSize: audioBuffer.byteLength,
      inputType: contentType.includes('audio') ? 'voice' : 'text'
    });

    const response: MessageResponse = {
      text: chatResponse.reply,
      audioUrl: audioUrl,
      sessionId: sessionId
    };

    logger.info('Complete message pipeline completed successfully', {
      responseTextLength: chatResponse.reply.length,
      audioSize: audioBuffer.byteLength,
      audioUrl: audioUrl
    });

    return c.json(response);

  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Message endpoint error', error);
    
    // Return user-friendly error response
    return c.json({ 
      error: 'Em đang gặp khó khăn. Anh thử lại nhé! 💕',
      text: 'Xin lỗi anh, em gặp sự cố. Anh thử lại được không! ❤️',
      audioUrl: '',
      sessionId: sessionId
    }, 500);
  }
});

export default message;