// Audio utilities for Cloudflare Workers
export const SUPPORTED_AUDIO_FORMATS = [
  'audio/webm',
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg'
];

export function isValidAudioFormat(contentType: string): boolean {
  return SUPPORTED_AUDIO_FORMATS.some(format => 
    contentType.includes(format.split('/')[1])
  );
}

export function generateAudioFilename(extension: string = 'mp3'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `audio/${timestamp}-${random}.${extension}`;
}

export function getAudioDuration(audioBuffer: ArrayBuffer): number {
  // Rough estimation - in a real implementation you'd parse the audio headers
  // For MP3: ~128kbps = 16KB/s, so duration ≈ bytes / 16000
  const estimatedDuration = audioBuffer.byteLength / 16000;
  return Math.max(1, Math.min(estimatedDuration, 60)); // 1-60 seconds
}

export async function validateAudioSize(audioBuffer: ArrayBuffer, maxSizeMB: number = 5): Promise<boolean> {
  const sizeMB = audioBuffer.byteLength / (1024 * 1024);
  return sizeMB <= maxSizeMB;
}