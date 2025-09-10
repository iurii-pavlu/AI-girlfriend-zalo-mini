/**
 * ElevenLabs WebSocket Proxy
 * Relays audio frames when direct WebSocket connections are blocked
 */

interface Env {
  ELEVENLABS_API_BASE?: string;
  LOG_LEVEL?: string;
  KV?: KVNamespace;
}

const log = (level: 'info' | 'debug' | 'error', message: string, data?: any) => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const levels = { debug: 0, info: 1, error: 2 };
  
  if (levels[level] >= levels[logLevel as keyof typeof levels]) {
    console.log(`[${level.toUpperCase()}] ${message}`, data ? JSON.stringify(data) : '');
  }
};

const userRateLimitCheck = async (kv: KVNamespace | undefined, userId: string): Promise<boolean> => {
  if (!kv) return true;
  
  const key = `rate_limit:proxy:${userId}`;
  const now = Date.now();
  const windowMs = 300000; // 5 minutes
  const maxConnections = 3;
  
  try {
    const data = await kv.get(key, { type: 'json' }) as { count: number; windowStart: number } | null;
    
    if (!data || now - data.windowStart > windowMs) {
      await kv.put(key, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: 600 });
      return true;
    }
    
    if (data.count >= maxConnections) {
      return false;
    }
    
    await kv.put(key, JSON.stringify({ count: data.count + 1, windowStart: data.windowStart }), { expirationTtl: 600 });
    return true;
  } catch (error) {
    log('error', 'User rate limit check failed', { error: error.message });
    return true;
  }
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  // Only handle WebSocket upgrade requests
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('WebSocket connection required', { 
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('target');
    const userId = url.searchParams.get('userId') || 'anonymous';
    
    if (!targetUrl) {
      return new Response('Missing target WebSocket URL', { 
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Validate target URL is ElevenLabs
    const apiBase = env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';
    const expectedDomain = new URL(apiBase).hostname;
    const targetDomain = new URL(targetUrl).hostname;
    
    if (targetDomain !== expectedDomain) {
      log('error', 'Invalid target domain', { targetDomain, expectedDomain });
      return new Response('Invalid target domain', { 
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Per-user rate limiting
    if (!(await userRateLimitCheck(env.KV, userId))) {
      return new Response('Rate limited', { 
        status: 429,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Create WebSocket pair
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    server.accept();
    
    let upstream: WebSocket | null = null;
    let lastActivity = Date.now();
    const IDLE_TIMEOUT = 10000; // 10 seconds as specified
    
    // Connect to upstream ElevenLabs WebSocket
    const connectUpstream = async () => {
      try {
        upstream = new WebSocket(targetUrl);
        
        upstream.addEventListener('open', () => {
          log('debug', 'Upstream connection established', { userId });
          lastActivity = Date.now();
        });
        
        upstream.addEventListener('message', (event) => {
          lastActivity = Date.now();
          if (server.readyState === WebSocket.OPEN) {
            server.send(event.data);
          }
        });
        
        upstream.addEventListener('close', (event) => {
          log('debug', 'Upstream connection closed', { 
            userId, 
            code: event.code, 
            reason: event.reason 
          });
          
          if (server.readyState === WebSocket.OPEN) {
            server.close(event.code, event.reason);
          }
        });
        
        upstream.addEventListener('error', (event) => {
          log('error', 'Upstream connection error', { userId, event });
          
          if (server.readyState === WebSocket.OPEN) {
            server.close(1011, 'Upstream error');
          }
        });
        
      } catch (error) {
        log('error', 'Failed to connect upstream', { userId, error: error.message });
        
        if (server.readyState === WebSocket.OPEN) {
          server.close(1011, 'Connection failed');
        }
      }
    };
    
    // Handle client messages (relay to upstream)
    server.addEventListener('message', (event) => {
      lastActivity = Date.now();
      
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(event.data);
      }
    });
    
    server.addEventListener('close', (event) => {
      log('debug', 'Client connection closed', { 
        userId, 
        code: event.code, 
        reason: event.reason 
      });
      
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.close();
      }
    });
    
    server.addEventListener('error', (event) => {
      log('error', 'Client connection error', { userId, event });
    });
    
    // Idle timeout monitoring
    const monitorIdle = () => {
      const now = Date.now();
      
      if (now - lastActivity > IDLE_TIMEOUT) {
        log('info', 'Connection idle timeout', { userId });
        
        if (server.readyState === WebSocket.OPEN) {
          server.close(1000, 'Idle timeout');
        }
        
        if (upstream && upstream.readyState === WebSocket.OPEN) {
          upstream.close();
        }
        
        return;
      }
      
      // Continue monitoring
      setTimeout(monitorIdle, 1000);
    };
    
    // Start upstream connection and monitoring
    await connectUpstream();
    setTimeout(monitorIdle, 1000);
    
    log('info', 'Proxy connection established', { userId });
    
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
    
  } catch (error) {
    log('error', 'Proxy connection error', { error: error.message });
    
    return new Response('Internal server error', { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};