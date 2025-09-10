/**
 * ElevenLabs Voice Integration for AI Girlfriend
 * Combined client-side bundle for browser
 */

// ========== Voice Activity Detection ==========
class VoiceActivityDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.01;
    this.silenceDuration = options.silenceDuration || 2000; // 2 seconds
    this.minSpeechDuration = options.minSpeechDuration || 300; // 300ms
    
    this.isActive = false;
    this.lastSpeechTime = 0;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.adaptiveThreshold = this.threshold;
    this.backgroundNoise = 0.005;
    
    this.state = 'silence'; // 'silence', 'speech', 'processing'
  }
  
  processFrame(rmsLevel, frameTimestamp) {
    // Update adaptive threshold based on background noise
    if (this.state === 'silence') {
      this.backgroundNoise = this.backgroundNoise * 0.999 + rmsLevel * 0.001;
      this.adaptiveThreshold = Math.max(this.threshold, this.backgroundNoise * 3);
    }
    
    const prevState = this.state;
    
    if (rmsLevel > this.adaptiveThreshold) {
      // Speech detected
      if (this.state === 'silence') {
        this.speechStartTime = frameTimestamp;
        this.state = 'speech';
      }
      this.lastSpeechTime = frameTimestamp;
      this.silenceStartTime = 0;
    } else {
      // Silence detected
      if (this.state === 'speech') {
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = frameTimestamp;
        } else if (frameTimestamp - this.silenceStartTime >= this.silenceDuration) {
          // End of speech after silence duration
          const speechDuration = this.lastSpeechTime - this.speechStartTime;
          
          if (speechDuration >= this.minSpeechDuration) {
            this.state = 'processing';
            return {
              state: this.state,
              speechDuration,
              confidence: Math.min(speechDuration / 1000, 1),
              endOfSpeech: true
            };
          } else {
            this.state = 'silence';
          }
        }
      }
    }
    
    return {
      state: this.state,
      rmsLevel,
      adaptiveThreshold: this.adaptiveThreshold,
      stateChanged: prevState !== this.state
    };
  }
  
  reset() {
    this.state = 'silence';
    this.lastSpeechTime = 0;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
  }
}

// ========== ElevenLabs Voice Client ==========
class ElevenLabsVoiceClient {
  constructor(config = {}) {
    this.config = {
      tokenEndpoint: config.tokenEndpoint || '/api/token/elevenlabs',
      proxyEndpoint: config.proxyEndpoint || '/api/proxy/elevenlabs',
      agentId: config.agentId || null,
      sampleRate: config.sampleRate || 16000,
      ...config
    };
    
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.audioWorkletNode = null;
    this.isConnected = false;
    this.isRecording = false;
    this.vad = new VoiceActivityDetector();
    
    this.listeners = {
      connect: [],
      disconnect: [],
      error: [],
      transcript: [],
      audioLevel: []
    };
  }
  
  addEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }
  
  removeEventListener(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index > -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }
  
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
  
  async getToken() {
    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: this.config.agentId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get ElevenLabs token:', error);
      throw error;
    }
  }
  
  async startCall() {
    try {
      console.log('Starting ElevenLabs voice call...');
      
      // Get WebSocket token
      const tokenData = await this.getToken();
      console.log('Got token, connecting to WebSocket...');
      
      // Setup audio context and media stream
      await this.setupAudio();
      
      // Connect to WebSocket (with fallback to proxy)
      await this.connectWebSocket(tokenData.ws_url);
      
      this.isConnected = true;
      this.emit('connect', { status: 'connected' });
      
      console.log('ElevenLabs voice call started successfully');
      
    } catch (error) {
      console.error('Failed to start voice call:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  async setupAudio() {
    try {
      // Get user media
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.config.sampleRate
      });
      
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Create media source
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Add audio worklet for processing
      await this.addAudioWorklet(source);
      
    } catch (error) {
      console.error('Failed to setup audio:', error);
      throw error;
    }
  }
  
  async addAudioWorklet(source) {
    try {
      // Create a simple ScriptProcessorNode as fallback to AudioWorklet
      const bufferSize = 1024;
      this.audioWorkletNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      this.audioWorkletNode.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        
        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rmsLevel = Math.sqrt(sum / inputBuffer.length);
        
        // Process with VAD
        const vadResult = this.vad.processFrame(rmsLevel, Date.now());
        
        // Emit audio level updates
        this.emit('audioLevel', {
          user: rmsLevel,
          assistant: 0, // Will be updated from WebSocket
          vadState: vadResult.state
        });
        
        // Convert to 16-bit PCM and send via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN && rmsLevel > 0.01) {
          const pcmData = this.floatTo16BitPCM(inputBuffer);
          this.ws.send(pcmData);
        }
      };
      
      // Connect audio nodes
      source.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);
      
    } catch (error) {
      console.error('Failed to add audio worklet:', error);
      throw error;
    }
  }
  
  floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, sample * 0x7FFF, true);
    }
    
    return buffer;
  }
  
  async connectWebSocket(wsUrl) {
    return new Promise((resolve, reject) => {
      try {
        // Try direct connection first
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';
        
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
        
        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log('WebSocket connected');
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };
        
        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('WebSocket error:', error);
          reject(error);
        };
        
        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
          this.emit('disconnect', { status: 'disconnected' });
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  handleWebSocketMessage(event) {
    try {
      if (typeof event.data === 'string') {
        // JSON message
        const message = JSON.parse(event.data);
        
        if (message.type === 'transcript') {
          this.emit('transcript', {
            type: message.role || 'assistant',
            text: message.text,
            timestamp: Date.now()
          });
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Binary audio data - would need audio playback implementation
        console.log('Received audio data:', event.data.byteLength, 'bytes');
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }
  
  async endCall() {
    try {
      console.log('Ending ElevenLabs voice call...');
      
      // Close WebSocket
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      
      // Stop audio processing
      if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect();
        this.audioWorkletNode = null;
      }
      
      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      // Close audio context
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }
      
      // Reset VAD
      this.vad.reset();
      
      this.isConnected = false;
      this.isRecording = false;
      
      this.emit('disconnect', { status: 'disconnected' });
      
      console.log('Voice call ended');
      
    } catch (error) {
      console.error('Error ending call:', error);
      this.emit('error', error);
    }
  }
}

// ========== Call Store ==========
class CallStore {
  constructor(callbacks = {}) {
    this.voiceClient = new ElevenLabsVoiceClient();
    this.isCallActive = false;
    this.callStartTime = null;
    this.currentTranscript = [];
    
    this.callbacks = {
      onCallStateChange: callbacks.onCallStateChange || (() => {}),
      onError: callbacks.onError || (() => {}),
      onTranscriptReceived: callbacks.onTranscriptReceived || (() => {}),
      onAudioLevelUpdate: callbacks.onAudioLevelUpdate || (() => {})
    };
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.voiceClient.addEventListener('connect', (data) => {
      this.isCallActive = true;
      this.callStartTime = Date.now();
      this.callbacks.onCallStateChange({ status: 'connected', ...data });
    });
    
    this.voiceClient.addEventListener('disconnect', (data) => {
      this.isCallActive = false;
      this.callStartTime = null;
      this.callbacks.onCallStateChange({ status: 'disconnected', ...data });
    });
    
    this.voiceClient.addEventListener('error', (error) => {
      this.callbacks.onError(error);
    });
    
    this.voiceClient.addEventListener('transcript', (transcript) => {
      this.currentTranscript.push(transcript);
      this.callbacks.onTranscriptReceived(transcript);
    });
    
    this.voiceClient.addEventListener('audioLevel', (levels) => {
      this.callbacks.onAudioLevelUpdate(levels);
    });
  }
  
  async startCall() {
    if (this.isCallActive) {
      throw new Error('Call is already active');
    }
    
    try {
      this.callbacks.onCallStateChange({ status: 'connecting' });
      await this.voiceClient.startCall();
    } catch (error) {
      this.callbacks.onError(error);
      throw error;
    }
  }
  
  async endCall() {
    if (!this.isCallActive) {
      return;
    }
    
    try {
      await this.voiceClient.endCall();
      
      // Save transcript if enabled
      if (this.currentTranscript.length > 0) {
        await this.saveTranscriptAsMoment();
      }
      
      this.currentTranscript = [];
    } catch (error) {
      this.callbacks.onError(error);
      throw error;
    }
  }
  
  async saveTranscriptAsMoment() {
    try {
      const transcript = this.currentTranscript.map(t => 
        `${t.type === 'user' ? 'Anh' : 'Bạn gái AI'}: ${t.text}`
      ).join('\n');
      
      const response = await fetch('/api/moments/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'voice_call',
          title: `Cuộc gọi thoại - ${new Date().toLocaleDateString('vi-VN')}`,
          content: transcript,
          language: 'vi'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save transcript');
      }
      
      console.log('Transcript saved as moment');
    } catch (error) {
      console.error('Failed to save transcript:', error);
    }
  }
  
  getCallDuration() {
    if (!this.callStartTime) return 0;
    return Math.floor((Date.now() - this.callStartTime) / 1000);
  }
}

// ========== Voice UI Integration ==========
class VoiceUIIntegration {
  constructor() {
    this.callStore = null;
    this.isInitialized = false;
    this.currentCall = null;
    this.callStartTime = null;
    this.durationInterval = null;
    
    // UI Elements
    this.voiceBtn = null;
    this.settingsBtn = null;
    this.settingsModal = null;
    this.messagesContainer = null;
    this.statusElement = null;
    
    // Voice settings
    this.settings = {
      saveTranscripts: true,
      showWaveforms: true
    };
    
    this.init();
  }
  
  async init() {
    try {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupUI());
      } else {
        this.setupUI();
      }
    } catch (error) {
      console.error('Voice UI Integration failed to initialize:', error);
    }
  }
  
  setupUI() {
    // Get existing UI elements
    this.voiceBtn = document.getElementById('voice-btn');
    this.settingsBtn = document.getElementById('settings-btn');
    this.settingsModal = document.getElementById('settings-modal');
    this.messagesContainer = document.getElementById('messages');
    this.statusElement = document.getElementById('status');
    
    if (!this.voiceBtn) {
      console.error('Voice button not found in DOM');
      return;
    }
    
    // Initialize CallStore
    this.callStore = new CallStore({
      onCallStateChange: this.handleCallStateChange.bind(this),
      onError: this.handleError.bind(this),
      onTranscriptReceived: this.handleTranscriptReceived.bind(this),
      onAudioLevelUpdate: this.handleAudioLevelUpdate.bind(this)
    });
    
    this.setupVoiceButton();
    this.setupSettingsIntegration();
    this.createCallPill();
    this.loadSettings();
    
    this.isInitialized = true;
    console.log('Voice UI Integration initialized successfully');
  }
  
  setupVoiceButton() {
    // Update voice button to handle calls
    this.voiceBtn.addEventListener('click', async () => {
      try {
        if (this.currentCall?.isActive) {
          await this.endCall();
        } else {
          await this.startCall();
        }
      } catch (error) {
        console.error('Voice button action failed:', error);
        this.showError('Không thể kết nối cuộc gọi thoại. Vui lòng thử lại.');
      }
    });
    
    // Add visual indicators
    this.updateVoiceButtonState(false);
  }
  
  setupSettingsIntegration() {
    if (!this.settingsModal) return;
    
    // Add voice settings to existing settings modal
    const settingsContent = this.settingsModal.querySelector('div.space-y-4');
    if (settingsContent) {
      const voiceSettingsHTML = `
        <div class="border-t pt-4 mt-4">
          <h4 class="font-medium text-gray-900 mb-3">Cài đặt cuộc gọi thoại</h4>
          
          <div class="space-y-3">
            <label class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Lưu bản ghi âm vào Kỷ niệm</span>
              <input type="checkbox" id="save-transcripts" ${this.settings.saveTranscripts ? 'checked' : ''} 
                     class="rounded border-gray-300 text-girlfriend-600 focus:ring-girlfriend-500">
            </label>
            
            <label class="flex items-center justify-between">
              <span class="text-sm text-gray-700">Hiển thị sóng âm thanh</span>
              <input type="checkbox" id="show-waveforms" ${this.settings.showWaveforms ? 'checked' : ''} 
                     class="rounded border-gray-300 text-girlfriend-600 focus:ring-girlfriend-500">
            </label>
          </div>
        </div>
      `;
      
      settingsContent.insertAdjacentHTML('beforeend', voiceSettingsHTML);
      
      // Add event listeners
      document.getElementById('save-transcripts')?.addEventListener('change', (e) => {
        this.settings.saveTranscripts = e.target.checked;
        this.saveSettings();
      });
      
      document.getElementById('show-waveforms')?.addEventListener('change', (e) => {
        this.settings.showWaveforms = e.target.checked;
        this.saveSettings();
      });
    }
  }
  
  createCallPill() {
    // Create floating call pill container
    const callPill = document.createElement('div');
    callPill.id = 'voice-call-pill';
    callPill.className = 'fixed left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 translate-y-4 opacity-0 pointer-events-none';
    callPill.style.bottom = '100px';
    
    callPill.innerHTML = `
      <div class="bg-black bg-opacity-90 backdrop-blur-sm text-white rounded-full px-6 py-3 shadow-2xl border border-gray-600">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <span class="text-sm font-medium" id="call-status">Cuộc gọi thoại</span>
          </div>
          
          <div class="text-lg font-mono font-semibold min-w-[3rem]" id="call-duration">0:00</div>
          
          <div class="flex items-center">
            <i class="fas fa-signal text-green-500 text-sm" id="call-quality"></i>
          </div>
          
          <button id="end-call-btn" class="bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-colors duration-200 active:scale-95" title="Kết thúc cuộc gọi">
            <i class="fas fa-phone-slash text-sm"></i>
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(callPill);
    
    // Add end call button listener
    document.getElementById('end-call-btn')?.addEventListener('click', () => this.endCall());
  }
  
  async startCall() {
    if (!this.callStore) {
      throw new Error('CallStore not initialized');
    }
    
    try {
      // Update UI to connecting state
      this.updateVoiceButtonState(true, 'connecting');
      this.updateStatus('Đang kết nối cuộc gọi thoại...');
      
      // Start the call
      await this.callStore.startCall();
      
      this.currentCall = { isActive: true };
      this.callStartTime = Date.now();
      
      // Start duration counter
      this.durationInterval = setInterval(() => {
        this.updateCallDuration();
      }, 1000);
      
      // Show call pill
      this.showCallPill(true);
      
      // Add system message
      this.addSystemMessage('🎙️ Cuộc gọi thoại đã bắt đầu. Nói chuyện với bạn gái AI của anh!');
      
    } catch (error) {
      this.updateVoiceButtonState(false);
      this.updateStatus('Trực Tuyến • Chế Độ Quan Tâm');
      throw error;
    }
  }
  
  async endCall() {
    if (!this.callStore || !this.currentCall?.isActive) return;
    
    try {
      // Update UI
      this.updateVoiceButtonState(false);
      this.showCallPill(false);
      
      // Stop duration counter
      if (this.durationInterval) {
        clearInterval(this.durationInterval);
        this.durationInterval = null;
      }
      
      // End the call
      await this.callStore.endCall();
      
      const duration = this.callStartTime ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
      
      this.currentCall = null;
      this.callStartTime = null;
      
      // Update status
      this.updateStatus('Trực Tuyến • Chế Độ Quan Tâm');
      
      // Add system message
      this.addSystemMessage(`📞 Cuộc gọi kết thúc. Thời gian: ${this.formatDuration(duration)}`);
      
    } catch (error) {
      console.error('Error ending call:', error);
    }
  }
  
  handleCallStateChange(state) {
    console.log('Call state changed:', state);
    
    switch (state.status) {
      case 'connecting':
        this.updateVoiceButtonState(true, 'connecting');
        break;
      case 'connected':
        this.updateVoiceButtonState(true, 'active');
        this.updateStatus('🎙️ Đang trong cuộc gọi thoại');
        break;
      case 'disconnected':
        this.updateVoiceButtonState(false);
        this.showCallPill(false);
        break;
    }
  }
  
  handleError(error) {
    console.error('Voice call error:', error);
    this.showError(`Lỗi cuộc gọi: ${error.message}`);
    this.updateVoiceButtonState(false);
    this.showCallPill(false);
  }
  
  handleTranscriptReceived(transcript) {
    if (transcript.type === 'user') {
      this.addUserMessage(transcript.text, true); // isVoice = true
    } else if (transcript.type === 'assistant') {
      this.addAssistantMessage(transcript.text, true); // isVoice = true
    }
  }
  
  handleAudioLevelUpdate(levels) {
    // Update waveforms in the last bot message
    this.updateWaveformsInLastMessage(levels);
  }
  
  updateVoiceButtonState(isActive, state = 'active') {
    if (!this.voiceBtn) return;
    
    const icon = this.voiceBtn.querySelector('i');
    
    if (isActive) {
      if (state === 'connecting') {
        this.voiceBtn.className = 'p-3 rounded-full bg-yellow-100 text-yellow-600 animate-pulse transition-colors';
        icon.className = 'fas fa-circle-notch fa-spin';
      } else {
        this.voiceBtn.className = 'p-3 rounded-full bg-red-100 text-red-600 animate-pulse transition-colors';
        icon.className = 'fas fa-phone';
      }
    } else {
      this.voiceBtn.className = 'p-3 rounded-full bg-girlfriend-100 text-girlfriend-600 hover:bg-girlfriend-200 transition-colors';
      icon.className = 'fas fa-microphone';
    }
  }
  
  showCallPill(show) {
    const callPill = document.getElementById('voice-call-pill');
    if (!callPill) return;
    
    if (show) {
      callPill.className = 'fixed left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 translate-y-0 opacity-100 pointer-events-auto';
    } else {
      callPill.className = 'fixed left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 translate-y-4 opacity-0 pointer-events-none';
    }
  }
  
  updateCallDuration() {
    if (!this.callStartTime) return;
    
    const duration = Math.floor((Date.now() - this.callStartTime) / 1000);
    const durationElement = document.getElementById('call-duration');
    if (durationElement) {
      durationElement.textContent = this.formatDuration(duration);
    }
  }
  
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  updateStatus(status) {
    if (this.statusElement) {
      this.statusElement.textContent = status;
    }
  }
  
  addSystemMessage(text) {
    if (!this.messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-center mb-3';
    messageDiv.innerHTML = `
      <div class="bg-gray-100 border border-gray-200 text-gray-600 px-3 py-2 rounded-full text-sm">
        ${text}
      </div>
    `;
    
    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }
  
  addUserMessage(text, isVoice = false) {
    if (!this.messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-end mb-3';
    messageDiv.innerHTML = `
      <div class="max-w-xs lg:max-w-md">
        <div class="bg-girlfriend-500 text-white rounded-lg px-4 py-2 shadow-sm">
          ${isVoice ? '<i class="fas fa-microphone mr-2 text-xs"></i>' : ''}
          <p class="text-sm">${text}</p>
        </div>
      </div>
    `;
    
    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }
  
  addAssistantMessage(text, isVoice = false) {
    if (!this.messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex items-start space-x-3 mb-3';
    
    const waveformHTML = this.settings.showWaveforms && isVoice ? 
      '<div id="assistant-waveform" class="mt-2 flex justify-center"><canvas width="80" height="32" class="waveform-canvas"></canvas></div>' : '';
    
    messageDiv.innerHTML = `
      <div class="w-8 h-8 bg-gradient-to-br from-girlfriend-400 to-girlfriend-600 rounded-full flex items-center justify-center text-white text-sm">
        <i class="fas fa-heart"></i>
      </div>
      <div class="max-w-xs lg:max-w-md">
        <div class="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
          ${isVoice ? '<i class="fas fa-volume-up mr-2 text-xs text-girlfriend-500"></i>' : ''}
          <p class="text-sm text-gray-800">${text}</p>
          ${waveformHTML}
        </div>
      </div>
    `;
    
    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }
  
  updateWaveformsInLastMessage(levels) {
    if (!this.settings.showWaveforms) return;
    
    const canvas = document.querySelector('#assistant-waveform canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Simple waveform animation
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const barCount = 7;
    const barWidth = 4;
    const gap = 3;
    const maxHeight = canvas.height;
    
    for (let i = 0; i < barCount; i++) {
      const barHeight = Math.max((levels.assistant || 0) * maxHeight * (Math.random() * 0.5 + 0.5), 2);
      const x = i * (barWidth + gap);
      const y = (maxHeight - barHeight) / 2;
      
      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, '#8b5cf6');
      gradient.addColorStop(1, '#8b5cf6' + '80');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }
  
  showError(message) {
    // Create temporary error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg shadow-lg z-50';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
  
  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }
  
  saveSettings() {
    localStorage.setItem('voice-ui-settings', JSON.stringify(this.settings));
  }
  
  loadSettings() {
    try {
      const saved = localStorage.getItem('voice-ui-settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load voice settings:', error);
    }
  }
}

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', function() {
  window.voiceUIIntegration = new VoiceUIIntegration();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VoiceUIIntegration, CallStore, ElevenLabsVoiceClient };
}