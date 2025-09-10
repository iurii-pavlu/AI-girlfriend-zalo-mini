/**
 * ElevenLabs Webhooks Handler
 * Handles transcription.completed and voice.removal.notice events with HMAC verification
 */

interface Env {
  ELEVENLABS_WEBHOOK_SECRET: string;
  LOG_LEVEL?: string;
  KV?: KVNamespace;
  DB?: D1Database;
}

interface WebhookEvent {
  id: string;
  type: 'transcription.completed' | 'voice.removal.notice';
  created_at: string;
  data: any;
}

interface TranscriptionCompletedData {
  transcription_id: string;
  user_id?: string;
  call_id?: string;
  transcript: string;
  language: string;
  duration: number;
  confidence: number;
  audio_url?: string;
}

interface VoiceRemovalNoticeData {
  voice_id: string;
  voice_name?: string;
  removal_date: string;
  reason: string;
}

const log = (level: 'info' | 'debug' | 'error', message: string, data?: any) => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const levels = { debug: 0, info: 1, error: 2 };
  
  if (levels[level] >= levels[logLevel as keyof typeof levels]) {
    // Don't log full webhook data to avoid secrets in logs
    const safeData = data ? (typeof data === 'object' ? { ...data, secret: '[REDACTED]' } : data) : undefined;
    console.log(`[${level.toUpperCase()}] ${message}`, safeData ? JSON.stringify(safeData) : '');
  }
};

const verifyHmacSignature = async (
  body: string, 
  signature: string, 
  secret: string
): Promise<boolean> => {
  try {
    // Remove 'sha256=' prefix if present
    const cleanSignature = signature.replace(/^sha256=/, '');
    
    // Create HMAC
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(body);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Constant time comparison
    return cleanSignature === computedSignature;
    
  } catch (error) {
    log('error', 'HMAC verification failed', { error: error.message });
    return false;
  }
};

const ensureIdempotency = async (
  kv: KVNamespace | undefined, 
  eventId: string
): Promise<boolean> => {
  if (!kv) return true; // Skip if KV not available
  
  const key = `webhook_processed:${eventId}`;
  
  try {
    const existing = await kv.get(key);
    
    if (existing) {
      log('debug', 'Webhook already processed', { eventId });
      return false; // Already processed
    }
    
    // Mark as processed (24 hour expiration)
    await kv.put(key, '1', { expirationTtl: 86400 });
    return true; // Process this event
    
  } catch (error) {
    log('error', 'Idempotency check failed', { error: error.message });
    return true; // Process on error
  }
};

const handleTranscriptionCompleted = async (
  data: TranscriptionCompletedData,
  env: Env
): Promise<void> => {
  try {
    log('info', 'Processing transcription completed', {
      transcriptionId: data.transcription_id,
      userId: data.user_id,
      callId: data.call_id,
      language: data.language,
      duration: data.duration,
      transcriptLength: data.transcript?.length || 0
    });
    
    // Store transcript in KV for fast retrieval
    if (env.KV) {
      const kvKey = `transcript:${data.transcription_id}`;
      const transcriptData = {
        id: data.transcription_id,
        userId: data.user_id,
        callId: data.call_id,
        transcript: data.transcript,
        language: data.language,
        duration: data.duration,
        confidence: data.confidence,
        createdAt: new Date().toISOString(),
        processed: true
      };
      
      await env.KV.put(kvKey, JSON.stringify(transcriptData), {
        expirationTtl: 2592000 // 30 days
      });
    }
    
    // Store in D1 for persistent analytics
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO transcriptions (
            id, user_id, call_id, transcript, language, 
            duration, confidence, audio_url, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.transcription_id,
          data.user_id || null,
          data.call_id || null,
          data.transcript,
          data.language,
          data.duration,
          data.confidence,
          data.audio_url || null,
          new Date().toISOString()
        ).run();
        
        log('info', 'Transcript stored in database', { transcriptionId: data.transcription_id });
        
      } catch (dbError) {
        log('error', 'Failed to store transcript in database', { 
          transcriptionId: data.transcription_id,
          error: dbError.message 
        });
      }
    }
    
    // Trigger moment creation (async via KV flag)
    if (env.KV && data.user_id && data.call_id) {
      const momentTriggerKey = `moment_trigger:${data.call_id}`;
      const momentData = {
        callId: data.call_id,
        userId: data.user_id,
        transcriptionId: data.transcription_id,
        transcript: data.transcript,
        duration: data.duration,
        language: data.language,
        createdAt: new Date().toISOString()
      };
      
      await env.KV.put(momentTriggerKey, JSON.stringify(momentData), {
        expirationTtl: 86400 // 24 hours
      });
      
      log('debug', 'Moment creation triggered', { callId: data.call_id });
    }
    
  } catch (error) {
    log('error', 'Failed to handle transcription completed', {
      transcriptionId: data.transcription_id,
      error: error.message
    });
    throw error;
  }
};

const handleVoiceRemovalNotice = async (
  data: VoiceRemovalNoticeData,
  env: Env
): Promise<void> => {
  try {
    log('info', 'Processing voice removal notice', {
      voiceId: data.voice_id,
      voiceName: data.voice_name,
      removalDate: data.removal_date,
      reason: data.reason
    });
    
    // Mark voice for cleanup in KV
    if (env.KV) {
      const cleanupKey = `voice_cleanup:${data.voice_id}`;
      const cleanupData = {
        voiceId: data.voice_id,
        voiceName: data.voice_name,
        removalDate: data.removal_date,
        reason: data.reason,
        markedAt: new Date().toISOString()
      };
      
      await env.KV.put(cleanupKey, JSON.stringify(cleanupData), {
        expirationTtl: 2592000 // Keep for 30 days
      });
    }
    
    // Log to database for audit trail
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO voice_cleanup_log (
            voice_id, voice_name, removal_date, reason, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          data.voice_id,
          data.voice_name || null,
          data.removal_date,
          data.reason,
          new Date().toISOString()
        ).run();
        
      } catch (dbError) {
        log('error', 'Failed to log voice removal', { 
          voiceId: data.voice_id,
          error: dbError.message 
        });
      }
    }
    
    // TODO: Remove local references to this voice
    // This would involve cleaning up any cached audio or references
    
  } catch (error) {
    log('error', 'Failed to handle voice removal notice', {
      voiceId: data.voice_id,
      error: error.message
    });
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  try {
    // Validate webhook secret is configured
    if (!env.ELEVENLABS_WEBHOOK_SECRET) {
      log('error', 'ELEVENLABS_WEBHOOK_SECRET not configured');
      return new Response('Webhook not configured', { status: 500 });
    }
    
    // Get raw body for HMAC verification
    const body = await request.text();
    const signature = request.headers.get('ElevenLabs-Signature');
    
    if (!signature) {
      log('error', 'Missing ElevenLabs-Signature header');
      return new Response('Missing signature', { status: 400 });
    }
    
    // Verify HMAC signature
    const isValid = await verifyHmacSignature(body, signature, env.ELEVENLABS_WEBHOOK_SECRET);
    
    if (!isValid) {
      log('error', 'Invalid webhook signature');
      return new Response('Invalid signature', { status: 401 });
    }
    
    // Parse webhook event
    let event: WebhookEvent;
    try {
      event = JSON.parse(body);
    } catch (parseError) {
      log('error', 'Invalid webhook JSON', { error: parseError.message });
      return new Response('Invalid JSON', { status: 400 });
    }
    
    // Ensure idempotency
    if (!(await ensureIdempotency(env.KV, event.id))) {
      log('debug', 'Duplicate webhook event ignored', { eventId: event.id });
      return new Response('OK', { status: 200 });
    }
    
    log('info', 'Processing webhook event', { 
      eventId: event.id, 
      eventType: event.type,
      createdAt: event.created_at
    });
    
    // Handle different event types
    switch (event.type) {
      case 'transcription.completed':
        await handleTranscriptionCompleted(event.data as TranscriptionCompletedData, env);
        break;
        
      case 'voice.removal.notice':
        await handleVoiceRemovalNotice(event.data as VoiceRemovalNoticeData, env);
        break;
        
      default:
        log('info', 'Unhandled webhook event type', { eventType: event.type });
    }
    
    // Return 200 fast as specified
    return new Response('OK', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
    
  } catch (error) {
    log('error', 'Webhook processing error', { error: error.message });
    
    // Return 200 to prevent retries for processing errors
    return new Response('Processing error', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};