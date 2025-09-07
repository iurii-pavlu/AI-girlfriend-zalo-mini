import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/cloudflare-workers';
import { Bindings } from './types';

// Import route handlers
import stt from './routes/stt';
import chat from './routes/chat';
import tts from './routes/tts';
import message from './routes/message';
import audio from './routes/audio';

// Import video call placeholder
import { VideoCallManager, IMPLEMENTATION_ROADMAP } from './realtime/placeholder';

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use('*', logger());

// Serve static files from public directory
app.use('/static/*', serveStatic({ root: './public' }));

// Global CORS for API routes
app.use('/api/*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env?.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'https://miniapp.zalo.me'
    ];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
  maxAge: 3600
}));

// API Routes
app.route('/api/stt', stt);           // Speech-to-text endpoint
app.route('/api/chat', chat);         // Text chat endpoint  
app.route('/api/tts', tts);           // Text-to-speech endpoint
app.route('/api/message', message);   // Complete pipeline endpoint
app.route('/audio', audio);           // Audio file serving

// Video call placeholder endpoint
app.get('/api/video-call/capabilities', (c) => {
  const manager = new VideoCallManager('system');
  return c.json({
    capabilities: manager.getCapabilities(),
    specs: manager.getTechnicalSpecs(),
    roadmap: IMPLEMENTATION_ROADMAP
  });
});

app.post('/api/video-call/start', (c) => {
  return c.json({
    error: 'Video calling feature coming soon! 🎬✨',
    message: 'This feature is planned for future releases. Stay tuned!'
  }, 501); // Not Implemented
});

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'AI Girlfriend Zalo Mini App',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Main application route
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Girlfriend - Zalo Mini App</title>
        <meta name="description" content="Your caring AI girlfriend companion with voice chat">
        
        <!-- Zalo Mini App optimizations -->
        <meta name="format-detection" content="telephone=no">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="default">
        
        <!-- Styles -->
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/style.css" rel="stylesheet">
        
        <!-- Tailwind Configuration -->
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  'girlfriend': {
                    50: '#fdf2f8',
                    100: '#fce7f3',
                    200: '#fbcfe8',
                    300: '#f9a8d4',
                    400: '#f472b6',
                    500: '#ec4899',
                    600: '#db2777',
                    700: '#be185d',
                    800: '#9d174d',
                    900: '#831843'
                  }
                },
                fontFamily: {
                  'inter': ['Inter', 'system-ui', 'sans-serif']
                }
              }
            }
          }
        </script>
        
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          
          body {
            font-family: 'Inter', system-ui, sans-serif;
            overscroll-behavior: none;
            -webkit-overflow-scrolling: touch;
            touch-action: manipulation;
          }
          
          /* Zalo Mini App specific optimizations */
          .zalo-safe-area {
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
          }
          
          /* Custom scrollbar for Telegram-like feel */
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 2px;
          }
        </style>
    </head>
    <body class="bg-gray-50 overflow-hidden zalo-safe-area">
        <!-- App Container -->
        <div id="app" class="flex flex-col h-screen max-h-screen">
            <!-- Loading State -->
            <div id="loading" class="flex items-center justify-center h-screen bg-gradient-to-br from-girlfriend-400 to-girlfriend-600">
                <div class="text-center text-white">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <h2 class="text-xl font-semibold">AI Girlfriend</h2>
                    <p class="text-girlfriend-100 mt-2">Connecting to your companion...</p>
                </div>
            </div>
            
            <!-- Main App (hidden initially) -->
            <div id="main-app" class="hidden flex flex-col h-full">
                <!-- Header -->
                <div class="bg-gradient-to-r from-girlfriend-500 to-girlfriend-600 text-white p-4 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                <i class="fas fa-heart text-lg"></i>
                            </div>
                            <div>
                                <h1 class="font-semibold text-lg">Your AI Girlfriend</h1>
                                <p class="text-girlfriend-100 text-sm" id="status">Online • Caring Mode</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <button id="video-call-btn" class="p-2 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20 transition-colors">
                                <i class="fas fa-video"></i>
                            </button>
                            <button id="settings-btn" class="p-2 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20 transition-colors">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Chat Area -->
                <div id="chat-container" class="flex-1 overflow-hidden bg-gray-50">
                    <div id="messages" class="h-full overflow-y-auto custom-scrollbar p-4 space-y-3">
                        <!-- Messages will be inserted here -->
                    </div>
                </div>
                
                <!-- Input Area -->
                <div class="bg-white border-t border-gray-200 p-4">
                    <div class="flex items-center space-x-2">
                        <button id="voice-btn" class="p-3 rounded-full bg-girlfriend-100 text-girlfriend-600 hover:bg-girlfriend-200 transition-colors">
                            <i class="fas fa-microphone"></i>
                        </button>
                        <div class="flex-1 flex items-center bg-gray-100 rounded-full px-4 py-2">
                            <input 
                                id="message-input" 
                                type="text" 
                                placeholder="Type your message..." 
                                class="flex-1 bg-transparent outline-none text-gray-700"
                                maxlength="1000"
                            >
                        </div>
                        <button id="send-btn" class="p-3 rounded-full bg-girlfriend-500 text-white hover:bg-girlfriend-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    
                    <!-- Voice Recording Indicator -->
                    <div id="voice-recording" class="hidden mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div class="flex items-center justify-center space-x-3">
                            <div class="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                            <span class="text-red-700 font-medium">Recording...</span>
                            <span class="text-red-600 text-sm" id="recording-time">0:00</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Settings Modal -->
            <div id="settings-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-sm">
                    <h3 class="text-lg font-semibold mb-4">Voice Settings</h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Voice Style</label>
                            <select id="voice-select" class="w-full p-2 border border-gray-300 rounded-md">
                                <option value="en-US-Neural2-F">Caring (Female)</option>
                                <option value="en-US-Neural2-H">Gentle (Female)</option>
                                <option value="en-US-Neural2-G">Sweet (Female)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Speaking Rate</label>
                            <input id="speaking-rate" type="range" min="0.5" max="2" step="0.1" value="1" class="w-full">
                            <div class="text-sm text-gray-500 text-center mt-1">
                                <span id="rate-display">1.0x</span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Personality</label>
                            <select id="persona-select" class="w-full p-2 border border-gray-300 rounded-md">
                                <option value="caring_girlfriend">Caring & Supportive</option>
                                <option value="playful_girlfriend">Playful & Energetic</option>
                                <option value="shy_girlfriend">Shy & Gentle</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6">
                        <button id="cancel-settings" class="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                        <button id="save-settings" class="px-4 py-2 bg-girlfriend-500 text-white rounded-md hover:bg-girlfriend-600">Save</button>
                    </div>
                </div>
            </div>
            
            <!-- Video Call Modal -->
            <div id="video-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-md text-center">
                    <div class="mb-4">
                        <i class="fas fa-video text-6xl text-girlfriend-400 mb-4"></i>
                        <h3 class="text-xl font-semibold text-gray-800">Video Call Feature</h3>
                        <p class="text-gray-600 mt-2">Coming Soon! 🎬✨</p>
                    </div>
                    
                    <div class="bg-gray-50 rounded-lg p-4 mb-4 text-left">
                        <h4 class="font-medium text-gray-800 mb-2">Planned Features:</h4>
                        <ul class="text-sm text-gray-600 space-y-1">
                            <li>• Real-time video calling with AI avatar</li>
                            <li>• Lip-sync animation with your voice</li>
                            <li>• Emotion-based facial expressions</li>
                            <li>• Custom avatar appearance</li>
                        </ul>
                    </div>
                    
                    <button id="close-video-modal" class="w-full py-3 bg-girlfriend-500 text-white rounded-md hover:bg-girlfriend-600">
                        Got it!
                    </button>
                </div>
            </div>
        </div>

        <!-- JavaScript Libraries -->
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Endpoint not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Application error:', err);
  return c.json({ 
    error: 'Internal server error',
    message: 'Something went wrong. Please try again.'
  }, 500);
});

export default app;
