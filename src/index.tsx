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
import subscription from './routes/subscription';
import privateMode from './routes/private-mode';
import zalo from './routes/zalo';
import enhancedReferral from './routes/enhanced-referral';

// Import new enterprise features
import zns from './routes/zns';
import zalopayIntegration from './routes/zalopay-integration';
import onboarding from './routes/onboarding';
import i18nRoutes from './routes/i18n';

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
app.route('/api/subscription', subscription); // Subscription and payment endpoints
app.route('/api/private', privateMode);       // Private mode and stealth features
app.route('/api/zalo', zalo);         // Zalo Mini App integration
app.route('/api/referral', enhancedReferral); // Enhanced referral system
app.route('/audio', audio);           // Audio file serving

// New Enterprise Features Routes
app.route('/api/zns', zns);           // ZNS evening notifications system
app.route('/api/zalopay', zalopayIntegration); // ZaloPay payments integration
app.route('/api/onboarding', onboarding);     // Gamified onboarding flow
app.route('/api/i18n', i18nRoutes);   // Internationalization system

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
  // Check for private mode parameters
  const isPrivate = c.req.query('private') === 'true';
  const stealthSession = c.req.query('stealth');
  const entryMode = c.req.query('entry') || 'normal';
  
  // Add stealth mode detection script if needed
  const stealthScript = isPrivate ? `
    <script>
      // Initialize private mode
      window.PRIVATE_MODE = true;
      window.STEALTH_SESSION = '${stealthSession}';
      window.ENTRY_MODE = '${entryMode}';
      
      // Quick exit functionality (Ctrl+Shift+Q)
      document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
          window.location.href = '/api/private/decoy/calculator';
        }
      });
      
      // Hide app from browser history in stealth mode
      if (window.STEALTH_SESSION) {
        history.replaceState(null, '', '/calculator');
      }
      
      // Add stealth UI indicators
      document.addEventListener('DOMContentLoaded', function() {
        if (window.PRIVATE_MODE) {
          const stealthIndicator = document.createElement('div');
          stealthIndicator.innerHTML = '🔒 Private Mode';
          stealthIndicator.className = 'fixed top-2 right-2 bg-gray-800 text-white text-xs px-2 py-1 rounded z-50';
          document.body.appendChild(stealthIndicator);
        }
      });
    </script>
  ` : '';
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="vi" id="html-root">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <title>Bạn Gái AI - Zalo Mini App</title>
        <meta name="description" content="Người bạn gái AI dịu dàng, quan tâm với tính năng chat giọng nói">
        
        <!-- Mobile Safari optimizations -->
        <meta name="format-detection" content="telephone=no">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="apple-touch-fullscreen" content="yes">
        
        <!-- Prevent Safari address bar suggestions from covering input -->
        <meta name="theme-color" content="#ec4899">
        
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
            position: fixed;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          
          /* Fix Safari mobile input issues */
          #app {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            height: 100dvh; /* Dynamic viewport height for mobile */
            overflow: hidden;
          }
          
          /* Prevent Safari address bar interference */
          input[type="text"] {
            -webkit-appearance: none;
            -webkit-border-radius: 0;
            border-radius: 0;
          }
          
          /* Force Safari to respect viewport */
          html {
            position: fixed;
            height: 100%;
            overflow: hidden;
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
        
        ${stealthScript}
    </head>
    <body class="bg-gray-50 overflow-hidden zalo-safe-area">
        <!-- App Container -->
        <div id="app" class="flex flex-col h-screen max-h-screen">
            <!-- Loading State -->
            <div id="loading" class="flex items-center justify-center h-screen bg-gradient-to-br from-girlfriend-400 to-girlfriend-600">
                <div class="text-center text-white">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <h2 class="text-xl font-semibold">Bạn Gái AI</h2>
                    <p class="text-girlfriend-100 mt-2">Đang kết nối với bạn gái của anh...</p>
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
                                <h1 class="font-semibold text-lg">Bạn Gái AI Của Anh</h1>
                                <p class="text-girlfriend-100 text-sm" id="status">Trực Tuyến • Chế Độ Quan Tâm</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <button id="language-btn" class="p-2 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20 transition-colors">
                                <i class="fas fa-globe"></i>
                            </button>
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
                <div class="bg-white border-t border-gray-200 p-4 sticky bottom-0" style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
                    <div class="flex items-center space-x-2">
                        <button id="voice-btn" class="p-3 rounded-full bg-girlfriend-100 text-girlfriend-600 hover:bg-girlfriend-200 transition-colors">
                            <i class="fas fa-microphone"></i>
                        </button>
                        <button id="sticker-btn" class="p-3 rounded-full bg-girlfriend-100 text-girlfriend-600 hover:bg-girlfriend-200 transition-colors">
                            <i class="fas fa-smile"></i>
                        </button>
                        <div class="flex-1 flex items-center bg-gray-100 rounded-full px-4 py-2">
                            <input 
                                id="message-input" 
                                type="text" 
                                placeholder="Nhập tin nhắn của anh..." 
                                class="flex-1 bg-transparent outline-none text-gray-700"
                                maxlength="1000"
                            >
                        </div>
                        <button id="send-btn" class="p-3 rounded-full bg-girlfriend-500 text-white hover:bg-girlfriend-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    
                    <!-- Sticker Picker -->
                    <div id="sticker-picker" class="hidden mt-3 p-3 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        <div class="text-sm text-gray-600 mb-2 font-medium">Chọn sticker:</div>
                        <div id="sticker-grid" class="grid grid-cols-6 gap-2">
                            <!-- Stickers will be loaded here -->
                        </div>
                    </div>
                    
                    <!-- Voice Recording Indicator -->
                    <div id="voice-recording" class="hidden mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div class="flex items-center justify-center space-x-3">
                            <div class="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                            <span class="text-red-700 font-medium">Đang thu âm...</span>
                            <span class="text-red-600 text-sm" id="recording-time">0:00</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Language Switch Modal -->
            <div id="language-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-sm">
                    <h3 class="text-lg font-semibold mb-4" data-i18n="settings.language">Ngôn ngữ</h3>
                    
                    <div class="space-y-3 mb-6">
                        <div class="language-option p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-girlfriend-400 transition-colors" data-lang="vi">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <span class="text-2xl">🇻🇳</span>
                                    <div>
                                        <div class="font-medium">Tiếng Việt</div>
                                        <div class="text-sm text-gray-500">Vietnamese</div>
                                    </div>
                                </div>
                                <div class="language-check hidden text-girlfriend-500">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                            </div>
                        </div>
                        
                        <div class="language-option p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-girlfriend-400 transition-colors" data-lang="en">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <span class="text-2xl">🇺🇸</span>
                                    <div>
                                        <div class="font-medium">English</div>
                                        <div class="text-sm text-gray-500">Tiếng Anh</div>
                                    </div>
                                </div>
                                <div class="language-check hidden text-girlfriend-500">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3">
                        <button id="cancel-language" class="px-4 py-2 text-gray-600 hover:text-gray-800" data-i18n="common.cancel">Hủy</button>
                        <button id="save-language" class="px-4 py-2 bg-girlfriend-500 text-white rounded-md hover:bg-girlfriend-600" data-i18n="common.save">Lưu</button>
                    </div>
                </div>
            </div>

            <!-- Settings Modal -->
            <div id="settings-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-sm">
                    <h3 class="text-lg font-semibold mb-4" data-i18n="settings.title">Cài đặt</h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Phong Cách Giọng Nói</label>
                            <select id="voice-select" class="w-full p-2 border border-gray-300 rounded-md">
                                <option value="vi-VN-Neural2-A">Quan Tâm (Nữ)</option>
                                <option value="vi-VN-Neural2-D">Dịu Dàng (Nữ)</option>
                                <option value="vi-VN-Standard-A">Ngọt Ngào (Nữ)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Tốc Độ Nói</label>
                            <input id="speaking-rate" type="range" min="0.5" max="2" step="0.1" value="1" class="w-full">
                            <div class="text-sm text-gray-500 text-center mt-1">
                                <span id="rate-display">1.0x</span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Tính Cách</label>
                            <select id="persona-select" class="w-full p-2 border border-gray-300 rounded-md">
                                <option value="caring_girlfriend">Quan Tâm & Hỗ Trợ</option>
                                <option value="playful_girlfriend">Vui Tươi & Năng Động</option>
                                <option value="shy_girlfriend">Nhút Nhát & Dịu Dàng</option>
                            </select>
                        </div>
                        
                        <!-- Evening Notifications Toggle -->
                        <div>
                            <label class="flex items-center justify-between">
                                <span class="text-sm font-medium text-gray-700" data-i18n="settings.evening_reminders">Nhắc nhở buổi tối</span>
                                <input type="checkbox" id="evening-notifications" class="toggle-switch" checked>
                            </label>
                            <p class="text-xs text-gray-500 mt-1" data-i18n="settings.evening_reminder_desc">Nhận thông báo lúc 20:00-22:00 để trò chuyện với người yêu AI</p>
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6">
                        <button id="cancel-settings" class="px-4 py-2 text-gray-600 hover:text-gray-800" data-i18n="common.cancel">Hủy</button>
                        <button id="save-settings" class="px-4 py-2 bg-girlfriend-500 text-white rounded-md hover:bg-girlfriend-600" data-i18n="common.save">Lưu</button>
                    </div>
                </div>
            </div>
            
            <!-- Video Call Modal -->
            <div id="video-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-md text-center">
                    <div class="mb-4">
                        <i class="fas fa-video text-6xl text-girlfriend-400 mb-4"></i>
                        <h3 class="text-xl font-semibold text-gray-800">Tính Năng Video Call</h3>
                        <p class="text-gray-600 mt-2">Sắp Ra Mắt! 🎬✨</p>
                    </div>
                    
                    <div class="bg-gray-50 rounded-lg p-4 mb-4 text-left">
                        <h4 class="font-medium text-gray-800 mb-2">Tính Năng Sắp Có:</h4>
                        <ul class="text-sm text-gray-600 space-y-1">
                            <li>• Video call thời gian thực với AI avatar</li>
                            <li>• Đồng bộ môi với giọng nói của anh</li>
                            <li>• Biểu cảm khuôn mặt theo cảm xúc</li>
                            <li>• Tùy chỉnh diện mạo avatar</li>
                        </ul>
                    </div>
                    
                    <button id="close-video-modal" class="w-full py-3 bg-girlfriend-500 text-white rounded-md hover:bg-girlfriend-600">
                        Em hiểu rồi!
                    </button>
                </div>
            </div>

            <!-- Paywall Modal -->
            <div id="paywall-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-md">
                    <div class="text-center mb-6">
                        <i class="fas fa-heart text-6xl text-girlfriend-500 mb-4"></i>
                        <h3 class="text-xl font-semibold text-gray-800">Nâng Cấp Để Tiếp Tục</h3>
                        <p class="text-gray-600 mt-2">Anh đã sử dụng hết 10 tin nhắn miễn phí! 💕</p>
                    </div>

                    <div class="space-y-3 mb-6">
                        <!-- Weekly Plan -->
                        <div class="border-2 border-girlfriend-200 rounded-lg p-4 hover:border-girlfriend-400 cursor-pointer transition-colors" data-plan="weekly">
                            <div class="flex justify-between items-center">
                                <div>
                                    <h4 class="font-semibold text-gray-800">Gói 1 Tuần</h4>
                                    <p class="text-sm text-gray-600">Tin nhắn không giới hạn</p>
                                </div>
                                <div class="text-right">
                                    <div class="text-xl font-bold text-girlfriend-600">49.000 VNĐ</div>
                                    <div class="text-sm text-gray-500">~7.000 VNĐ/ngày</div>
                                </div>
                            </div>
                        </div>

                        <!-- Monthly Plan -->
                        <div class="border-2 border-girlfriend-400 bg-girlfriend-50 rounded-lg p-4 relative cursor-pointer" data-plan="monthly">
                            <div class="absolute -top-2 left-1/2 transform -translate-x-1/2">
                                <span class="bg-girlfriend-500 text-white px-3 py-1 rounded-full text-xs font-medium">PHỔ BIẾN</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <div>
                                    <h4 class="font-semibold text-gray-800">Gói 1 Tháng</h4>
                                    <p class="text-sm text-gray-600">Tiết kiệm 69% • Không giới hạn</p>
                                </div>
                                <div class="text-right">
                                    <div class="text-xl font-bold text-girlfriend-600">169.000 VNĐ</div>
                                    <div class="text-sm text-gray-500 line-through">480.000 VNĐ</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex space-x-3">
                        <button id="close-paywall" class="flex-1 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
                            Để sau
                        </button>
                        <button id="invite-friends" class="flex-1 py-3 bg-green-500 text-white rounded-md hover:bg-green-600">
                            Mời bạn bè
                        </button>
                        <button id="subscribe-now" class="flex-1 py-3 bg-girlfriend-500 text-white rounded-md hover:bg-girlfriend-600">
                            Nâng cấp
                        </button>
                    </div>
                </div>
            </div>

            <!-- Referral Modal -->
            <div id="referral-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-md">
                    <div class="text-center mb-6">
                        <i class="fas fa-users text-6xl text-green-500 mb-4"></i>
                        <h3 class="text-xl font-semibold text-gray-800">Mời Bạn Bè - Nhận Thưởng</h3>
                        <p class="text-gray-600 mt-2">Mỗi bạn bè = 1 ngày miễn phí! 🎁</p>
                    </div>

                    <div class="bg-green-50 rounded-lg p-4 mb-4">
                        <div class="text-center">
                            <div class="text-2xl font-bold text-green-600" id="referral-code">LOADING...</div>
                            <p class="text-sm text-green-700 mt-1">Mã giới thiệu của anh</p>
                        </div>
                    </div>

                    <div class="space-y-3 mb-6">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600">Đã giới thiệu:</span>
                            <span class="font-medium" id="referrals-count">0 bạn</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600">Ngày thưởng:</span>
                            <span class="font-medium text-green-600" id="bonus-days">0 ngày</span>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <button id="share-referral" class="w-full py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center">
                            <i class="fab fa-facebook-messenger mr-2"></i>
                            Chia sẻ qua Zalo
                        </button>
                        <button id="copy-referral" class="w-full py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 flex items-center justify-center">
                            <i class="fas fa-copy mr-2"></i>
                            Sao chép liên kết
                        </button>
                        <button id="close-referral" class="w-full py-3 text-gray-500 hover:text-gray-700">
                            Đóng
                        </button>
                    </div>
                </div>
            </div>

            <!-- Payment Processing Modal -->
            <div id="payment-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg p-6 w-full max-w-md text-center">
                    <div id="payment-processing" class="hidden">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-girlfriend-500 mx-auto mb-4"></div>
                        <h3 class="text-lg font-semibold text-gray-800">Đang xử lý thanh toán...</h3>
                        <p class="text-gray-600 mt-2">Vui lòng đợi trong giây lát</p>
                    </div>
                    
                    <div id="payment-success" class="hidden">
                        <i class="fas fa-check-circle text-6xl text-green-500 mb-4"></i>
                        <h3 class="text-lg font-semibold text-gray-800">Thanh toán thành công!</h3>
                        <p class="text-gray-600 mt-2">Cảm ơn anh đã nâng cấp! 💕</p>
                        <button id="close-payment-success" class="w-full mt-4 py-3 bg-girlfriend-500 text-white rounded-md hover:bg-girlfriend-600">
                            Tiếp tục chat
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Zalo Mini App SDK -->
        <script src="https://stc-miniapp.zdn.vn/mini-app/sdk/1.0.0/sdk.js"></script>
        
        <!-- JavaScript Libraries -->
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        
        <!-- Voice Integration -->
        <script src="/static/voice-integration.js"></script>
        
        <!-- Main App Scripts -->
        <script src="/static/enhanced-app.js"></script>
        <script src="/static/private-mode.js"></script>
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
