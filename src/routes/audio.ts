import { Hono } from 'hono';
import { Bindings } from '../types';
import { Logger } from '../utils/logger';

const audio = new Hono<{ Bindings: Bindings }>();

// Serve audio files from R2 storage
audio.get('/:filename', async (c) => {
  const filename = c.req.param('filename');
  const logger = new Logger('audio-serve');

  try {
    if (!filename) {
      return c.notFound();
    }

    // Get audio file from R2 storage
    const audioKey = `audio/${filename}`;
    const audioObject = await c.env.R2.get(audioKey);

    if (!audioObject) {
      logger.warn('Audio file not found', { filename });
      return c.notFound();
    }

    // Return audio stream with proper headers
    return new Response(audioObject.body, {
      headers: {
        'Content-Type': audioObject.httpMetadata?.contentType || 'audio/mpeg',
        'Content-Length': audioObject.size.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Accept-Ranges': 'bytes'
      }
    });

  } catch (error) {
    logger.error('Error serving audio file', error);
    return c.notFound();
  }
});

export default audio;