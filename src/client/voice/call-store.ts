/**
 * Voice Call Store
 * Manages call state, metrics, and UI interactions
 * Minimal event emitter pattern for state management
 */

import { ElevenLabsVoiceClient, CallEvent, CallEventType } from './elevenlabs-client';

interface CallUIState {
  isCallActive: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'disconnected' | 'error';
  callId: string;
  duration: number;
  userLevel: number;
  assistantLevel: number;
  isMuted: boolean;
  transcript: string;
  isTranscriptVisible: boolean;
  error?: string;
}

interface CallLimits {
  dailyMinutes: number;
  usedMinutes: number;
  isPremium: boolean;
}

export type CallStoreEventType = 'state_change' | 'limits_update' | 'error';

export interface CallStoreEvent {
  type: CallStoreEventType;
  data: any;
}

export class VoiceCallStore extends EventTarget {
  private client: ElevenLabsVoiceClient;
  private state: CallUIState;
  private limits: CallLimits;
  private durationTimer: any = null;
  private userId: string = '';

  constructor() {
    super();

    this.state = {
      isCallActive: false,
      status: 'idle',
      callId: '',
      duration: 0,
      userLevel: 0,
      assistantLevel: 0,
      isMuted: false,
      transcript: '',
      isTranscriptVisible: false,
    };

    this.limits = {
      dailyMinutes: 2, // Free tier: 2 minutes
      usedMinutes: 0,
      isPremium: false,
    };

    this.client = new ElevenLabsVoiceClient({
      tokenUrl: '/api/token/elevenlabs',
      proxyUrl: '/api/proxy/elevenlabs-ws',
    });

    this.bindClientEvents();
    this.loadLimits();
  }

  /**
   * Bind ElevenLabs client events
   */
  private bindClientEvents(): void {
    this.client.addEventListener('state_change', (event: CustomEvent<CallEvent>) => {
      const { data } = event.detail;
      this.updateState({ 
        status: data.to,
        callId: data.callId,
      });
    });

    this.client.addEventListener('audio_in', (event: CustomEvent<CallEvent>) => {
      const { data } = event.detail;
      this.updateState({ userLevel: data.level });
    });

    this.client.addEventListener('audio_out', (event: CustomEvent<CallEvent>) => {
      const { data } = event.detail;
      this.updateState({ assistantLevel: data.level });
    });

    this.client.addEventListener('transcript', (event: CustomEvent<CallEvent>) => {
      const { data } = event.detail;
      if (data.final) {
        this.updateState({ 
          transcript: this.state.transcript + ' ' + data.text 
        });
      }
    });

    this.client.addEventListener('error', (event: CustomEvent<CallEvent>) => {
      const { data } = event.detail;
      this.updateState({ 
        error: data.error,
        status: 'error',
      });
      this.emit('error', data);
    });
  }

  /**
   * Start a voice call
   */
  async startCall(): Promise<void> {
    try {
      // Check limits
      if (!this.canStartCall()) {
        throw new Error(this.limits.isPremium ? 
          'Daily limit reached' : 'Free limit reached. Upgrade to continue.');
      }

      this.updateState({ 
        isCallActive: true,
        status: 'connecting',
        duration: 0,
        transcript: '',
        error: undefined,
      });

      await this.client.startCall(this.userId);
      
      // Start duration timer
      this.startDurationTimer();

    } catch (error) {
      console.error('Failed to start call:', error);
      this.updateState({ 
        status: 'error',
        error: error.message,
        isCallActive: false,
      });
      throw error;
    }
  }

  /**
   * End the current call
   */
  async endCall(): Promise<void> {
    try {
      const metrics = await this.client.endCall();
      
      // Stop duration timer
      this.stopDurationTimer();
      
      // Update usage limits
      const durationMinutes = metrics.duration / 60;
      await this.updateUsage(durationMinutes);
      
      // Save call moment
      await this.saveMoment(metrics);

      this.updateState({ 
        isCallActive: false,
        status: 'idle',
        userLevel: 0,
        assistantLevel: 0,
      });

    } catch (error) {
      console.error('Error ending call:', error);
      this.updateState({ 
        status: 'error',
        error: error.message,
      });
    }
  }

  /**
   * Toggle mute state
   */
  toggleMute(): void {
    this.updateState({ isMuted: !this.state.isMuted });
    // TODO: Implement mute in audio worklet
  }

  /**
   * Toggle transcript visibility
   */
  toggleTranscript(): void {
    this.updateState({ isTranscriptVisible: !this.state.isTranscriptVisible });
  }

  /**
   * Set user ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Update user limits (premium status)
   */
  updateLimits(limits: Partial<CallLimits>): void {
    this.limits = { ...this.limits, ...limits };
    
    // Update daily limit based on premium status
    if (limits.isPremium !== undefined) {
      this.limits.dailyMinutes = limits.isPremium ? 15 : 2; // 15 min premium, 2 min free
    }
    
    this.emit('limits_update', this.limits);
  }

  /**
   * Check if user can start a call
   */
  canStartCall(): boolean {
    return this.limits.usedMinutes < this.limits.dailyMinutes;
  }

  /**
   * Get remaining minutes
   */
  getRemainingMinutes(): number {
    return Math.max(0, this.limits.dailyMinutes - this.limits.usedMinutes);
  }

  /**
   * Get current state
   */
  getState(): CallUIState {
    return { ...this.state };
  }

  /**
   * Get current limits
   */
  getLimits(): CallLimits {
    return { ...this.limits };
  }

  /**
   * Update state and emit change event
   */
  private updateState(updates: Partial<CallUIState>): void {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };
    
    this.emit('state_change', {
      oldState,
      newState: this.state,
      changes: updates,
    });
  }

  /**
   * Emit custom event
   */
  private emit(type: CallStoreEventType, data: any): void {
    const event = new CustomEvent(type, {
      detail: { type, data, timestamp: Date.now() },
    });
    this.dispatchEvent(event);
  }

  /**
   * Start duration timer
   */
  private startDurationTimer(): void {
    const startTime = Date.now();
    
    this.durationTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      this.updateState({ duration: elapsed });
      
      // Auto-end call at limit
      const durationMinutes = elapsed / 60;
      if (durationMinutes >= this.limits.dailyMinutes) {
        this.endCall();
      }
    }, 1000);
  }

  /**
   * Stop duration timer
   */
  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  /**
   * Update usage tracking
   */
  private async updateUsage(durationMinutes: number): Promise<void> {
    this.limits.usedMinutes += durationMinutes;
    
    // Persist to localStorage for now (can be enhanced with server sync)
    localStorage.setItem('voiceCallUsage', JSON.stringify({
      usedMinutes: this.limits.usedMinutes,
      date: new Date().toDateString(),
    }));
    
    this.emit('limits_update', this.limits);
  }

  /**
   * Load usage limits from storage
   */
  private loadLimits(): void {
    try {
      const stored = localStorage.getItem('voiceCallUsage');
      if (stored) {
        const data = JSON.parse(stored);
        const today = new Date().toDateString();
        
        // Reset daily usage if new day
        if (data.date === today) {
          this.limits.usedMinutes = data.usedMinutes || 0;
        } else {
          this.limits.usedMinutes = 0;
        }
      }
      
      // Check premium status (get from user profile or subscription)
      const premium = localStorage.getItem('isPremium') === 'true';
      this.updateLimits({ isPremium: premium });
      
    } catch (error) {
      console.error('Error loading limits:', error);
    }
  }

  /**
   * Save call moment/summary
   */
  private async saveMoment(metrics: any): Promise<void> {
    try {
      const response = await fetch('/api/moments/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: this.state.callId,
          userId: this.userId,
          transcript: this.state.transcript,
          metrics: {
            duration: metrics.duration,
            p50_latency: this.calculateP50(metrics.latencies),
            p95_latency: this.calculateP95(metrics.latencies),
            packet_drops: metrics.packetDrops,
            reconnections: metrics.reconnections,
          },
        }),
      });

      if (response.ok) {
        const moment = await response.json();
        console.log('Call moment saved:', moment);
        
        // Emit moment for UI (can show in chat)
        this.emit('moment_saved', moment);
      }
    } catch (error) {
      console.error('Failed to save moment:', error);
    }
  }

  /**
   * Calculate P50 latency
   */
  private calculateP50(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    const sorted = latencies.slice().sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.5);
    return sorted[index];
  }

  /**
   * Calculate P95 latency
   */
  private calculateP95(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    const sorted = latencies.slice().sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index];
  }
}