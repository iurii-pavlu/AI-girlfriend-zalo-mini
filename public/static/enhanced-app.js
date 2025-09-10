// AI Girlfriend Zalo Mini App - Enhanced Frontend Application with Enterprise Features
class EnhancedAIGirlfriendApp {
  constructor() {
    // Core properties
    this.sessionId = localStorage.getItem('sessionId') || null;
    this.userId = null;
    this.zaloUserId = null;
    this.zaloUserInfo = null;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingStartTime = null;
    this.recordingTimer = null;
    
    // Enhanced features
    this.i18nService = new I18nService();
    this.currentLanguage = 'vi';
    this.subscriptionStatus = null;
    this.referralStats = null;
    this.selectedPlan = 'monthly';
    this.onboardingProgress = null;
    this.userPreferences = {};
    
    // Private mode
    this.privateMode = window.PRIVATE_MODE || false;
    this.stealthSession = window.STEALTH_SESSION || null;
    this.entryMode = window.ENTRY_MODE || 'normal';
    
    // Initialize app
    this.init();
  }

  // I18n Service Integration
  async initializeI18n() {
    try {
      console.log('🌍 Initializing i18n system...');
      
      // Initialize i18n service
      this.currentLanguage = await this.i18nService.detectLanguage();
      
      // Get user language from server if user is authenticated
      if (this.userId) {
        const response = await axios.get(`/api/i18n/user-language/${this.userId}`);
        if (response.data.success) {
          this.currentLanguage = response.data.data.language;
          this.i18nService.setLanguage(this.currentLanguage);
        }
      }
      
      // Load translations and update UI
      await this.loadTranslations();
      this.updateUILanguage();
      
      console.log('✅ I18n initialized with language:', this.currentLanguage);
      return true;
      
    } catch (error) {
      console.error('❌ Error initializing i18n:', error);
      return false;
    }
  }

  async loadTranslations() {
    try {
      const response = await axios.get(`/api/i18n/translations?lang=${this.currentLanguage}`);
      if (response.data.success) {
        this.translations = response.data.data.translations;
        return true;
      }
    } catch (error) {
      console.error('Error loading translations:', error);
    }
    return false;
  }

  t(key, params = {}) {
    return this.i18nService.translate(key, params);
  }

  updateUILanguage() {
    // Update all elements with data-i18n attributes
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.t(key);
      
      if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'email')) {
        element.placeholder = translation;
      } else {
        element.textContent = translation;
      }
    });

    // Update HTML language attribute
    document.documentElement.lang = this.currentLanguage;
  }

  async changeLanguage(newLanguage) {
    try {
      // Update server-side preference
      if (this.userId) {
        await axios.post(`/api/i18n/set-language/${this.userId}`, {
          language: newLanguage
        });
      }
      
      // Update local state
      this.currentLanguage = newLanguage;
      this.i18nService.setLanguage(newLanguage);
      
      // Reload translations and update UI
      await this.loadTranslations();
      this.updateUILanguage();
      
      // Show success message
      this.showMessage('✅ ' + this.t('settings.language_changed'));
      
    } catch (error) {
      console.error('Error changing language:', error);
      this.showMessage('❌ ' + this.t('errors.language_change_failed'), 'error');
    }
  }

  // Zalo User Authentication
  async initializeZaloUser() {
    try {
      if (typeof ZaloMiniApp !== 'undefined') {
        console.log('🔄 Authenticating with Zalo...');
        
        const userInfo = await new Promise((resolve, reject) => {
          ZaloMiniApp.getUserInfo({
            success: (data) => resolve(data.userInfo),
            error: (error) => reject(error)
          });
        });

        if (userInfo && userInfo.id) {
          this.zaloUserId = userInfo.id;
          this.zaloUserInfo = userInfo;
          this.userId = `zalo_${userInfo.id}`;
          
          console.log('✅ Zalo user authenticated:', { 
            zaloUserId: this.zaloUserId, 
            userId: this.userId,
            name: userInfo.name 
          });
          
          return true;
        }
      }
      
      // Fallback user ID
      console.log('⚠️ Zalo SDK not available, using fallback');
      this.userId = this.generateFallbackUserId();
      return false;
      
    } catch (error) {
      console.error('❌ Error initializing Zalo user:', error);
      this.userId = this.generateFallbackUserId();
      return false;
    }
  }

  generateFallbackUserId() {
    const storage = this.privateMode ? sessionStorage : localStorage;
    let userId = storage.getItem('userId');
    if (!userId) {
      userId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(7);
      storage.setItem('userId', userId);
    }
    return userId;
  }

  // Onboarding System
  async initializeOnboarding() {
    try {
      if (!this.userId) return false;

      console.log('🎯 Checking onboarding status...');
      
      const response = await axios.get(`/api/onboarding/progress/${this.userId}`);
      
      if (response.data.success) {
        this.onboardingProgress = response.data.data.progress;
        
        // Check if onboarding is needed
        if (!this.onboardingProgress.onboarding_completed) {
          console.log('🚀 Starting onboarding flow...');
          await this.startOnboardingFlow();
          return true;
        }
        
        console.log('✅ Onboarding already completed');
        return true;
      } else {
        // Initialize onboarding for new user
        console.log('🆕 Initializing onboarding for new user...');
        await this.initializeNewUserOnboarding();
        return true;
      }
      
    } catch (error) {
      console.error('❌ Error initializing onboarding:', error);
      return false;
    }
  }

  async initializeNewUserOnboarding() {
    try {
      const response = await axios.post(`/api/onboarding/initialize/${this.userId}`);
      
      if (response.data.success) {
        this.onboardingProgress = response.data.data.progress;
        await this.startOnboardingFlow();
      }
    } catch (error) {
      console.error('Error initializing new user onboarding:', error);
    }
  }

  async startOnboardingFlow() {
    // Hide main app and show onboarding
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
    
    // Create onboarding UI
    this.createOnboardingUI();
  }

  createOnboardingUI() {
    const loadingDiv = document.getElementById('loading');
    
    loadingDiv.innerHTML = `
      <div id="onboarding-container" class="w-full max-w-md mx-auto p-6">
        <div class="bg-white rounded-lg shadow-xl p-6">
          <!-- Progress Bar -->
          <div class="mb-6">
            <div class="flex justify-between text-sm text-gray-600 mb-2">
              <span>${this.t('onboarding.progress')}</span>
              <span id="progress-text">0/6</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div id="progress-bar" class="bg-girlfriend-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>
          
          <!-- Onboarding Content -->
          <div id="onboarding-content">
            <div class="text-center mb-6">
              <div class="text-6xl mb-4">💕</div>
              <h2 class="text-2xl font-bold text-gray-800 mb-2">${this.t('onboarding.welcome_title')}</h2>
              <p class="text-gray-600">${this.t('onboarding.welcome_message')}</p>
            </div>
            
            <div class="space-y-4">
              <button id="start-onboarding" class="w-full py-3 bg-girlfriend-500 text-white rounded-lg font-medium hover:bg-girlfriend-600 transition-colors">
                ${this.t('onboarding.start_now')}
              </button>
              <button id="skip-onboarding" class="w-full py-2 text-gray-500 hover:text-gray-700 transition-colors">
                ${this.t('onboarding.skip')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    document.getElementById('start-onboarding').addEventListener('click', () => {
      this.showOnboardingQuestion();
    });

    document.getElementById('skip-onboarding').addEventListener('click', () => {
      this.skipOnboarding();
    });
  }

  async showOnboardingQuestion() {
    try {
      // Get onboarding stages
      const response = await axios.get('/api/onboarding/stages');
      if (!response.data.success) return;

      const stages = response.data.data.stages;
      const currentStage = this.onboardingProgress.stage;
      const currentStageIndex = stages.findIndex(stage => stage.id === currentStage);
      
      if (currentStageIndex === -1) return;

      const stage = stages[currentStageIndex];
      this.renderOnboardingQuestion(stage, currentStageIndex + 1, stages.length);
      
    } catch (error) {
      console.error('Error showing onboarding question:', error);
    }
  }

  renderOnboardingQuestion(stage, currentStep, totalSteps) {
    const content = document.getElementById('onboarding-content');
    
    // Update progress
    const progressPercent = (currentStep / totalSteps) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('progress-text').textContent = `${currentStep}/${totalSteps}`;
    
    let inputHTML = '';
    
    if (stage.type === 'text') {
      inputHTML = `
        <input 
          type="text" 
          id="onboarding-input"
          placeholder="${this.t('onboarding.type_answer')}"
          class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-girlfriend-500 focus:border-transparent"
        >
      `;
    } else if (stage.type === 'choice' && stage.options) {
      inputHTML = `
        <div class="space-y-2">
          ${stage.options.map(option => `
            <label class="block">
              <input 
                type="radio" 
                name="onboarding-choice" 
                value="${option.value}"
                class="mr-3"
              >
              <span class="text-gray-700">${option.label}</span>
            </label>
          `).join('')}
        </div>
      `;
    }
    
    content.innerHTML = `
      <div class="text-center mb-6">
        <h3 class="text-xl font-semibold text-gray-800 mb-4">${stage.question}</h3>
      </div>
      
      <div class="mb-6">
        ${inputHTML}
      </div>
      
      <div class="flex space-x-3">
        <button id="back-onboarding" class="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
          ${this.t('common.back')}
        </button>
        <button id="next-onboarding" class="flex-1 py-3 bg-girlfriend-500 text-white rounded-lg font-medium hover:bg-girlfriend-600 transition-colors">
          ${this.t('onboarding.continue')}
        </button>
      </div>
    `;

    // Attach event listeners
    document.getElementById('next-onboarding').addEventListener('click', () => {
      this.handleOnboardingNext(stage);
    });

    document.getElementById('back-onboarding').addEventListener('click', () => {
      this.handleOnboardingBack();
    });
  }

  async handleOnboardingNext(stage) {
    let response = '';
    
    if (stage.type === 'text') {
      response = document.getElementById('onboarding-input').value.trim();
    } else if (stage.type === 'choice') {
      const selectedOption = document.querySelector('input[name="onboarding-choice"]:checked');
      response = selectedOption ? selectedOption.value : '';
    }

    if (stage.required && !response) {
      this.showMessage('❌ ' + this.t('onboarding.answer_required'), 'error');
      return;
    }

    try {
      const updateResponse = await axios.post(`/api/onboarding/update/${this.userId}`, {
        stage_id: stage.id,
        response: response
      });

      if (updateResponse.data.success) {
        this.onboardingProgress = updateResponse.data.data.progress;
        
        if (this.onboardingProgress.onboarding_completed) {
          await this.completeOnboarding(updateResponse.data.data);
        } else {
          await this.showOnboardingQuestion();
        }
      }
    } catch (error) {
      console.error('Error updating onboarding:', error);
      this.showMessage('❌ ' + this.t('errors.onboarding_update_failed'), 'error');
    }
  }

  async completeOnboarding(data) {
    const content = document.getElementById('onboarding-content');
    
    // Update progress to 100%
    document.getElementById('progress-bar').style.width = '100%';
    document.getElementById('progress-text').textContent = '6/6';
    
    content.innerHTML = `
      <div class="text-center">
        <div class="text-6xl mb-4">🎉</div>
        <h3 class="text-xl font-semibold text-gray-800 mb-4">${data.completion_message}</h3>
        
        <div class="bg-girlfriend-50 rounded-lg p-4 mb-6">
          <h4 class="font-medium text-girlfriend-800 mb-2">${this.t('onboarding.ai_match_result')}</h4>
          <p class="text-sm text-girlfriend-700">
            ${this.t('onboarding.personality_match')}: ${this.onboardingProgress.ai_personality_match}<br>
            ${this.t('onboarding.dialogue_theme')}: ${this.onboardingProgress.dialogue_theme}
          </p>
        </div>
        
        <button id="start-chatting" class="w-full py-3 bg-girlfriend-500 text-white rounded-lg font-medium hover:bg-girlfriend-600 transition-colors">
          ${this.t('onboarding.start_chatting')}
        </button>
      </div>
    `;

    document.getElementById('start-chatting').addEventListener('click', () => {
      this.finishOnboarding(data.conversation_starters);
    });
  }

  async finishOnboarding(conversationStarters) {
    // Hide onboarding and show main app
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    // Send AI greeting with personalized message
    if (conversationStarters && conversationStarters.length > 0) {
      const greeting = conversationStarters[0];
      setTimeout(() => {
        this.addMessage('assistant', greeting);
      }, 1000);
    }
    
    console.log('✅ Onboarding completed successfully');
  }

  async skipOnboarding() {
    try {
      const response = await axios.post(`/api/onboarding/skip/${this.userId}`);
      
      if (response.data.success) {
        this.onboardingProgress = response.data.data.progress;
        await this.finishOnboarding(response.data.data.conversation_starters);
      }
    } catch (error) {
      console.error('Error skipping onboarding:', error);
    }
  }

  // User Preferences & Settings
  async loadUserPreferences() {
    try {
      if (!this.userId) return;

      const response = await axios.get(`/api/zns/preferences/${this.userId}`);
      if (response.data.success) {
        this.userPreferences = response.data.data;
        this.updateSettingsUI();
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  }

  async updateUserPreferences(preferences) {
    try {
      const response = await axios.post(`/api/zns/preferences/${this.userId}`, preferences);
      
      if (response.data.success) {
        this.userPreferences = { ...this.userPreferences, ...preferences };
        this.showMessage('✅ ' + this.t('settings.preferences_saved'));
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      this.showMessage('❌ ' + this.t('errors.preferences_save_failed'), 'error');
    }
  }

  updateSettingsUI() {
    // Update evening notifications toggle
    const eveningToggle = document.getElementById('evening-notifications');
    if (eveningToggle) {
      eveningToggle.checked = this.userPreferences.evening_reminders_enabled !== false;
    }
  }

  // ZaloPay Integration
  async loadSubscriptionStatus() {
    try {
      if (!this.userId) return;

      const response = await axios.get(`/api/zalopay/subscription/${this.userId}`);
      if (response.data.success) {
        this.subscriptionStatus = response.data.data;
        this.updateSubscriptionUI();
      }
    } catch (error) {
      console.error('Error loading subscription status:', error);
    }
  }

  async createZaloPayOrder(subscriptionType) {
    try {
      this.showPaymentProcessing();
      
      const response = await axios.post('/api/zalopay/create-order', {
        user_id: this.userId,
        subscription_type: subscriptionType,
        callback_url: `${window.location.origin}/api/zalopay/callback`,
        redirect_url: window.location.href
      });

      if (response.data.success) {
        const { order_url, qr_code } = response.data.data;
        
        // Redirect to ZaloPay for payment
        if (order_url) {
          window.open(order_url, '_blank');
        }
        
        // Start polling for payment status
        this.pollPaymentStatus(response.data.data.order_id);
      } else {
        this.hidePaymentProcessing();
        this.showMessage('❌ ' + (response.data.error || this.t('errors.payment_failed')), 'error');
      }
    } catch (error) {
      this.hidePaymentProcessing();
      console.error('Error creating ZaloPay order:', error);
      this.showMessage('❌ ' + this.t('errors.payment_failed'), 'error');
    }
  }

  async pollPaymentStatus(orderId) {
    const maxPolls = 30; // 5 minutes
    let pollCount = 0;
    
    const poll = async () => {
      try {
        const response = await axios.get(`/api/zalopay/status/${orderId}`);
        
        if (response.data.success && response.data.data.status === 'PAID') {
          this.hidePaymentProcessing();
          this.showPaymentSuccess();
          await this.loadSubscriptionStatus();
          return;
        }
        
        if (response.data.data.status === 'FAILED' || response.data.data.status === 'CANCELLED') {
          this.hidePaymentProcessing();
          this.showMessage('❌ ' + this.t('errors.payment_failed'), 'error');
          return;
        }
        
        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          this.hidePaymentProcessing();
          this.showMessage('⏱️ ' + this.t('payment.timeout'), 'warning');
        }
      } catch (error) {
        console.error('Error polling payment status:', error);
        this.hidePaymentProcessing();
      }
    };
    
    setTimeout(poll, 3000); // Start polling after 3 seconds
  }

  showPaymentProcessing() {
    document.getElementById('payment-modal').classList.remove('hidden');
    document.getElementById('payment-processing').classList.remove('hidden');
    document.getElementById('payment-success').classList.add('hidden');
  }

  hidePaymentProcessing() {
    document.getElementById('payment-modal').classList.add('hidden');
    document.getElementById('payment-processing').classList.add('hidden');
  }

  showPaymentSuccess() {
    document.getElementById('payment-processing').classList.add('hidden');
    document.getElementById('payment-success').classList.remove('hidden');
  }

  // Main App Initialization
  async init() {
    console.log('🚀 Initializing Enhanced AI Girlfriend App v1.1...');
    
    try {
      // Initialize core systems
      await this.initializeZaloUser();
      await this.initializeI18n();
      
      // Load user data
      await this.loadUserPreferences();
      await this.loadSubscriptionStatus();
      
      // Check onboarding status
      await this.initializeOnboarding();
      
      // Initialize event listeners
      this.setupEventListeners();
      
      // Handle referral code
      this.handleReferralCode();
      
      // Initialize session and show main app
      let shouldShowApp = false;
      
      if (this.onboardingProgress?.onboarding_completed) {
        try {
          await this.initializeSession();
          await this.loadChatHistory();
          shouldShowApp = true;
        } catch (error) {
          console.error('Session initialization failed, but showing app anyway:', error);
          shouldShowApp = true;
        }
      } else {
        // Show app even if onboarding is not completed
        shouldShowApp = true;
      }
      
      if (shouldShowApp) {
        // Show main app
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
      }
      
      console.log('✅ App initialization completed');
      
    } catch (error) {
      console.error('❌ Error during app initialization:', error);
      this.showMessage('❌ ' + this.t('errors.initialization_failed'), 'error');
    }
    
    // Fallback: Always show main app after 3 seconds if still loading
    setTimeout(() => {
      const loading = document.getElementById('loading');
      const mainApp = document.getElementById('main-app');
      
      if (loading && mainApp && !loading.classList.contains('hidden')) {
        console.log('🔧 Fallback: Showing main app after initialization timeout');
        loading.classList.add('hidden');
        mainApp.classList.remove('hidden');
      }
    }, 3000);
  }

  setupEventListeners() {
    // Language switch button
    document.getElementById('language-btn')?.addEventListener('click', () => {
      this.showLanguageModal();
    });

    // Settings button
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      this.showSettingsModal();
    });

    // Language modal events
    document.getElementById('save-language')?.addEventListener('click', () => {
      this.saveLanguageSelection();
    });

    document.getElementById('cancel-language')?.addEventListener('click', () => {
      this.hideLanguageModal();
    });

    // Settings modal events  
    document.getElementById('save-settings')?.addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('cancel-settings')?.addEventListener('click', () => {
      this.hideSettingsModal();
    });

    // Language option clicks
    document.querySelectorAll('.language-option').forEach(option => {
      option.addEventListener('click', (e) => {
        this.selectLanguageOption(e.currentTarget);
      });
    });

    // Payment modal events
    document.getElementById('close-payment-success')?.addEventListener('click', () => {
      this.hidePaymentProcessing();
    });

    // Subscription plan clicks
    document.querySelectorAll('[data-plan]').forEach(planElement => {
      planElement.addEventListener('click', (e) => {
        this.selectSubscriptionPlan(e.currentTarget.dataset.plan);
      });
    });

    document.getElementById('subscribe-now')?.addEventListener('click', () => {
      this.createZaloPayOrder(this.selectedPlan);
    });
  }

  // UI Modal Management
  showLanguageModal() {
    document.getElementById('language-modal').classList.remove('hidden');
    this.updateLanguageSelection();
  }

  hideLanguageModal() {
    document.getElementById('language-modal').classList.add('hidden');
  }

  updateLanguageSelection() {
    document.querySelectorAll('.language-option').forEach(option => {
      const lang = option.dataset.lang;
      const isSelected = lang === this.currentLanguage;
      
      option.querySelector('.language-check').classList.toggle('hidden', !isSelected);
      option.classList.toggle('border-girlfriend-400', isSelected);
      option.classList.toggle('bg-girlfriend-50', isSelected);
    });
  }

  selectLanguageOption(optionElement) {
    // Remove previous selections
    document.querySelectorAll('.language-option').forEach(opt => {
      opt.classList.remove('border-girlfriend-400', 'bg-girlfriend-50');
      opt.querySelector('.language-check').classList.add('hidden');
    });
    
    // Select new option
    optionElement.classList.add('border-girlfriend-400', 'bg-girlfriend-50');
    optionElement.querySelector('.language-check').classList.remove('hidden');
  }

  async saveLanguageSelection() {
    const selectedOption = document.querySelector('.language-option.border-girlfriend-400');
    if (selectedOption) {
      const newLanguage = selectedOption.dataset.lang;
      await this.changeLanguage(newLanguage);
    }
    this.hideLanguageModal();
  }

  showSettingsModal() {
    document.getElementById('settings-modal').classList.remove('hidden');
  }

  hideSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  async saveSettings() {
    const eveningNotifications = document.getElementById('evening-notifications').checked;
    
    await this.updateUserPreferences({
      evening_reminders_enabled: eveningNotifications
    });
    
    this.hideSettingsModal();
  }

  selectSubscriptionPlan(planType) {
    this.selectedPlan = planType;
    
    // Update UI selection
    document.querySelectorAll('[data-plan]').forEach(plan => {
      plan.classList.toggle('border-girlfriend-400', plan.dataset.plan === planType);
      plan.classList.toggle('bg-girlfriend-50', plan.dataset.plan === planType);
    });
  }

  // Utility functions
  handleReferralCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('ref');
    
    if (referralCode && this.userId) {
      this.applyReferralCode(referralCode);
    }
  }

  async applyReferralCode(referralCode) {
    try {
      const response = await axios.post('/api/referral/applyReferral', {
        user_id: this.userId,
        referral_code: referralCode
      });

      if (response.data.success) {
        this.showMessage('🎁 ' + this.t('referral.code_applied_success'));
      }
    } catch (error) {
      console.error('Error applying referral code:', error);
    }
  }

  showMessage(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
      type === 'error' ? 'bg-red-500' : 
      type === 'warning' ? 'bg-yellow-500' : 
      type === 'success' ? 'bg-green-500' : 
      'bg-blue-500'
    } text-white max-w-sm`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  async initializeSession() {
    // Existing session initialization logic
    console.log('🔗 Initializing chat session...');
  }

  async loadChatHistory() {
    // Existing chat history loading logic
    console.log('💬 Loading chat history...');
  }

  addMessage(role, content, options = {}) {
    // Existing message adding logic
    console.log(`Adding ${role} message:`, content);
  }
}

// I18n Service Class
class I18nService {
  constructor() {
    this.currentLanguage = 'vi';
    this.translations = {};
  }

  async detectLanguage() {
    // Language detection logic
    const stored = localStorage.getItem('ai-girlfriend-language');
    if (stored && ['vi', 'en'].includes(stored)) {
      return stored;
    }
    
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('vi')) return 'vi';
    if (browserLang.startsWith('en')) return 'en';
    
    return 'vi'; // Default to Vietnamese
  }

  setLanguage(language) {
    this.currentLanguage = language;
    localStorage.setItem('ai-girlfriend-language', language);
    document.documentElement.lang = language;
  }

  translate(key, params = {}) {
    const keys = key.split('.');
    let translation = this.translations;
    
    for (const k of keys) {
      if (translation && typeof translation === 'object' && k in translation) {
        translation = translation[k];
      } else {
        return key; // Return key if translation not found
      }
    }
    
    if (typeof translation === 'string') {
      // Replace parameters
      return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey] !== undefined ? params[paramKey] : match;
      });
    }
    
    return key;
  }
}

// Initialize the enhanced app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new EnhancedAIGirlfriendApp();
});

// Export for global access
window.EnhancedAIGirlfriendApp = EnhancedAIGirlfriendApp;
// Compatibility alias for old references
window.AIGirlfriendApp = EnhancedAIGirlfriendApp;