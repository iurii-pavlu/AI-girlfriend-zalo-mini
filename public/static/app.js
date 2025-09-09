// AI Girlfriend Zalo Mini App - Frontend Application
class AIGirlfriendApp {
  constructor() {
    this.sessionId = localStorage.getItem('sessionId') || null;
    this.userId = this.generateUserId();
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingStartTime = null;
    this.recordingTimer = null;
    this.subscriptionStatus = null;
    this.referralStats = null;
    this.selectedPlan = 'monthly';
    
    // Private Mode properties
    this.privateMode = window.PRIVATE_MODE || false;
    this.stealthSession = window.STEALTH_SESSION || null;
    this.entryMode = window.ENTRY_MODE || 'normal';
    this.privateModeSettings = null;
    
    // Initialize app
    this.init();
  }

  generateUserId() {
    // Use session storage for private mode to avoid persistent tracking
    const storage = this.privateMode ? sessionStorage : localStorage;
    
    let userId = storage.getItem('userId');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(7);
      storage.setItem('userId', userId);
    }
    return userId;
  }

  async init() {
    console.log('🚀 Initializing AI Girlfriend App...');
    
    // Initialize private mode if enabled
    if (this.privateMode) {
      await this.initializePrivateMode();
    }
    
    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('ref');
    
    try {
      // Load subscription status
      await this.loadSubscriptionStatus(referralCode);
      
      // Load private mode settings if enabled
      if (this.privateMode) {
        await this.loadPrivateModeSettings();
      }
      
      // Show loading for 2 seconds (or shorter in stealth mode)
      const loadingTime = this.privateMode ? 1000 : 2000;
      setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-app').classList.remove('hidden');
        
        this.setupEventListeners();
        this.loadWelcomeMessage();
        this.updateSubscriptionUI();
        
        if (this.privateMode) {
          this.setupPrivateModeUI();
        }
        
        console.log('✅ App initialized successfully');
      }, loadingTime);
    } catch (error) {
      console.error('❌ Initialization error:', error);
      // Continue with app loading even if subscription check fails
      setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-app').classList.remove('hidden');
        this.setupEventListeners();
        this.loadWelcomeMessage();
      }, 2000);
    }
  }

  async loadSubscriptionStatus(referralCode = null) {
    try {
      const url = referralCode 
        ? `/api/subscription/status?ref=${referralCode}` 
        : '/api/subscription/status';
        
      const response = await axios.get(url, {
        headers: {
          'X-User-Id': this.userId
        }
      });

      const data = response.data;
      this.subscriptionStatus = data.subscription;
      this.referralStats = data.referral;
      
      console.log('📊 Subscription status loaded:', this.subscriptionStatus);
      
      // Show welcome bonus if referred
      if (referralCode && data.user) {
        this.showMessage('Chào mừng! Anh đã được tặng 1 ngày miễn phí! 🎁');
      }
      
    } catch (error) {
      console.error('❌ Error loading subscription:', error);
      // Set default status
      this.subscriptionStatus = {
        canChat: true,
        messagesLeft: 10,
        subscriptionType: 'free',
        needsPayment: false,
        showPaywall: false
      };
    }
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

    // Sticker picker button
    document.getElementById('sticker-btn').addEventListener('click', () => {
      this.toggleStickerPicker();
    });
    
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

    // Subscription and payment events
    document.getElementById('close-paywall').addEventListener('click', () => {
      this.closePaywall();
    });
    document.getElementById('invite-friends').addEventListener('click', () => {
      this.openReferral();
    });
    document.getElementById('subscribe-now').addEventListener('click', () => {
      this.startSubscription();
    });

    // Referral events
    document.getElementById('close-referral').addEventListener('click', () => {
      this.closeReferral();
    });
    document.getElementById('share-referral').addEventListener('click', () => {
      this.shareReferral();
    });
    document.getElementById('copy-referral').addEventListener('click', () => {
      this.copyReferralLink();
    });

    // Payment events
    document.getElementById('close-payment-success').addEventListener('click', () => {
      this.closePaymentModal();
    });

    // Plan selection
    document.querySelectorAll('[data-plan]').forEach(plan => {
      plan.addEventListener('click', () => {
        this.selectPlan(plan.dataset.plan);
      });
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

    document.getElementById('paywall-modal').addEventListener('click', (e) => {
      if (e.target.id === 'paywall-modal') {
        this.closePaywall();
      }
    });

    document.getElementById('referral-modal').addEventListener('click', (e) => {
      if (e.target.id === 'referral-modal') {
        this.closeReferral();
      }
    });

    console.log('✅ Event listeners set up');
  }

  loadWelcomeMessage() {
    const welcomeMessage = {
      role: 'assistant',
      content: "Chào anh! Em là bạn gái AI của anh đây! 💕 Anh có thể chat với em bằng tin nhắn văn bản hoặc giọng nói. Chỉ cần giữ nút micro để ghi âm, hoặc gõ tin nhắn. Hôm nay anh cảm thấy thế nào?",
      timestamp: new Date().toISOString()
    };

    this.displayMessage(welcomeMessage);
  }

  async sendTextMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;

    // Check subscription before sending
    if (!this.subscriptionStatus || !this.subscriptionStatus.canChat) {
      if (this.checkAndShowPaywall()) {
        return;
      }
    }

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

      const response = await axios.post('/api/chat', {
        text: text,
        sessionId: this.sessionId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId || '',
          'X-User-Id': this.userId
        }
      });

      const data = response.data;
      
      // Update session ID
      if (data.sessionId) {
        this.sessionId = data.sessionId;
        localStorage.setItem('sessionId', this.sessionId);
      }

      // Update subscription status
      if (data.subscriptionStatus) {
        this.subscriptionStatus = data.subscriptionStatus;
        this.updateSubscriptionUI();
      }

      // Display assistant response with sticker if available
      this.displayMessage({
        role: 'assistant',
        content: data.reply,
        stickerUrl: data.stickerUrl,
        timestamp: new Date().toISOString()
      });

      // Check if should show paywall after this message
      if (data.showPaywall) {
        setTimeout(() => {
          this.openPaywall();
        }, 1000);
      }

      console.log('✅ Message sent successfully');
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
      
      // Handle subscription limit errors
      if (error.response && error.response.status === 403) {
        const errorData = error.response.data;
        if (errorData.needsPayment) {
          this.subscriptionStatus = errorData.subscriptionStatus;
          this.openPaywall();
          return;
        }
      }
      
      this.displayMessage({
        role: 'assistant',
        content: "Xin lỗi anh, em đang gặp một chút khó khăn. Anh thử lại nhé! 💕",
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
      this.showError('Không thể truy cập micro. Vui lòng kiểm tra quyền truy cập.');
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
        content: '🎤 Tin nhắn thoại',
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
        content: "Xin lỗi anh, em không hiểu tin nhắn thoại của anh. Anh thử lại nhé! 🎤💕",
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

    let stickerDisplay = '';
    if (message.stickerUrl) {
      stickerDisplay = `
        <div class="mt-2">
          <img src="${message.stickerUrl}" alt="Sticker" class="w-20 h-20 object-contain rounded-lg">
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
            ${stickerDisplay}
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
      'caring_girlfriend': 'Chế Độ Quan Tâm',
      'playful_girlfriend': 'Chế Độ Vui Tươi',
      'shy_girlfriend': 'Chế Độ Nhút Nhát'
    };
    
    document.getElementById('status').textContent = `Trực Tuyến • ${personaNames[persona]}`;
    
    this.closeSettings();
    
    // Show confirmation
    this.showMessage('Đã lưu cài đặt! 💕');
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

  // Subscription and Payment Methods
  updateSubscriptionUI() {
    if (!this.subscriptionStatus) return;

    // Update header status
    const statusEl = document.getElementById('status');
    if (this.subscriptionStatus.subscriptionType !== 'free') {
      statusEl.textContent = 'Trực Tuyến • Premium ⭐';
    } else {
      statusEl.textContent = `Trực Tuyến • ${this.subscriptionStatus.messagesLeft} tin nhắn còn lại`;
    }
  }

  checkAndShowPaywall() {
    if (this.subscriptionStatus && this.subscriptionStatus.showPaywall) {
      this.openPaywall();
      return true;
    }
    return false;
  }

  openPaywall() {
    document.getElementById('paywall-modal').classList.remove('hidden');
  }

  closePaywall() {
    document.getElementById('paywall-modal').classList.add('hidden');
  }

  selectPlan(plan) {
    this.selectedPlan = plan;
    
    // Update UI selection
    document.querySelectorAll('[data-plan]').forEach(p => {
      p.classList.remove('border-girlfriend-500', 'bg-girlfriend-100');
      p.classList.add('border-girlfriend-200');
    });
    
    const selectedEl = document.querySelector(`[data-plan="${plan}"]`);
    selectedEl.classList.remove('border-girlfriend-200');
    selectedEl.classList.add('border-girlfriend-500', 'bg-girlfriend-100');
  }

  async startSubscription() {
    try {
      this.setLoading(true);
      this.closePaywall();

      const response = await axios.post('/api/subscription/payment/create', {
        subscriptionType: this.selectedPlan
      }, {
        headers: {
          'X-User-Id': this.userId,
          'Content-Type': 'application/json'
        }
      });

      const data = response.data;
      
      if (data.success && data.paymentUrl) {
        // Open PayOS payment page
        window.open(data.paymentUrl, '_blank');
        
        // Start checking payment status
        this.checkPaymentStatus(data.orderCode);
        
        this.showMessage('Đã mở trang thanh toán. Vui lòng hoàn tất thanh toán! 💳');
      } else {
        throw new Error(data.error || 'Không thể tạo thanh toán');
      }

    } catch (error) {
      console.error('❌ Payment creation error:', error);
      this.showError('Lỗi tạo thanh toán. Vui lòng thử lại.');
    } finally {
      this.setLoading(false);
    }
  }

  async checkPaymentStatus(orderCode, attempts = 0) {
    const maxAttempts = 60; // 5 minutes
    
    try {
      const response = await axios.get(`/api/subscription/payment/status/${orderCode}`, {
        headers: {
          'X-User-Id': this.userId
        }
      });

      const payment = response.data;
      
      if (payment.status === 'paid') {
        await this.loadSubscriptionStatus();
        this.showPaymentSuccess();
        return;
      }
      
      if (payment.status === 'failed' || payment.status === 'cancelled') {
        this.showError('Thanh toán thất bại hoặc bị hủy.');
        return;
      }
      
      // Continue checking if pending and haven't exceeded max attempts
      if (payment.status === 'pending' && attempts < maxAttempts) {
        setTimeout(() => {
          this.checkPaymentStatus(orderCode, attempts + 1);
        }, 5000); // Check every 5 seconds
      }

    } catch (error) {
      console.error('❌ Payment status check error:', error);
      if (attempts < maxAttempts) {
        setTimeout(() => {
          this.checkPaymentStatus(orderCode, attempts + 1);
        }, 5000);
      }
    }
  }

  showPaymentSuccess() {
    document.getElementById('payment-modal').classList.remove('hidden');
    document.getElementById('payment-processing').classList.add('hidden');
    document.getElementById('payment-success').classList.remove('hidden');
    this.updateSubscriptionUI();
  }

  closePaymentModal() {
    document.getElementById('payment-modal').classList.add('hidden');
    document.getElementById('payment-processing').classList.remove('hidden');
    document.getElementById('payment-success').classList.add('hidden');
  }

  // Referral Methods
  async openReferral() {
    try {
      this.closePaywall();
      
      const response = await axios.get('/api/subscription/referral', {
        headers: {
          'X-User-Id': this.userId
        }
      });

      const data = response.data;
      this.referralData = data;
      
      // Update referral modal
      document.getElementById('referral-code').textContent = data.referralCode;
      document.getElementById('referrals-count').textContent = `${data.stats.referralsCount} bạn`;
      document.getElementById('bonus-days').textContent = `${data.stats.bonusDaysEarned} ngày`;
      
      document.getElementById('referral-modal').classList.remove('hidden');

    } catch (error) {
      console.error('❌ Referral loading error:', error);
      this.showError('Không thể tải thông tin giới thiệu.');
    }
  }

  closeReferral() {
    document.getElementById('referral-modal').classList.add('hidden');
  }

  shareReferral() {
    if (!this.referralData) return;
    
    const message = this.referralData.shareMessage;
    
    // Try to share via Zalo Mini App API if available
    if (window.ZaloMiniApp) {
      window.ZaloMiniApp.shareMessage({
        message: message
      });
    } else {
      // Fallback - copy to clipboard
      this.copyToClipboard(message);
      this.showMessage('Đã sao chép tin nhắn giới thiệu! 📋');
    }
  }

  copyReferralLink() {
    if (!this.referralData) return;
    
    this.copyToClipboard(this.referralData.referralUrl);
    this.showMessage('Đã sao chép liên kết giới thiệu! 📋');
  }

  copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  // Sticker System Methods
  async toggleStickerPicker() {
    const stickerPicker = document.getElementById('sticker-picker');
    
    if (stickerPicker.classList.contains('hidden')) {
      await this.loadStickerPacks();
      stickerPicker.classList.remove('hidden');
    } else {
      stickerPicker.classList.add('hidden');
    }
  }

  async loadStickerPacks() {
    try {
      // Load default stickers (you can expand this to load from server)
      const stickerGrid = document.getElementById('sticker-grid');
      
      // Default sticker pack (placeholders for now)
      const defaultStickers = [
        { id: 'heart_eyes', name: '😍', url: '/static/stickers/packs/girlfriend_pack_1/heart_eyes.png' },
        { id: 'kiss', name: '😘', url: '/static/stickers/packs/girlfriend_pack_1/kiss.png' },
        { id: 'shy', name: '😊', url: '/static/stickers/packs/girlfriend_pack_1/shy.png' },
        { id: 'happy', name: '😄', url: '/static/stickers/packs/girlfriend_pack_1/happy.png' },
        { id: 'miss_you', name: '🥺', url: '/static/stickers/packs/girlfriend_pack_1/miss_you.png' },
        // Emoji fallbacks for now
        { id: 'love', name: '❤️', url: null },
        { id: 'cute', name: '🥰', url: null },
        { id: 'wink', name: '😉', url: null },
        { id: 'blush', name: '😊', url: null },
        { id: 'heart', name: '💕', url: null },
        { id: 'star', name: '⭐', url: null },
        { id: 'flower', name: '🌸', url: null }
      ];

      stickerGrid.innerHTML = defaultStickers.map(sticker => `
        <button class="sticker-item p-2 rounded-lg hover:bg-girlfriend-100 transition-colors text-2xl" 
                data-sticker-id="${sticker.id}" 
                data-sticker-url="${sticker.url || ''}"
                title="${sticker.name}">
          ${sticker.url ? `<img src="${sticker.url}" alt="${sticker.name}" class="w-8 h-8 object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
          <span style="display: none;">${sticker.name}</span>` : sticker.name}
        </button>
      `).join('');

      // Add click listeners to sticker items
      document.querySelectorAll('.sticker-item').forEach(item => {
        item.addEventListener('click', () => {
          this.sendSticker(item.dataset.stickerId, item.dataset.stickerUrl, item.textContent.trim());
        });
      });

    } catch (error) {
      console.error('❌ Error loading stickers:', error);
    }
  }

  sendSticker(stickerId, stickerUrl, fallbackEmoji) {
    // Hide sticker picker
    document.getElementById('sticker-picker').classList.add('hidden');
    
    // Display sticker message immediately
    this.displayMessage({
      role: 'user',
      content: fallbackEmoji,
      stickerUrl: stickerUrl || null,
      timestamp: new Date().toISOString()
    });

    // Send sticker to AI (treated as text message with sticker context)
    this.sendTextMessageWithSticker(fallbackEmoji, stickerId);
  }

  async sendTextMessageWithSticker(text, stickerId) {
    try {
      // Check subscription before sending
      if (!this.subscriptionStatus || !this.subscriptionStatus.canChat) {
        if (this.checkAndShowPaywall()) {
          return;
        }
      }

      this.setLoading(true);

      const response = await axios.post('/api/chat', {
        text: `[STICKER:${stickerId}] ${text}`, // Add sticker context for AI
        sessionId: this.sessionId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId || '',
          'X-User-Id': this.userId
        }
      });

      const data = response.data;
      
      // Update session ID
      if (data.sessionId) {
        this.sessionId = data.sessionId;
        localStorage.setItem('sessionId', this.sessionId);
      }

      // Update subscription status
      if (data.subscriptionStatus) {
        this.subscriptionStatus = data.subscriptionStatus;
        this.updateSubscriptionUI();
      }

      // Display assistant response with sticker if available
      this.displayMessage({
        role: 'assistant',
        content: data.reply,
        stickerUrl: data.stickerUrl,
        timestamp: new Date().toISOString()
      });

      // Check if should show paywall after this message
      if (data.showPaywall) {
        setTimeout(() => {
          this.openPaywall();
        }, 1000);
      }

      console.log('✅ Sticker message sent successfully');
      
    } catch (error) {
      console.error('❌ Error sending sticker:', error);
      
      this.displayMessage({
        role: 'assistant',
        content: "Xin lỗi anh, em đang gặp một chút khó khăn. Anh thử lại nhé! 💕",
        timestamp: new Date().toISOString()
      });
    } finally {
      this.setLoading(false);
    }
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