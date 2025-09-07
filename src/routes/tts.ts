import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, TTSRequest } from '../types';
import { GoogleCloudClient } from '../services/google-cloud';
import { DatabaseService } from '../services/database';
import { Logger } from '../utils/logger';

const tts = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
tts.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
}));

tts.post('/', async (c) => {
  const sessionId = c.req.header('x-session-id') || 'anonymous';
  const logger = new Logger(sessionId);

  try {
    const body = await c.req.json() as TTSRequest;

    // Validate input
    if (!body.text || body.text.trim().length === 0) {
      logger.warn('Empty text received for TTS');
      return c.json({ error: 'Text is required for speech synthesis' }, 400);
    }

    if (body.text.length > 500) {
      logger.warn('Text too long for TTS', { length: body.text.length });
      return c.json({ error: 'Text too long for speech synthesis (max 500 characters)' }, 400);
    }

    logger.info('Processing TTS request', { 
      textLength: body.text.length,
      voiceId: body.voiceId
    });

    // Initialize services
    const googleClient = new GoogleCloudClient(c.env, sessionId);
    const db = new DatabaseService(c.env, sessionId);

    // Get voice settings for session if available
    let voiceId = body.voiceId;
    let speakingRate = body.speakingRate;

    if (sessionId !== 'anonymous') {
      const voiceSettings = await db.getVoiceSettings(sessionId);
      if (voiceSettings) {
        voiceId = voiceId || voiceSettings.voice_id;
        speakingRate = speakingRate ?? voiceSettings.speaking_rate;
      }
    }

    // Generate speech audio
    const audioBuffer = await googleClient.textToSpeech({
      text: body.text,
      voiceId: voiceId,
      speakingRate: speakingRate
    });

    // Log analytics
    await db.logEvent(sessionId, 'tts_request', {
      textLength: body.text.length,
      voiceId: voiceId,
      speakingRate: speakingRate,
      audioSize: audioBuffer.byteLength
    });

    logger.info('TTS completed successfully', {
      audioSize: audioBuffer.byteLength
    });

    // Return audio stream with proper headers
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Duration': '5000', // Estimated duration in milliseconds
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });

  } catch (error) {
    logger.error('TTS endpoint error', error);
    
    // Return empty audio response on error
    const emptyAudio = new ArrayBuffer(0);
    return new Response(emptyAudio, {
      status: 500,
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Error': 'Speech synthesis failed'
      }
    });
  }
});

export default tts;