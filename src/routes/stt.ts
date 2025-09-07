import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, STTResponse } from '../types';
import { GoogleCloudClient } from '../services/google-cloud';
import { DatabaseService } from '../services/database';
import { Logger } from '../utils/logger';
import { isValidAudioFormat, validateAudioSize } from '../utils/audio';

const stt = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
stt.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
}));

stt.post('/', async (c) => {
  const sessionId = c.req.header('x-session-id') || 'anonymous';
  const logger = new Logger(sessionId);

  try {
    // Get audio data from request body
    const contentType = c.req.header('content-type') || '';
    
    if (!isValidAudioFormat(contentType)) {
      logger.warn('Invalid audio format', { contentType });
      return c.json({ 
        error: 'Invalid audio format. Supported formats: webm, wav, mp3, ogg' 
      }, 400);
    }

    const audioBuffer = await c.req.arrayBuffer();
    
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      logger.warn('Empty audio data received');
      return c.json({ error: 'No audio data received' }, 400);
    }

    // Validate audio size (max 5MB)
    const isValidSize = await validateAudioSize(audioBuffer, 5);
    if (!isValidSize) {
      logger.warn('Audio file too large', { size: audioBuffer.byteLength });
      return c.json({ error: 'Audio file too large (max 5MB)' }, 400);
    }

    logger.info('Processing STT request', { 
      audioSize: audioBuffer.byteLength,
      contentType 
    });

    // Initialize services
    const googleClient = new GoogleCloudClient(c.env, sessionId);
    const db = new DatabaseService(c.env, sessionId);

    // Convert speech to text
    const sttResult = await googleClient.speechToText(audioBuffer);

    // Log analytics
    await db.logEvent(sessionId, 'stt_request', {
      audioSize: audioBuffer.byteLength,
      confidence: sttResult.confidence,
      textLength: sttResult.text.length
    });

    const response: STTResponse = {
      text: sttResult.text,
      confidence: sttResult.confidence
    };

    logger.info('STT completed successfully', {
      textLength: sttResult.text.length,
      confidence: sttResult.confidence
    });

    return c.json(response);

  } catch (error) {
    logger.error('STT endpoint error', error);
    
    // Return user-friendly error message
    return c.json({ 
      error: 'Speech recognition failed. Please try again.',
      text: '',
      confidence: 0
    }, 500);
  }
});

export default stt;