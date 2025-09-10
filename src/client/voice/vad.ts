/**
 * Voice Activity Detection (VAD)
 * Simple energy-based VAD with adaptive thresholding
 * Processes 10-20ms frames for real-time detection
 */

interface VADConfig {
  sampleRate: number;
  frameSize: number; // samples per frame (10-20ms worth)
  energyThreshold: number;
  silenceFrames: number; // frames of silence before stop
  adaptiveThreshold: boolean;
}

interface VADResult {
  isSpeaking: boolean;
  energy: number;
  confidence: number;
  silenceCount: number;
}

export class VoiceActivityDetector {
  private config: VADConfig;
  private energyHistory: number[] = [];
  private silenceCounter = 0;
  private adaptiveThreshold: number;
  private noiseFloor = 0;
  private isCalibrating = true;
  private calibrationFrames = 0;
  private readonly maxCalibrationFrames = 100; // ~2 seconds at 50fps
  
  constructor(config: Partial<VADConfig> = {}) {
    this.config = {
      sampleRate: 16000,
      frameSize: 320, // 20ms at 16kHz
      energyThreshold: 0.01,
      silenceFrames: 25, // ~500ms of silence
      adaptiveThreshold: true,
      ...config,
    };
    
    this.adaptiveThreshold = this.config.energyThreshold;
  }

  /**
   * Process audio frame and detect voice activity
   */
  process(audioFrame: Float32Array): VADResult {
    const energy = this.calculateEnergy(audioFrame);
    
    // Update adaptive threshold during calibration
    if (this.isCalibrating) {
      this.updateCalibration(energy);
    }
    
    // Determine if speaking based on energy
    const threshold = this.config.adaptiveThreshold ? 
      this.adaptiveThreshold : this.config.energyThreshold;
    
    const isSpeaking = energy > threshold && energy > this.noiseFloor * 2;
    
    // Update silence counter
    if (isSpeaking) {
      this.silenceCounter = 0;
    } else {
      this.silenceCounter++;
    }
    
    // Calculate confidence based on energy relative to threshold
    const confidence = Math.min(1, Math.max(0, 
      (energy - threshold) / (threshold * 2)
    ));
    
    // Keep energy history for adaptive threshold
    this.energyHistory.push(energy);
    if (this.energyHistory.length > 50) {
      this.energyHistory.shift();
    }
    
    return {
      isSpeaking,
      energy,
      confidence,
      silenceCount: this.silenceCounter,
    };
  }

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateEnergy(frame: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return Math.sqrt(sum / frame.length);
  }

  /**
   * Update noise floor and adaptive threshold during calibration
   */
  private updateCalibration(energy: number): void {
    this.calibrationFrames++;
    
    // Collect noise floor samples (assume first few seconds are quiet)
    if (this.calibrationFrames <= this.maxCalibrationFrames * 0.5) {
      this.noiseFloor = Math.max(this.noiseFloor, energy);
    }
    
    // Set adaptive threshold based on noise floor
    if (this.calibrationFrames === this.maxCalibrationFrames) {
      this.adaptiveThreshold = Math.max(
        this.config.energyThreshold,
        this.noiseFloor * 3 // 3x noise floor
      );
      this.isCalibrating = false;
      
      console.log(`VAD calibrated: noise=${this.noiseFloor.toFixed(4)}, threshold=${this.adaptiveThreshold.toFixed(4)}`);
    }
  }

  /**
   * Check if end of speech detected (sustained silence)
   */
  isEndOfSpeech(): boolean {
    return this.silenceCounter >= this.config.silenceFrames;
  }

  /**
   * Reset VAD state for new session
   */
  reset(): void {
    this.silenceCounter = 0;
    this.energyHistory = [];
    this.isCalibrating = true;
    this.calibrationFrames = 0;
    this.noiseFloor = 0;
  }

  /**
   * Update VAD configuration
   */
  updateConfig(newConfig: Partial<VADConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current VAD statistics
   */
  getStats() {
    const avgEnergy = this.energyHistory.length > 0 ?
      this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length : 0;
    
    return {
      isCalibrating: this.isCalibrating,
      noiseFloor: this.noiseFloor,
      threshold: this.adaptiveThreshold,
      avgEnergy,
      silenceFrames: this.silenceCounter,
    };
  }
}