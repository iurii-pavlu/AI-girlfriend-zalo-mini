// Private Mode Extension for AI Girlfriend App
// This file extends the main app with privacy and stealth features

// Extend the AIGirlfriendApp class with Private Mode functionality
AIGirlfriendApp.prototype.initializePrivateMode = async function() {
  console.log('🔒 Initializing Private Mode...');
  
  // Validate stealth session
  if (this.stealthSession) {
    const isValid = await this.validateStealthSession(this.stealthSession);
    if (!isValid) {
      console.warn('⚠️ Invalid stealth session, redirecting to calculator');
      window.location.href = '/api/private/decoy/calculator';
      return;
    }
  }
  
  // Setup private mode event listeners
  this.setupPrivateModeListeners();
  
  // Auto-clear history timer if enabled
  this.startAutoCleanTimer();
};

AIGirlfriendApp.prototype.loadPrivateModeSettings = async function() {
  try {
    const response = await fetch('/api/private/settings', {
      headers: {
        'x-user-id': this.userId
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      this.privateModeSettings = data.settings;
      console.log('🔒 Private mode settings loaded', this.privateModeSettings);
    }
  } catch (error) {
    console.error('❌ Failed to load private mode settings:', error);
  }
};

AIGirlfriendApp.prototype.validateStealthSession = async function(sessionId) {
  try {
    const response = await fetch(`/api/private/stealth/validate/${sessionId}`);
    const data = await response.json();
    return data.valid;
  } catch (error) {
    console.error('❌ Failed to validate stealth session:', error);
    return false;
  }
};

AIGirlfriendApp.prototype.setupPrivateModeListeners = function() {
  // Quick exit shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+Q - Quick exit to calculator
    if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
      e.preventDefault();
      this.triggerQuickExit('redirect_decoy');
    }
    
    // Triple tap Escape - Emergency exit
    if (e.key === 'Escape') {
      this.escapeKeyCount = (this.escapeKeyCount || 0) + 1;
      setTimeout(() => {
        this.escapeKeyCount = 0;
      }, 1000);
      
      if (this.escapeKeyCount >= 3) {
        this.triggerQuickExit('close_tab');
      }
    }
  });
  
  // Mouse leave detection (for quick exit)
  let mouseLeaveTimeout;
  document.addEventListener('mouseleave', () => {
    if (this.privateModeSettings?.quick_exit_enabled) {
      mouseLeaveTimeout = setTimeout(() => {
        if (confirm('Quick exit to calculator?')) {
          this.triggerQuickExit('redirect_decoy');
        }
      }, 3000);
    }
  });
  
  document.addEventListener('mouseenter', () => {
    if (mouseLeaveTimeout) {
      clearTimeout(mouseLeaveTimeout);
    }
  });
};

AIGirlfriendApp.prototype.setupPrivateModeUI = function() {
  // Add stealth indicator
  if (this.privateMode) {
    const indicator = document.createElement('div');
    indicator.innerHTML = `
      <i class="fas fa-user-secret"></i> 
      <span class="text-xs">Private</span>
    `;
    indicator.className = 'fixed top-2 right-2 bg-gray-800 bg-opacity-90 text-white text-xs px-2 py-1 rounded-full z-50 flex items-center space-x-1';
    indicator.id = 'stealth-indicator';
    document.body.appendChild(indicator);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      const indicator = document.getElementById('stealth-indicator');
      if (indicator) {
        indicator.style.opacity = '0.3';
      }
    }, 3000);
  }
  
  // Add quick exit button
  if (this.privateModeSettings?.quick_exit_enabled) {
    const quickExitBtn = document.createElement('button');
    quickExitBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    quickExitBtn.className = 'fixed bottom-20 right-4 bg-red-600 text-white p-3 rounded-full shadow-lg z-50 hover:bg-red-700 transition-colors';
    quickExitBtn.title = 'Quick Exit (Ctrl+Shift+Q)';
    quickExitBtn.onclick = () => this.triggerQuickExit('redirect_decoy');
    document.body.appendChild(quickExitBtn);
  }
};

AIGirlfriendApp.prototype.triggerQuickExit = async function(method = 'redirect_decoy') {
  console.log('🚪 Triggering quick exit:', method);
  
  try {
    const response = await fetch('/api/private/quick-exit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': this.userId
      },
      body: JSON.stringify({ method })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Clear sensitive data if needed
      if (data.clearData) {
        this.clearPrivateData();
      }
      
      // Redirect or close based on method
      if (method === 'redirect_decoy' && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else if (method === 'close_tab') {
        window.close();
      }
    }
  } catch (error) {
    console.error('❌ Failed to trigger quick exit:', error);
    // Fallback - redirect to calculator
    window.location.href = '/api/private/decoy/calculator';
  }
};

AIGirlfriendApp.prototype.clearPrivateData = function() {
  // Clear session storage
  sessionStorage.clear();
  
  // Clear specific localStorage keys if not in full private mode
  if (this.privateModeSettings?.incognito_mode) {
    localStorage.removeItem('sessionId');
    localStorage.removeItem('messages');
    localStorage.removeItem('voiceSettings');
  }
  
  // Clear chat history from UI
  const messagesContainer = document.getElementById('messages');
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }
  
  console.log('🧹 Private data cleared');
};

AIGirlfriendApp.prototype.startAutoCleanTimer = function() {
  if (this.privateModeSettings?.auto_clear_history) {
    const intervalMinutes = this.privateModeSettings.clear_history_minutes || 30;
    
    setInterval(async () => {
      try {
        await fetch('/api/private/clear-history', {
          method: 'POST',
          headers: {
            'x-user-id': this.userId
          }
        });
        
        console.log('🧹 Auto-cleared history');
      } catch (error) {
        console.error('❌ Failed to auto-clear history:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }
};

AIGirlfriendApp.prototype.applyStealthModifications = function(text) {
  // Simple codeword replacements for stealth mode
  const codewords = {
    'yêu': 'thích',
    'em yêu anh': 'em thích làm việc với anh',
    'hôn': 'gặp',
    'ôm': 'bắt tay',
    'thương': 'quan tâm',
    'người yêu': 'bạn',
    'tình yêu': 'tình bạn'
  };
  
  let modifiedText = text;
  Object.entries(codewords).forEach(([original, replacement]) => {
    modifiedText = modifiedText.replace(new RegExp(original, 'gi'), replacement);
  });
  
  return modifiedText;
};

// Private mode utility functions
AIGirlfriendApp.prototype.isInPrivateMode = function() {
  return this.privateMode;
};

AIGirlfriendApp.prototype.getStealthLevel = function() {
  return this.privateModeSettings?.privacy_level || 'standard';
};

// Override sendMessage for private mode modifications
AIGirlfriendApp.prototype.originalSendMessage = AIGirlfriendApp.prototype.sendMessage;

AIGirlfriendApp.prototype.sendMessage = async function(text) {
  // Apply stealth modifications if in private mode
  if (this.privateMode && this.privateModeSettings?.stealth_enabled) {
    text = this.applyStealthModifications(text);
  }
  
  // Call original sendMessage
  return this.originalSendMessage.call(this, text);
};

console.log('🔒 Private Mode extension loaded');