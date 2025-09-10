/**
 * ElevenLabs Realtime Client
 * Handles WebRTC + WebSocket fallback for low-latency voice calls
 * Manages connection, audio streaming, and call state
 */

import { VoiceActivityDetector } from './vad';

interface ElevenLabsConfig {
  tokenUrl: string;
  proxyUrl?: string;
  sampleRate: number;
  channels: number;
  vadEnabled: boolean;
}

interface CallMetrics {
  startTime: number;
  endTime?: number;
  duration: number;
  latencies: number[];
  reconnections: number;
  packetDrops: number;
}

interface CallState {
  status: 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'disconnected' | 'error';
  callId: string;
  startTime?: number;
  metrics: CallMetrics;
}

export type CallEventType = 'state_change' | 'audio_in' | 'audio_out' | 'transcript' | 'error' | 'metrics';

export interface CallEvent {
  type: CallEventType;
  data: any;
  timestamp: number;
}

export class ElevenLabsVoiceClient extends EventTarget {
  private config: ElevenLabsConfig;
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  private vad: VoiceActivityDetector;
  
  private state: CallState = {
    status: 'idle',
    callId: '',
    metrics: {
      startTime: 0,
      duration: 0,
      latencies: [],
      reconnections: 0,
      packetDrops: 0,
    },
  };

  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private reconnectTimer: any = null;
  
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;
  private playbackStartTime = 0;

  constructor(config: Partial<ElevenLabsConfig> = {}) {
    super();
    
    this.config = {
      tokenUrl: '/api/token/elevenlabs',
      sampleRate: 16000,
      channels: 1,
      vadEnabled: true,
      ...config,
    };

    this.vad = new VoiceActivityDetector({
      sampleRate: this.config.sampleRate,
      frameSize: 320, // 20ms
    });

    this.bindMethods();
  }

  private bindMethods(): void {
    this.handleWorkletMessage = this.handleWorkletMessage.bind(this);
    this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
    this.handleWebSocketClose = this.handleWebSocketClose.bind(this);
    this.handleWebSocketError = this.handleWebSocketError.bind(this);
  }

  /**
   * Start a new voice call
   */
  async startCall(userId: string): Promise<void> {
    try {
      this.setState('connecting');
      this.state.callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.state.metrics.startTime = Date.now();

      // Get media permissions
      await this.initializeAudio();
      
      // Get ElevenLabs token
      const token = await this.getToken(userId);
      
      // Connect to ElevenLabs
      await this.connectWebSocket(token);
      
      this.setState('connected');
      
    } catch (error) {
      console.error('Failed to start call:', error);
      this.setState('error');
      this.emit('error', { error: error.message });
    }
  }

  /**
   * End the current call
   */
  async endCall(): Promise<CallMetrics> {
    try {
      this.setState('disconnected');
      
      // Calculate final metrics
      const endTime = Date.now();
      this.state.metrics.endTime = endTime;
      this.state.metrics.duration = (endTime - this.state.metrics.startTime) / 1000;
      
      // Close connections
      if (this.ws) {
        this.ws.close(1000, 'Call ended');
        this.ws = null;
      }
      
      // Stop audio processing
      await this.cleanup();
      
      const metrics = { ...this.state.metrics };
      this.resetState();
      
      return metrics;
      
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  }

  /**
   * Get call state
   */
  getState(): CallState {
    return { ...this.state };
  }

  /**
   * Initialize audio context and capture
   */
  private async initializeAudio(): Promise<void> {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000,
      },
    });

    this.mediaStream = stream;

    // Create audio context
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.config.sampleRate,
    });

    // Load and create audio worklet
    await this.audioContext.audioWorklet.addModule('/static/voice/audioWorklet.js');
    
    this.audioWorklet = new AudioWorkletNode(this.audioContext, 'voice-processor');
    this.audioWorklet.port.onmessage = this.handleWorkletMessage;

    // Connect audio pipeline
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.audioWorklet);
    this.audioWorklet.connect(this.audioContext.destination);
  }

  /**
   * Get authentication token from server
   */
  private async getToken(userId: string): Promise<any> {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Connect to ElevenLabs WebSocket
   */
  private async connectWebSocket(token: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Try direct connection first, fallback to proxy
        const wsUrl = token.ws_url || this.config.proxyUrl;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('Connected to ElevenLabs');
          this.reconnectAttempts = 0;
          
          // Send initial configuration
          this.sendMessage({
            type: 'config',
            config: {
              sample_rate: this.config.sampleRate,
              channels: this.config.channels,
            },
          });
          
          resolve();
        };

        this.ws.onmessage = this.handleWebSocketMessage;
        this.ws.onclose = this.handleWebSocketClose;
        this.ws.onerror = this.handleWebSocketError;

        // Connection timeout
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle messages from audio worklet
   */
  private handleWorkletMessage(event: MessageEvent): void {
    const { type, data } = event.data;

    switch (type) {
      case 'audio':
        // Send audio to ElevenLabs if connected and speaking
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.sendAudioData(data);
        }
        break;

      case 'level':
        // Emit level data for UI
        this.emit('audio_in', {
          level: data.level,
          speaking: data.speaking,
        });
        
        // Update call state based on speaking
        if (data.speaking && this.state.status === 'connected') {
          this.setState('speaking');
        } else if (!data.speaking && this.state.status === 'speaking') {
          this.setState('listening');
        }
        break;
    }
  }

  /**
   * Handle WebSocket messages from ElevenLabs
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      // Handle binary audio data
      if (event.data instanceof ArrayBuffer) {
        this.handleAudioResponse(new Uint8Array(event.data));
        return;
      }

      // Handle JSON messages
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'transcript':
          this.emit('transcript', {
            text: message.text,
            final: message.final,
          });
          break;

        case 'audio':
          if (message.data) {
            const audioData = new Uint8Array(atob(message.data).split('').map(c => c.charCodeAt(0)));
            this.handleAudioResponse(audioData);
          }
          break;

        case 'error':
          console.error('ElevenLabs error:', message.message);
          this.emit('error', { error: message.message });
          break;

        case 'latency':
          // Track latency metrics
          this.state.metrics.latencies.push(message.value);
          this.emit('metrics', { latency: message.value });
          break;
      }

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleWebSocketClose(event: CloseEvent): void {
    console.log('WebSocket closed:', event.code, event.reason);
    
    if (this.state.status !== 'disconnected' && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleWebSocketError(event: Event): void {
    console.error('WebSocket error:', event);
    this.state.metrics.packetDrops++;
  }

  /**
   * Send audio data to ElevenLabs
   */
  private sendAudioData(audioData: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  /**
   * Handle audio response from ElevenLabs
   */
  private async handleAudioResponse(audioData: Uint8Array): Promise<void> {
    if (!this.audioContext) return;

    try {
      // Convert PCM to Float32Array
      const floatArray = new Float32Array(audioData.length / 2);
      const dataView = new DataView(audioData.buffer);
      
      for (let i = 0; i < floatArray.length; i++) {
        floatArray[i] = dataView.getInt16(i * 2, true) / 32768.0;
      }

      // Play audio immediately
      await this.playAudio(floatArray);
      
      this.emit('audio_out', {
        level: this.calculateLevel(floatArray),
        duration: floatArray.length / this.config.sampleRate,
      });

    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  /**
   * Play audio data through speakers
   */
  private async playAudio(audioData: Float32Array): Promise<void> {
    if (!this.audioContext) return;

    const buffer = this.audioContext.createBuffer(1, audioData.length, this.config.sampleRate);
    buffer.copyToChannel(audioData, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();
  }

  /**
   * Calculate audio level for UI feedback
   */
  private calculateLevel(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * Send JSON message to ElevenLabs
   */
  private sendMessage(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    this.reconnectAttempts++;
    this.state.metrics.reconnections++;
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        const token = await this.getToken('current_user'); // Should get from state
        await this.connectWebSocket(token);
        this.setState('connected');
      } catch (error) {
        console.error('Reconnect failed:', error);
        this.attemptReconnect();
      }
    }, delay);
  }

  /**
   * Set call state and emit event
   */
  private setState(status: CallState['status']): void {
    const oldStatus = this.state.status;
    this.state.status = status;
    
    if (oldStatus !== status) {
      this.emit('state_change', {
        from: oldStatus,
        to: status,
        callId: this.state.callId,
      });
    }
  }

  /**
   * Emit custom event
   */
  private emit(type: CallEventType, data: any): void {
    const event = new CustomEvent(type, {
      detail: { type, data, timestamp: Date.now() },
    });
    this.dispatchEvent(event);
  }

  /**
   * Cleanup audio resources
   */
  private async cleanup(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Reset call state
   */
  private resetState(): void {
    this.state = {
      status: 'idle',
      callId: '',
      metrics: {
        startTime: 0,
        duration: 0,
        latencies: [],
        reconnections: 0,
        packetDrops: 0,
      },
    };
  }
}