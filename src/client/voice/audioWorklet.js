/**
 * Audio Worklet for Voice Processing
 * Handles PCM encoding, level metering, and VAD preprocessing
 * Runs in audio thread for low-latency processing
 */

class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.bufferSize = 0;
    this.buffer = new Float32Array(4096);
    this.sampleRate = 16000; // Target sample rate for ElevenLabs
    this.channels = 1; // Mono
    
    // Level metering
    this.levelSmoothingFactor = 0.8;
    this.currentLevel = 0;
    this.peakLevel = 0;
    this.peakHoldTime = 0;
    
    // VAD preprocessing
    this.silenceThreshold = 0.01;
    this.silenceFrames = 0;
    this.maxSilenceFrames = Math.floor(this.sampleRate * 2 / 128); // 2 seconds of silence
    
    // Processing state
    this.isRecording = false;
    this.frameCount = 0;
  }

  static get parameterDescriptors() {
    return [
      {
        name: 'recording',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
      },
      {
        name: 'threshold',
        defaultValue: 0.01,
        minValue: 0,
        maxValue: 1,
      }
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0]) return true;
    
    const inputData = input[0];
    const frameLength = inputData.length;
    
    // Update processing state
    this.isRecording = parameters.recording[0] > 0.5;
    this.silenceThreshold = parameters.threshold[0];
    
    if (!this.isRecording) {
      // Pass through audio when not recording
      if (output[0]) {
        output[0].set(inputData);
      }
      return true;
    }

    // Calculate audio levels for UI feedback
    let sum = 0;
    let peak = 0;
    
    for (let i = 0; i < frameLength; i++) {
      const sample = Math.abs(inputData[i]);
      sum += sample * sample;
      peak = Math.max(peak, sample);
    }
    
    const rms = Math.sqrt(sum / frameLength);
    
    // Smooth the level for UI display
    this.currentLevel = this.currentLevel * this.levelSmoothingFactor + 
                       rms * (1 - this.levelSmoothingFactor);
    
    // Peak detection with hold
    if (peak > this.peakLevel) {
      this.peakLevel = peak;
      this.peakHoldTime = 30; // Hold for ~30 frames (depends on buffer size)
    } else if (this.peakHoldTime > 0) {
      this.peakHoldTime--;
    } else {
      this.peakLevel *= 0.95; // Decay peak level
    }

    // Voice Activity Detection (VAD)
    const isSpeaking = rms > this.silenceThreshold;
    
    if (isSpeaking) {
      this.silenceFrames = 0;
    } else {
      this.silenceFrames++;
    }

    // Send level data to main thread
    if (this.frameCount % 8 === 0) { // Throttle to ~60fps at 48kHz
      this.port.postMessage({
        type: 'level',
        level: this.currentLevel,
        peak: this.peakLevel,
        speaking: isSpeaking,
        silenceFrames: this.silenceFrames,
      });
    }

    // Encode PCM data for streaming
    if (isSpeaking || this.silenceFrames < this.maxSilenceFrames) {
      const pcmData = this.encodePCM16(inputData);
      
      this.port.postMessage({
        type: 'audio',
        data: pcmData,
        timestamp: currentTime,
        speaking: isSpeaking,
      });
    }

    // Pass through audio for monitoring
    if (output[0]) {
      output[0].set(inputData);
    }

    this.frameCount++;
    return true;
  }

  encodePCM16(floatArray) {
    // Convert Float32 audio to PCM 16-bit for ElevenLabs
    const buffer = new ArrayBuffer(floatArray.length * 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < floatArray.length; i++) {
      // Clamp to [-1, 1] and convert to 16-bit signed integer
      const sample = Math.max(-1, Math.min(1, floatArray[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(i * 2, intSample, true); // Little endian
    }
    
    return new Uint8Array(buffer);
  }
}

registerProcessor('voice-processor', VoiceProcessor);