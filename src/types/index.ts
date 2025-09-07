// Cloudflare bindings
export interface Bindings {
  DB: D1Database;
  R2: R2Bucket;
  OPENAI_API_KEY: string;
  GOOGLE_API_KEY: string;
  GOOGLE_PROJECT_ID: string;
  GOOGLE_STT_LANGUAGE: string;
  GOOGLE_TTS_VOICE: string;
  GOOGLE_TTS_SPEAKING_RATE: string;
  APP_BASE_URL: string;
  MAX_MESSAGE_TOKENS: string;
  ALLOWED_ORIGINS: string;
  ENABLE_CONTENT_FILTER: string;
  FILTER_SEVERITY: string;
}

// Database models
export interface Session {
  id: string;
  user_id: string;
  persona: string;
  created_at: string;
  last_active: string;
}

export interface Message {
  id: number;
  session_id: string;
  content: string;
  role: 'user' | 'assistant';
  message_type: 'text' | 'voice';
  audio_url?: string;
  created_at: string;
}

export interface VoiceSettings {
  session_id: string;
  voice_id: string;
  speaking_rate: number;
  language: string;
}

// API request/response types
export interface ChatRequest {
  text: string;
  sessionId?: string;
  persona?: string;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
}

export interface STTRequest {
  // Binary audio data
}

export interface STTResponse {
  text: string;
  confidence?: number;
}

export interface TTSRequest {
  text: string;
  voiceId?: string;
  speakingRate?: number;
}

export interface MessageRequest {
  text?: string;
  sessionId?: string;
}

export interface MessageResponse {
  text: string;
  audioUrl: string;
  sessionId: string;
}

// Content filter types
export interface ContentFilterResult {
  isAllowed: boolean;
  reason?: string;
  filteredText?: string;
}