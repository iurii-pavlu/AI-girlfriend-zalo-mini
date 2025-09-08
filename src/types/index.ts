// Cloudflare bindings
export interface Bindings {
  DB: D1Database;
  R2?: R2Bucket;
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
  
  // PayOS Integration
  PAYOS_CLIENT_ID: string;
  PAYOS_API_KEY: string;
  PAYOS_CHECKSUM_KEY: string;
  
  // Pricing & Limits
  WEEKLY_PRICE_VND: string;
  MONTHLY_PRICE_VND: string;
  FREE_MESSAGES_LIMIT: string;
  REFERRAL_BONUS_DAYS: string;
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

// Subscription and Payment types
export interface User {
  id: string;
  email?: string;
  phone?: string;
  referral_code: string;
  referred_by?: string;
  subscription_type: 'free' | 'weekly' | 'monthly';
  subscription_expires_at?: string;
  messages_used: number;
  created_at: string;
  last_active: string;
}

export interface Referral {
  id: number;
  referrer_id: string;
  referred_id: string;
  reward_days: number;
  claimed: boolean;
  created_at: string;
}

export interface PaymentRequest {
  orderCode: number;
  amount: number;
  description: string;
  cancelUrl: string;
  returnUrl: string;
  signature?: string;
}

export interface PaymentResponse {
  error: number;
  message: string;
  data?: {
    bin: string;
    accountNumber: string;
    accountName: string;
    amount: number;
    description: string;
    orderCode: number;
    currency: string;
    paymentLinkId: string;
    status: string;
    checkoutUrl: string;
    qrCode: string;
  };
}

export interface SubscriptionStatus {
  canChat: boolean;
  messagesLeft: number;
  subscriptionType: string;
  expiresAt?: string;
  needsPayment: boolean;
  showPaywall: boolean;
}

export interface ReferralStats {
  referralCode: string;
  referralsCount: number;
  bonusDaysEarned: number;
  canEarnMore: boolean;
}