/**
 * Voice UI Bindings
 * Wires voice call functionality to existing UI elements
 * Handles mic button, video call button, and chat integration
 */

import { VoiceCallStore } from './call-store';

interface UIElements {
  micButton: HTMLElement | null;
  videoButton: HTMLElement | null;
  sendButton: HTMLElement | null;
  messageInput: HTMLElement | null;
  messagesContainer: HTMLElement | null;
  header: HTMLElement | null;
}

export class VoiceUIBindings {
  private store: VoiceCallStore;
  private elements: UIElements;
  private callPillElement: HTMLElement | null = null;
  private waveformElement: HTMLElement | null = null;
  private isInitialized = false;
  
  constructor(store: VoiceCallStore) {
    this.store = store;
    this.elements = this.findElements();
    
    if (this.elements.micButton) {
      this.initialize();
    } else {
      // Retry finding elements after DOM loads
      setTimeout(() => {
        this.elements = this.findElements();
        if (this.elements.micButton) {
          this.initialize();
        }
      }, 1000);
    }
  }

  /**
   * Find UI elements in the DOM
   */
  private findElements(): UIElements {
    return {
      micButton: document.getElementById('voice-btn'),
      videoButton: document.getElementById('video-call-btn'),
      sendButton: document.getElementById('send-btn'),
      messageInput: document.getElementById('message-input'),
      messagesContainer: document.getElementById('messages'),
      header: document.querySelector('.bg-gradient-to-r.from-girlfriend-500'),
    };
  }

  /**
   * Initialize UI bindings
   */
  private initialize(): void {
    if (this.isInitialized) return;
    
    this.bindMicButton();
    this.bindVideoButton();
    this.bindStoreEvents();
    this.createCallPill();
    
    this.isInitialized = true;
    console.log('Voice UI bindings initialized');
  }

  /**
   * Bind microphone button functionality
   */
  private bindMicButton(): void {
    if (!this.elements.micButton) return;

    const originalClick = this.elements.micButton.onclick;
    
    this.elements.micButton.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const state = this.store.getState();
      
      if (state.isCallActive) {
        // End call if active
        await this.store.endCall();
      } else {
        // Start call
        try {
          await this.store.startCall();
        } catch (error) {
          this.showError(error.message);
        }
      }
    };

    // Add long press for push-to-talk (future feature)
    let pressTimer: any = null;
    
    this.elements.micButton.addEventListener('mousedown', () => {
      pressTimer = setTimeout(() => {
        // Future: Start push-to-talk mode
      }, 500);
    });
    
    this.elements.micButton.addEventListener('mouseup', () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
  }

  /**
   * Bind video call button to start voice call
   */
  private bindVideoButton(): void {
    if (!this.elements.videoButton) return;

    this.elements.videoButton.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const state = this.store.getState();
      
      if (state.isCallActive) {
        return; // Already in call
      }

      try {
        await this.store.startCall();
      } catch (error) {
        this.showError(error.message);
      }
    };
  }

  /**
   * Bind store events to update UI
   */
  private bindStoreEvents(): void {
    this.store.addEventListener('state_change', (event: CustomEvent) => {
      const { newState } = event.detail.data;
      this.updateUI(newState);
    });

    this.store.addEventListener('limits_update', (event: CustomEvent) => {
      const limits = event.detail.data;
      this.updateLimitsUI(limits);
    });

    this.store.addEventListener('error', (event: CustomEvent) => {
      const error = event.detail.data;
      this.showError(error.error || 'Voice call error');
    });

    // Handle moment saved event
    this.store.addEventListener('moment_saved', (event: CustomEvent) => {
      const moment = event.detail.data;
      this.addMomentToChat(moment);
    });
  }

  /**
   * Update UI based on call state
   */
  private updateUI(state: any): void {
    this.updateMicButton(state);
    this.updateVideoButton(state);
    this.updateCallPill(state);
    this.updateHeader(state);
    this.updateWaveform(state);
  }

  /**
   * Update microphone button appearance
   */
  private updateMicButton(state: any): void {
    if (!this.elements.micButton) return;

    const icon = this.elements.micButton.querySelector('i');
    if (!icon) return;

    // Update button style based on state
    this.elements.micButton.className = this.elements.micButton.className
      .replace(/bg-\w+-\d+/g, '') // Remove existing colors
      .replace(/text-\w+-\d+/g, '');

    if (state.isCallActive) {
      this.elements.micButton.classList.add('bg-red-500', 'text-white', 'animate-pulse');
      icon.className = 'fas fa-phone';
      icon.style.transform = 'rotate(135deg)'; // Hang up icon
    } else {
      this.elements.micButton.classList.add('bg-girlfriend-100', 'text-girlfriend-600');
      icon.className = 'fas fa-microphone';
      icon.style.transform = '';
    }

    // Add visual feedback for speaking
    if (state.status === 'speaking') {
      this.elements.micButton.classList.add('ring-4', 'ring-blue-300');
    } else {
      this.elements.micButton.classList.remove('ring-4', 'ring-blue-300');
    }
  }

  /**
   * Update video button (disable during voice call)
   */
  private updateVideoButton(state: any): void {
    if (!this.elements.videoButton) return;

    if (state.isCallActive) {
      this.elements.videoButton.style.opacity = '0.5';
      this.elements.videoButton.style.pointerEvents = 'none';
    } else {
      this.elements.videoButton.style.opacity = '';
      this.elements.videoButton.style.pointerEvents = '';
    }
  }

  /**
   * Create and manage call pill
   */
  private createCallPill(): void {
    if (this.callPillElement) return;

    this.callPillElement = document.createElement('div');
    this.callPillElement.id = 'voice-call-pill';
    this.callPillElement.style.display = 'none';
    document.body.appendChild(this.callPillElement);
  }

  /**
   * Update call pill visibility and content
   */
  private updateCallPill(state: any): void {
    if (!this.callPillElement) return;

    if (state.isCallActive) {
      this.callPillElement.style.display = 'block';
      this.callPillElement.innerHTML = this.renderCallPill(state);
      
      // Bind end call button
      const endButton = this.callPillElement.querySelector('#end-call-btn');
      if (endButton) {
        endButton.addEventListener('click', () => {
          this.store.endCall();
        });
      }
    } else {
      this.callPillElement.style.display = 'none';
    }
  }

  /**
   * Render call pill HTML
   */
  private renderCallPill(state: any): string {
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusColor = () => {
      switch (state.status) {
        case 'connected': return 'bg-green-500';
        case 'speaking': return 'bg-blue-500';
        case 'listening': return 'bg-purple-500';
        case 'connecting': return 'bg-yellow-500';
        default: return 'bg-gray-500';
      }
    };

    return `
      <div class="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50
                  bg-black bg-opacity-80 backdrop-blur-sm text-white px-4 py-2 rounded-full
                  flex items-center space-x-3 shadow-lg border border-gray-600">
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 rounded-full ${getStatusColor()} animate-pulse"></div>
          <span class="text-sm font-medium">${state.status}</span>
        </div>
        <div class="text-sm text-gray-300">${formatDuration(state.duration)}</div>
        <button id="end-call-btn" 
                class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
          <i class="fas fa-phone text-xs" style="transform: rotate(135deg)"></i>
          End
        </button>
      </div>
    `;
  }

  /**
   * Update header with call status
   */
  private updateHeader(state: any): void {
    if (!this.elements.header) return;

    const statusElement = document.getElementById('status');
    if (!statusElement) return;

    if (state.isCallActive) {
      statusElement.innerHTML = `
        <i class="fas fa-phone text-xs mr-1"></i>
        Voice Call • ${state.status}
        <i class="fas fa-lock text-xs ml-2" title="Private Mode"></i>
      `;
    } else {
      // Restore original status based on language
      const currentLang = localStorage.getItem('language') || 'vi';
      statusElement.textContent = currentLang === 'vi' 
        ? 'Trực Tuyến • Chế Độ Quan Tâm'
        : 'Online • Caring Mode';
    }
  }

  /**
   * Update waveform display
   */
  private updateWaveform(state: any): void {
    // Add waveform to last AI message if speaking
    if (state.status === 'listening' && state.assistantLevel > 0) {
      this.addWaveformToLastMessage(state.assistantLevel);
    }
  }

  /**
   * Add waveform to the last AI message
   */
  private addWaveformToLastMessage(level: number): void {
    if (!this.elements.messagesContainer) return;

    const messages = this.elements.messagesContainer.querySelectorAll('.flex.justify-start');
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage && !lastMessage.querySelector('.voice-waveform')) {
      const bubble = lastMessage.querySelector('div:last-child');
      if (bubble) {
        const waveform = document.createElement('div');
        waveform.className = 'voice-waveform inline-flex items-center ml-2';
        waveform.innerHTML = this.renderWaveform(level);
        bubble.appendChild(waveform);
      }
    }
  }

  /**
   * Render simple waveform HTML
   */
  private renderWaveform(level: number): string {
    const bars = Array.from({ length: 5 }, (_, i) => {
      const height = Math.max(4, level * 20 * (1 - Math.abs(i - 2) * 0.2));
      return `<div class="w-1 bg-girlfriend-500 rounded" style="height: ${height}px"></div>`;
    }).join('');

    return `<div class="flex items-end space-x-1">${bars}</div>`;
  }

  /**
   * Update limits UI
   */
  private updateLimitsUI(limits: any): void {
    // Add remaining minutes info to UI (could show in settings or header)
    const remaining = limits.dailyMinutes - limits.usedMinutes;
    console.log(`Voice minutes remaining: ${remaining.toFixed(1)} / ${limits.dailyMinutes}`);
  }

  /**
   * Add call moment to chat
   */
  private addMomentToChat(moment: any): void {
    if (!this.elements.messagesContainer) return;

    const momentElement = document.createElement('div');
    momentElement.className = 'flex justify-center my-4';
    momentElement.innerHTML = `
      <div class="bg-gradient-to-r from-girlfriend-100 to-purple-100 p-4 rounded-lg max-w-sm border border-girlfriend-200">
        <div class="flex items-center space-x-2 mb-2">
          <i class="fas fa-heart text-girlfriend-500"></i>
          <span class="font-medium text-girlfriend-700">Call Moment</span>
          <span class="text-xs text-gray-500">${moment.duration}s</span>
        </div>
        <p class="text-sm text-gray-700 mb-2">${moment.summary}</p>
        ${moment.highlights.map((h: string) => `<div class="text-xs text-girlfriend-600">• ${h}</div>`).join('')}
      </div>
    `;

    this.elements.messagesContainer.appendChild(momentElement);
    this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    // Create temporary error toast
    const errorElement = document.createElement('div');
    errorElement.className = `
      fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg
      animate-in slide-in-from-right-2 duration-300
    `;
    errorElement.innerHTML = `
      <div class="flex items-center space-x-2">
        <i class="fas fa-exclamation-triangle"></i>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(errorElement);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      errorElement.remove();
    }, 5000);
  }
}