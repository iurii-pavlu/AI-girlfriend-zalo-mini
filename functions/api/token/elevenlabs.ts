/**
 * Cloudflare Pages Function: ElevenLabs Token Service
 * POST /api/token/elevenlabs
 * 
 * Mints short-lived client tokens for ElevenLabs Realtime API
 * Security: Verifies origin, rate limits, keeps API key server-side
 */

interface Env {
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_AGENT_ID: string;
  ELEVENLABS_API_BASE: string;
  ORIGIN_ALLOWED: string;
  LOG_LEVEL: string;
  KV?: KVNamespace;
}

interface TokenRequest {
  userId: string;
  sessionId?: string;
}

interface TokenResponse {
  token: string;
  ws_url: string;
  expires_at: number;
  agent_id: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  try {
    // Verify origin
    const origin = request.headers.get('origin') || request.headers.get('referer');
    const allowedOrigins = env.ORIGIN_ALLOWED?.split(',') || ['http://localhost:3000'];
    
    if (!origin || !allowedOrigins.some(allowed => origin.includes(allowed))) {
      return new Response('Forbidden', { status: 403 });
    }

    // Parse request
    const body: TokenRequest = await request.json();
    if (!body.userId) {
      return new Response('Missing userId', { status: 400 });
    }

    // Rate limiting check (using KV if available)
    const rateLimitKey = `rate_limit:${body.userId}`;
    if (env.KV) {
      const lastRequest = await env.KV.get(rateLimitKey);
      if (lastRequest) {
        const lastTime = parseInt(lastRequest);
        const now = Date.now();
        if (now - lastTime < 30000) { // 30s cooldown
          return new Response('Rate limited', { status: 429 });
        }
      }
      await env.KV.put(rateLimitKey, Date.now().toString(), { expirationTtl: 60 });
    }

    // Generate ElevenLabs token
    const elevenLabsResponse = await fetch(`${env.ELEVENLABS_API_BASE}/v1/convai/conversation/get_signed_url`, {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: env.ELEVENLABS_AGENT_ID,
      }),
    });

    if (!elevenLabsResponse.ok) {
      console.error('ElevenLabs API error:', await elevenLabsResponse.text());
      return new Response('Token generation failed', { status: 500 });
    }

    const elevenLabsData = await elevenLabsResponse.json();
    
    const response: TokenResponse = {
      token: elevenLabsData.signed_url || elevenLabsData.token,
      ws_url: elevenLabsData.signed_url || `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${env.ELEVENLABS_AGENT_ID}`,
      expires_at: Date.now() + (90 * 1000), // 90 seconds TTL
      agent_id: env.ELEVENLABS_AGENT_ID,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });

  } catch (error) {
    console.error('Token generation error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};

// Handle CORS preflight
export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = env.ORIGIN_ALLOWED?.split(',') || ['http://localhost:3000'];
  
  if (!allowedOrigins.some(allowed => origin.includes(allowed))) {
    return new Response('Forbidden', { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
};