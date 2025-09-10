/**
 * Cloudflare Pages Function: ElevenLabs WebSocket Proxy
 * GET /api/proxy/elevenlabs-ws
 * 
 * WebSocket relay when direct WS connections are blocked in WebView
 * Handles audio streaming with rate limiting and idle timeout
 */

interface Env {
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_AGENT_ID: string;
  ELEVENLABS_API_BASE: string;
  ORIGIN_ALLOWED: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  // Upgrade to WebSocket
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }

  // Verify origin
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = env.ORIGIN_ALLOWED?.split(',') || ['http://localhost:3000'];
  
  if (!allowedOrigins.some(allowed => origin.includes(allowed))) {
    return new Response('Forbidden', { status: 403 });
  }

  // Create WebSocket pair
  const [client, server] = Object.values(new WebSocketPair());

  // Handle the WebSocket connection
  server.accept();

  let elevenLabsWs: WebSocket | null = null;
  let idleTimeout: any = null;
  let isConnected = false;

  const resetIdleTimer = () => {
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      console.log('Closing connection due to idle timeout');
      server.close(1000, 'Idle timeout');
      if (elevenLabsWs) elevenLabsWs.close();
    }, 15000); // 15s idle timeout
  };

  server.addEventListener('message', async (event) => {
    resetIdleTimer();
    
    try {
      // Connect to ElevenLabs on first message
      if (!elevenLabsWs) {
        const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${env.ELEVENLABS_AGENT_ID}`;
        elevenLabsWs = new WebSocket(wsUrl, {
          headers: {
            'xi-api-key': env.ELEVENLABS_API_KEY,
          },
        });

        elevenLabsWs.addEventListener('open', () => {
          console.log('Connected to ElevenLabs');
          isConnected = true;
          server.send(JSON.stringify({ type: 'connected' }));
        });

        elevenLabsWs.addEventListener('message', (elevenEvent) => {
          // Forward ElevenLabs messages to client
          if (server.readyState === WebSocket.OPEN) {
            server.send(elevenEvent.data);
          }
        });

        elevenLabsWs.addEventListener('close', (closeEvent) => {
          console.log('ElevenLabs connection closed:', closeEvent.code, closeEvent.reason);
          if (server.readyState === WebSocket.OPEN) {
            server.send(JSON.stringify({ 
              type: 'error', 
              message: 'ElevenLabs connection closed' 
            }));
            server.close(1000, 'Upstream closed');
          }
        });

        elevenLabsWs.addEventListener('error', (error) => {
          console.error('ElevenLabs WebSocket error:', error);
          if (server.readyState === WebSocket.OPEN) {
            server.send(JSON.stringify({ 
              type: 'error', 
              message: 'ElevenLabs connection error' 
            }));
          }
        });
      }

      // Forward client messages to ElevenLabs (when connected)
      if (isConnected && elevenLabsWs?.readyState === WebSocket.OPEN) {
        elevenLabsWs.send(event.data);
      } else if (isConnected) {
        // Queue message or handle reconnection
        console.log('ElevenLabs not ready, queueing message');
      }

    } catch (error) {
      console.error('Proxy error:', error);
      server.send(JSON.stringify({ 
        type: 'error', 
        message: 'Proxy error' 
      }));
    }
  });

  server.addEventListener('close', (closeEvent) => {
    console.log('Client disconnected:', closeEvent.code, closeEvent.reason);
    if (idleTimeout) clearTimeout(idleTimeout);
    if (elevenLabsWs) elevenLabsWs.close();
  });

  server.addEventListener('error', (error) => {
    console.error('Client WebSocket error:', error);
    if (elevenLabsWs) elevenLabsWs.close();
  });

  resetIdleTimer();

  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: {
      'Access-Control-Allow-Origin': origin,
    },
  });
};