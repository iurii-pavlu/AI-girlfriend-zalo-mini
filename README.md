# AI Girlfriend - Zalo Mini App

🇻🇳 **Your caring AI girlfriend companion optimized for Zalo Mini App platform**

## 🎯 Project Overview

**AI Girlfriend** is a fully functional Zalo Mini App that provides users with a caring, supportive AI companion featuring:
- **Text & Voice Chat**: Telegram-style chat interface with voice messaging capabilities
- **Real-time STT/TTS**: Speech-to-text and text-to-speech powered by Google Cloud
- **AI Conversations**: ChatGPT-4o-mini for cost-effective, engaging dialogue
- **Vietnamese Market**: Optimized for Zalo's primary user base with PG-13 content filtering
- **Edge Performance**: Cloudflare Workers deployment for <100ms global latency

## 🚀 Live Demo

- **Development**: https://3000-i7642hoopwei37i4bg3sp-6532622b.e2b.dev
- **Production**: Coming soon on Cloudflare Pages
- **GitHub**: Repository will be created after GitHub authorization

## ✨ Current Features

### 💬 **Core Chat Functionality**
- [x] Telegram-style responsive chat interface
- [x] Real-time message history with timestamps
- [x] Session management with persistent conversations
- [x] Multiple personality modes (Caring, Playful, Shy)
- [x] Mobile-optimized for Zalo webview

### 🎤 **Voice Features**
- [x] Hold-to-record voice messages (WebRTC)
- [x] Google Cloud Speech-to-Text (48kHz, opus codec)
- [x] Google Cloud Text-to-Speech with female voices
- [x] Audio playback with custom player controls
- [x] Voice settings (speed, voice selection)

### 🤖 **AI Integration**
- [x] OpenAI ChatGPT-4o-mini for cost-effective responses
- [x] Context-aware conversations with persona system
- [x] Content filtering for PG-13 compliance (Zalo requirements)
- [x] Intelligent response generation with emotion support

### 💾 **Data Management**
- [x] Cloudflare D1 SQLite database for sessions/messages
- [x] Cloudflare R2 storage for audio files
- [x] Analytics tracking for usage insights
- [x] Automatic cleanup of old data

### 🎬 **Video Call Placeholder**
- [x] UI placeholder for future video calling
- [x] Technical specifications and roadmap
- [x] Integration planning for D-ID/HeyGen avatars

## 🛠 Tech Stack

### **Backend (Edge Computing)**
- **Framework**: Hono (lightweight, fast, Cloudflare-optimized)
- **Runtime**: Cloudflare Workers (V8 isolates, global edge)
- **Database**: Cloudflare D1 (distributed SQLite)
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **APIs**: OpenAI GPT-4o-mini, Google Cloud STT/TTS

### **Frontend (Mobile-First)**
- **UI**: Vanilla JavaScript + TailwindCSS
- **Audio**: WebRTC MediaRecorder API
- **HTTP**: Axios for API communication  
- **Optimization**: Mobile webview optimized, <300KB bundle

### **Development**
- **Language**: TypeScript for type safety
- **Build**: Vite for fast builds and hot reload
- **Deployment**: Cloudflare Pages with automatic CI/CD
- **Process Management**: PM2 for development

## 📊 API Endpoints

### **Chat Endpoints**
```
POST /api/chat          # Text-only chat
POST /api/message       # Complete pipeline (text or voice → text + audio response)
POST /api/stt          # Speech-to-text only
POST /api/tts          # Text-to-speech only
GET  /audio/{filename} # Serve audio files
```

### **System Endpoints**
```
GET  /api/health                    # Health check
GET  /api/video-call/capabilities  # Video call feature info
POST /api/video-call/start         # Video call placeholder (501 Not Implemented)
```

### **Request Examples**

**Text Chat:**
```bash
curl -X POST https://your-app.pages.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello! How are you today?", "sessionId": "optional"}'
```

**Voice Message:**
```bash
curl -X POST https://your-app.pages.dev/api/message \
  -H "Content-Type: audio/webm" \
  -H "X-Session-Id: your-session-id" \
  --data-binary @voice.webm
```

## 🏗 Data Architecture

### **Database Schema (Cloudflare D1)**
```sql
-- Sessions: User conversation sessions
sessions (id, user_id, persona, created_at, last_active)

-- Messages: Chat message history  
messages (id, session_id, content, role, message_type, audio_url, created_at)

-- Voice Settings: User voice preferences
voice_settings (session_id, voice_id, speaking_rate, language)

-- Analytics: Usage tracking
analytics (id, session_id, event_type, event_data, created_at)
```

### **Storage Structure (Cloudflare R2)**
```
audio/
  ├── {timestamp}-{random}.mp3  # TTS generated audio files
  └── ...
```

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+ 
- Cloudflare account
- OpenAI API key
- Google Cloud API key (STT/TTS enabled)

### **Development Setup**

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/ai-girlfriend-zalo-miniapp.git
cd ai-girlfriend-zalo-miniapp
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables:**
```bash
cp ENV.example .dev.vars
# Edit .dev.vars with your API keys
```

4. **Build and start development server:**
```bash
npm run build
npm run dev:sandbox  # For sandbox development
# or
pm2 start ecosystem.config.cjs  # For PM2 management
```

5. **Test the application:**
```bash
curl http://localhost:3000/api/health
```

### **Environment Variables**

Create `.dev.vars` file (never commit this):

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-openai-key-here

# Google Cloud Configuration  
GOOGLE_API_KEY=your-google-cloud-api-key-here
GOOGLE_PROJECT_ID=your-gcp-project-id
GOOGLE_STT_LANGUAGE=en-US
GOOGLE_TTS_VOICE=en-US-Neural2-F
GOOGLE_TTS_SPEAKING_RATE=1.0

# App Configuration
APP_BASE_URL=http://localhost:3000
MAX_MESSAGE_TOKENS=512
ALLOWED_ORIGINS=https://miniapp.zalo.me,http://localhost:3000

# Content Filter
ENABLE_CONTENT_FILTER=true
FILTER_SEVERITY=medium
```

## 🌐 Production Deployment

### **Cloudflare Pages Deployment**

1. **Setup Cloudflare API:**
```bash
# Configure Cloudflare API token
npm run cf-setup  # Follow prompts for API token
```

2. **Create and deploy:**
```bash
# Create production database
npx wrangler d1 create ai-gf-db-production

# Update wrangler.jsonc with database ID

# Deploy to Cloudflare Pages
npm run deploy:prod
```

3. **Configure secrets:**
```bash
# Add environment variables to Cloudflare
npx wrangler pages secret put OPENAI_API_KEY --project-name ai-girlfriend-zalo
npx wrangler pages secret put GOOGLE_API_KEY --project-name ai-girlfriend-zalo
# ... repeat for all environment variables
```

### **Zalo Mini App Registration**

1. **Create Zalo App:**
   - Visit https://developers.zalo.me/
   - Create new application
   - Note App ID and Secret Key

2. **Register Mini App:**
   - Visit https://mini.zalo.me/
   - Create new Mini App project
   - Set domain to your Cloudflare Pages URL
   - Configure app settings and permissions

3. **Test in Zalo:**
   - Use Zalo Mini App Studio for testing
   - Deploy to Zalo platform for production

## 📱 User Guide

### **Getting Started**
1. Open the AI Girlfriend app in Zalo
2. Start chatting by typing a message or holding the microphone button
3. Your AI girlfriend will respond with both text and voice
4. Customize voice settings and personality in the settings menu

### **Chat Features**
- **Text Messages**: Type and send messages like any chat app
- **Voice Messages**: Hold microphone button to record, release to send
- **Audio Responses**: All AI responses include both text and voice audio
- **Personality Modes**: Choose between Caring, Playful, or Shy personalities

### **Voice Controls**
- **Recording**: Hold microphone button to start recording
- **Playback**: Tap audio messages to play/pause
- **Settings**: Adjust voice speed and style in settings menu

## 🔧 Development Commands

```bash
# Development
npm run dev              # Vite dev server
npm run dev:sandbox      # Wrangler dev server (recommended)
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run db:migrate:local   # Apply migrations locally
npm run db:migrate:prod    # Apply migrations to production
npm run db:seed           # Seed test data
npm run db:reset          # Reset local database

# Deployment
npm run deploy            # Deploy to Cloudflare Pages
npm run deploy:prod       # Deploy to production with project name

# Utilities
npm run clean-port        # Kill processes on port 3000
npm run test             # Test server health
npm run git:commit "msg"  # Quick git commit
```

## 🎭 Content Filtering & Moderation

The app includes comprehensive content filtering to ensure Zalo Mini App compliance:

### **Filtering Levels**
- **Explicit Content**: Always blocked (sexual, profanity)
- **Inappropriate Content**: Blocked on medium+ severity (violence, drugs, politics)
- **Toxic Content**: Blocked on high severity (hate speech, discrimination)

### **AI Personality Guidelines**
- Wholesome, PG-13 appropriate responses
- Romantic but respectful tone
- Focus on emotional support and encouragement
- Vietnamese cultural sensitivity

## 🎬 Future Roadmap: Video Calling

### **Phase 1: Basic Video (Q2 2024)**
- [ ] WebRTC audio/video calling
- [ ] Simple avatar overlay
- [ ] Real-time voice processing

### **Phase 2: AI Avatar (Q3 2024)**  
- [ ] D-ID Live Avatar integration
- [ ] AI-driven lip-sync animation
- [ ] Emotion-based expressions

### **Phase 3: Full 3D (Q4 2024)**
- [ ] Ready Player Me 3D avatars
- [ ] Advanced AI conversation
- [ ] Multi-platform support

### **Technical Specifications**
- **Target Latency**: <200ms end-to-end
- **Video Quality**: 720p @ 30fps
- **Audio Quality**: 48kHz/16-bit stereo
- **Bandwidth**: Adaptive 500kbps - 2Mbps

## 💰 Cost Analysis

### **Current Costs (Low Traffic)**
- **Cloudflare Workers**: Free tier (100k requests/day)
- **Cloudflare D1**: Free tier (5 GB, 25M reads/month)
- **Cloudflare R2**: Free tier (10 GB storage, 1M requests/month)
- **OpenAI GPT-4o-mini**: ~$0.15/$1M tokens (very cost-effective)
- **Google Cloud STT/TTS**: Free tier covers light usage
- **Domain**: ~$10-15/year

**Total MVP cost: $5-20/month** (vs original estimate of $30-80/month)

### **Scaling Costs**
- **High Traffic**: $50-200/month for 10k+ daily users
- **Enterprise**: $200-500/month for 100k+ daily users

## 🔐 Security & Privacy

- **API Keys**: Stored as Cloudflare secrets, never exposed to frontend
- **CORS**: Restricted to Zalo Mini App domains only  
- **Content Filtering**: Multi-level filtering for appropriate responses
- **Data Retention**: Automatic cleanup of old sessions and audio files
- **Rate Limiting**: Built-in request limiting to prevent abuse

## 🐛 Troubleshooting

### **Common Issues**

**1. "Speech recognition failed"**
- Check microphone permissions in browser/Zalo
- Ensure stable internet connection
- Try refreshing the app

**2. "Audio playback not working"** 
- Check device audio settings
- Ensure browser supports audio playback
- Try using headphones

**3. "API key errors in development"**
- Verify .dev.vars file exists and has correct keys
- Check that all required environment variables are set
- Restart development server after changing .dev.vars

**4. "Database connection failed"**
- For local development: Run `npm run db:migrate:local` 
- For production: Verify D1 database is created and configured in wrangler.jsonc

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)  
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Zalo Mini App Platform** for providing the mobile app ecosystem
- **Cloudflare** for edge computing infrastructure
- **OpenAI** for affordable AI conversation capabilities
- **Google Cloud** for high-quality speech services
- **Hono Framework** for lightweight edge computing

---

**Made with ❤️ for the Vietnamese market and Zalo Mini App ecosystem**

**Status**: ✅ MVP Complete | 🚀 Ready for Zalo Deployment | 🎬 Video Features Coming Soon