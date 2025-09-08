import { Bindings, STTResponse, TTSRequest } from '../types';
import { Logger } from '../utils/logger';

export class GoogleCloudClient {
  private apiKey: string;
  private projectId: string;
  private logger: Logger;
  private sttLanguage: string;
  private ttsVoice: string;
  private ttsSpeakingRate: number;

  constructor(bindings: Bindings, sessionId: string) {
    this.apiKey = bindings.GOOGLE_API_KEY;
    this.projectId = bindings.GOOGLE_PROJECT_ID || 'ai-girlfriend-zalo';
    this.logger = new Logger(sessionId);
    this.sttLanguage = bindings.GOOGLE_STT_LANGUAGE || 'vi-VN';
    this.ttsVoice = bindings.GOOGLE_TTS_VOICE || 'vi-VN-Neural2-A';
    this.ttsSpeakingRate = parseFloat(bindings.GOOGLE_TTS_SPEAKING_RATE) || 1.0;
  }

  async speechToText(audioBuffer: ArrayBuffer): Promise<STTResponse> {
    try {
      // Convert ArrayBuffer to base64
      const base64Audio = this.arrayBufferToBase64(audioBuffer);

      const requestBody = {
        config: {
          encoding: 'WEBM_OPUS', // Most common format for web audio recording
          sampleRateHertz: 48000,
          languageCode: this.sttLanguage,
          enableAutomaticPunctuation: true,
          model: 'latest_short' // Optimized for short audio clips
        },
        audio: {
          content: base64Audio
        }
      };

      this.logger.info('Sending STT request to Google Cloud', {
        audioSize: audioBuffer.byteLength,
        language: this.sttLanguage
      });

      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error('Google STT API error', {
          status: response.status,
          error: errorData
        });
        throw new Error(`Google STT API error: ${response.status}`);
      }

      const data = await response.json() as any;
      
      if (!data.results || data.results.length === 0) {
        this.logger.warn('No speech detected in audio');
        return {
          text: '',
          confidence: 0
        };
      }

      const result = data.results[0];
      const transcript = result.alternatives[0].transcript;
      const confidence = result.alternatives[0].confidence || 0;

      this.logger.info('STT completed', {
        transcriptLength: transcript.length,
        confidence: confidence
      });

      return {
        text: transcript.trim(),
        confidence: confidence
      };

    } catch (error) {
      this.logger.error('Error in speech-to-text', error);
      throw new Error('Speech recognition failed');
    }
  }

  async textToSpeech(request: TTSRequest): Promise<ArrayBuffer> {
    try {
      const voiceId = request.voiceId || this.ttsVoice;
      const speakingRate = request.speakingRate || this.ttsSpeakingRate;

      const requestBody = {
        input: {
          text: request.text
        },
        voice: {
          languageCode: voiceId.split('-').slice(0, 2).join('-'), // e.g., "vi-VN"
          name: voiceId,
          ssmlGender: 'FEMALE' // Default to female voice for girlfriend persona
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: speakingRate,
          pitch: 2.0, // Slightly higher pitch for more feminine voice
          volumeGainDb: 0.0
        }
      };

      this.logger.info('Sending TTS request to Google Cloud', {
        textLength: request.text.length,
        voice: voiceId,
        speakingRate: speakingRate
      });

      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error('Google TTS API error', {
          status: response.status,
          error: errorData
        });
        throw new Error(`Google TTS API error: ${response.status}`);
      }

      const data = await response.json() as any;
      
      if (!data.audioContent) {
        throw new Error('No audio content received from TTS API');
      }

      // Convert base64 audio to ArrayBuffer
      const audioBuffer = this.base64ToArrayBuffer(data.audioContent);

      this.logger.info('TTS completed', {
        audioSize: audioBuffer.byteLength
      });

      return audioBuffer;

    } catch (error) {
      this.logger.error('Error in text-to-speech', error);
      throw new Error('Speech synthesis failed');
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}