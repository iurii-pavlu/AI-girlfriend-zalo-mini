// AI Girlfriend Zalo Mini App - Frontend Application
class AIGirlfriendApp {
  constructor() {
    this.sessionId = localStorage.getItem('sessionId') || null;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingStartTime = null;
    this.recordingTimer = null;
    
    // Initialize app
    this.init();
  }

  async init() {
    console.log('🚀 Initializing AI Girlfriend App...');
    
    // Show loading for 2 seconds
    setTimeout(() => {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('main-app').classList.remove('hidden');
      
      this.setupEventListeners();
      this.loadWelcomeMessage();
      
      console.log('✅ App initialized successfully');
    }, 2000);
  }

  setupEventListeners() {
    // Send message button
    document.getElementById('send-btn').addEventListener('click', () => {
      this.sendTextMessage();
    });

    // Enter key for message input
    document.getElementById('message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });

    // Voice recording button
    const voiceBtn = document.getElementById('voice-btn');
    voiceBtn.addEventListener('mousedown', () => this.startRecording());
    voiceBtn.addEventListener('mouseup', () => this.stopRecording());
    voiceBtn.addEventListener('mouseleave', () => this.stopRecording());
    
    // Touch events for mobile
    voiceBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startRecording();
    });
    voiceBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopRecording();
    });

    // Settings modal
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.openSettings();
    });
    document.getElementById('cancel-settings').addEventListener('click', () => {
      this.closeSettings();
    });
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Video call modal
    document.getElementById('video-call-btn').addEventListener('click', () => {
      this.openVideoModal();
    });
    document.getElementById('close-video-modal').addEventListener('click', () => {
      this.closeVideoModal();
    });

    // Speaking rate slider
    document.getElementById('speaking-rate').addEventListener('input', (e) => {
      document.getElementById('rate-display').textContent = `${e.target.value}x`;
    });

    // Close modals when clicking outside
    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal') {
        this.closeSettings();
      }
    });

    document.getElementById('video-modal').addEventListener('click', (e) => {
      if (e.target.id === 'video-modal') {
        this.closeVideoModal();
      }
    });

    console.log('✅ Event listeners set up');
  }

  loadWelcomeMessage() {
    const welcomeMessage = {
      role: 'assistant',
      content: "Hi there! I'm your AI girlfriend companion! 💕 You can chat with me using text or voice messages. Just hold the microphone button to record your voice, or type your message. How are you feeling today?",
      timestamp: new Date().toISOString()
    };

    this.displayMessage(welcomeMessage);
  }

  async sendTextMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;

    // Clear input and disable send button
    input.value = '';
    this.setLoading(true);

    // Display user message immediately
    this.displayMessage({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });

    try {
      console.log('📤 Sending text message:', text);

      const response = await axios.post('/api/message', {
        text: text,
        sessionId: this.sessionId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId || ''
        }
      });

      const data = response.data;
      
      // Update session ID
      if (data.sessionId) {
        this.sessionId = data.sessionId;
        localStorage.setItem('sessionId', this.sessionId);
      }

      // Display assistant response
      this.displayMessage({
        role: 'assistant',
        content: data.text,
        audioUrl: data.audioUrl,
        timestamp: new Date().toISOString()
      });

      console.log('✅ Message sent successfully');
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
      
      this.displayMessage({
        role: 'assistant',
        content: "Sorry, I'm having some trouble right now. Please try again! 💕",
        timestamp: new Date().toISOString()
      });
    } finally {
      this.setLoading(false);
    }
  }

  async startRecording() {
    if (this.isRecording) return;

    try {
      console.log('🎤 Starting voice recording...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        } 
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.recordedChunks = [];
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      // Show recording UI
      document.getElementById('voice-recording').classList.remove('hidden');
      document.getElementById('voice-btn').innerHTML = '<i class="fas fa-stop"></i>';
      document.getElementById('voice-btn').classList.add('bg-red-500', 'text-white');
      document.getElementById('voice-btn').classList.remove('bg-girlfriend-100', 'text-girlfriend-600');

      // Start recording timer
      this.recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('recording-time').textContent = 
          `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }, 1000);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.processRecording();
      };

      this.mediaRecorder.start();
      
      console.log('✅ Recording started');
      
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      this.showError('Could not access microphone. Please check permissions.');
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    console.log('🛑 Stopping voice recording...');
    
    this.isRecording = false;
    this.mediaRecorder.stop();
    
    // Stop all tracks to release microphone
    const tracks = this.mediaRecorder.stream.getTracks();
    tracks.forEach(track => track.stop());

    // Clear recording timer
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    // Hide recording UI
    document.getElementById('voice-recording').classList.add('hidden');
    document.getElementById('voice-btn').innerHTML = '<i class="fas fa-microphone"></i>';
    document.getElementById('voice-btn').classList.remove('bg-red-500', 'text-white');
    document.getElementById('voice-btn').classList.add('bg-girlfriend-100', 'text-girlfriend-600');
  }

  async processRecording() {
    if (this.recordedChunks.length === 0) return;

    this.setLoading(true);

    try {
      console.log('🎵 Processing recorded audio...');
      
      // Create blob from recorded chunks
      const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
      
      // Display user voice message
      this.displayMessage({
        role: 'user',
        content: '🎤 Voice message',
        isVoice: true,
        timestamp: new Date().toISOString()
      });

      const response = await axios.post('/api/message', blob, {
        headers: {
          'Content-Type': 'audio/webm',
          'X-Session-Id': this.sessionId || ''
        }
      });

      const data = response.data;
      
      // Update session ID
      if (data.sessionId) {
        this.sessionId = data.sessionId;
        localStorage.setItem('sessionId', this.sessionId);
      }

      // Display assistant response with audio
      this.displayMessage({
        role: 'assistant',
        content: data.text,
        audioUrl: data.audioUrl,
        timestamp: new Date().toISOString()
      });

      console.log('✅ Voice message processed successfully');
      
    } catch (error) {
      console.error('❌ Error processing voice message:', error);
      
      this.displayMessage({
        role: 'assistant',
        content: "Sorry, I couldn't understand your voice message. Please try again! 🎤💕",
        timestamp: new Date().toISOString()
      });
    } finally {
      this.setLoading(false);
    }
  }

  displayMessage(message) {
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    
    const isUser = message.role === 'user';
    const time = new Date(message.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    messageDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`;
    
    let audioPlayer = '';
    if (message.audioUrl) {
      audioPlayer = `
        <div class="mt-2">
          <audio controls class="w-full max-w-xs">
            <source src="${message.audioUrl}" type="audio/mpeg">
            Your browser does not support the audio element.
          </audio>
        </div>
      `;
    }

    messageDiv.innerHTML = `
      <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
        isUser 
          ? 'bg-gradient-to-r from-girlfriend-500 to-girlfriend-600 text-white' 
          : 'bg-white shadow-md border border-gray-200 text-gray-800'
      }">
        <div class="flex items-start space-x-2">
          ${!isUser ? `
            <div class="w-6 h-6 bg-gradient-to-r from-girlfriend-400 to-girlfriend-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <i class="fas fa-heart text-white text-xs"></i>
            </div>
          ` : ''}
          <div class="flex-1">
            <div class="text-sm ${message.isVoice ? 'italic' : ''}">${message.content}</div>
            ${audioPlayer}
            <div class="text-xs ${isUser ? 'text-girlfriend-100' : 'text-gray-400'} mt-1">${time}</div>
          </div>
        </div>
      </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Auto-play audio if available (with user gesture requirement handled)
    if (message.audioUrl) {
      setTimeout(() => {
        const audio = messageDiv.querySelector('audio');
        if (audio) {
          audio.play().catch(() => {
            // Auto-play failed, user needs to manually play
            console.log('Auto-play prevented by browser policy');
          });
        }
      }, 500);
    }
  }

  setLoading(loading) {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('message-input');
    
    if (loading) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i>';
      input.disabled = true;
    } else {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
      input.disabled = false;
      input.focus();
    }
  }

  openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    
    // Load current settings
    const voiceId = localStorage.getItem('voiceId') || 'en-US-Neural2-F';
    const speakingRate = localStorage.getItem('speakingRate') || '1.0';
    const persona = localStorage.getItem('persona') || 'caring_girlfriend';
    
    document.getElementById('voice-select').value = voiceId;
    document.getElementById('speaking-rate').value = speakingRate;
    document.getElementById('rate-display').textContent = `${speakingRate}x`;
    document.getElementById('persona-select').value = persona;
  }

  closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  saveSettings() {
    const voiceId = document.getElementById('voice-select').value;
    const speakingRate = document.getElementById('speaking-rate').value;
    const persona = document.getElementById('persona-select').value;
    
    // Save to localStorage
    localStorage.setItem('voiceId', voiceId);
    localStorage.setItem('speakingRate', speakingRate);
    localStorage.setItem('persona', persona);
    
    // Update status display
    const personaNames = {
      'caring_girlfriend': 'Caring Mode',
      'playful_girlfriend': 'Playful Mode',
      'shy_girlfriend': 'Shy Mode'
    };
    
    document.getElementById('status').textContent = `Online • ${personaNames[persona]}`;
    
    this.closeSettings();
    
    // Show confirmation
    this.showMessage('Settings saved! 💕');
  }

  openVideoModal() {
    document.getElementById('video-modal').classList.remove('hidden');
  }

  closeVideoModal() {
    document.getElementById('video-modal').classList.add('hidden');
  }

  showMessage(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-girlfriend-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.aiGirlfriend = new AIGirlfriendApp();
});

// Handle Zalo Mini App specific events
if (typeof window !== 'undefined') {
  // Zalo Mini App lifecycle events
  window.addEventListener('focus', () => {
    console.log('🎯 App focused');
  });
  
  window.addEventListener('blur', () => {
    console.log('🎯 App blurred');
  });

  // Handle back button (Zalo Mini App)
  window.addEventListener('popstate', (event) => {
    console.log('🔙 Back button pressed');
    // Handle navigation if needed
  });

  // Prevent context menu on long press (mobile optimization)
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Handle orientation change
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      // Scroll to bottom of messages after orientation change
      const messages = document.getElementById('messages');
      if (messages) {
        messages.scrollTop = messages.scrollHeight;
      }
    }, 500);
  });
}