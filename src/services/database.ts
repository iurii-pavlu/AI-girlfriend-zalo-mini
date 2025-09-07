import { Bindings, Session, Message, VoiceSettings } from '../types';
import { Logger } from '../utils/logger';

export class DatabaseService {
  private db: D1Database;
  private logger: Logger;

  constructor(bindings: Bindings, sessionId: string) {
    this.db = bindings.DB;
    this.logger = new Logger(sessionId);
  }

  // Session management
  async createSession(userId: string, persona: string = 'caring_girlfriend'): Promise<Session> {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      await this.db.prepare(`
        INSERT INTO sessions (id, user_id, persona, created_at, last_active)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).bind(sessionId, userId, persona).run();

      // Create default voice settings
      await this.createVoiceSettings(sessionId);

      const session: Session = {
        id: sessionId,
        user_id: userId,
        persona,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };

      this.logger.info('Session created', { sessionId, userId, persona });
      return session;
    } catch (error) {
      this.logger.error('Error creating session', error);
      throw new Error('Failed to create session');
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM sessions WHERE id = ?
      `).bind(sessionId).first();

      if (!result) return null;

      return result as Session;
    } catch (error) {
      this.logger.error('Error getting session', error);
      return null;
    }
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE sessions SET last_active = datetime('now') WHERE id = ?
      `).bind(sessionId).run();
    } catch (error) {
      this.logger.error('Error updating session activity', error);
    }
  }

  // Message management
  async saveMessage(
    sessionId: string, 
    content: string, 
    role: 'user' | 'assistant', 
    messageType: 'text' | 'voice' = 'text',
    audioUrl?: string
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO messages (session_id, content, role, message_type, audio_url, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(sessionId, content, role, messageType, audioUrl || null).run();

      // Update session activity
      await this.updateSessionActivity(sessionId);

      this.logger.info('Message saved', { 
        sessionId, 
        role, 
        messageType, 
        contentLength: content.length 
      });
    } catch (error) {
      this.logger.error('Error saving message', error);
      throw new Error('Failed to save message');
    }
  }

  async getMessages(sessionId: string, limit: number = 20): Promise<Message[]> {
    try {
      const results = await this.db.prepare(`
        SELECT * FROM messages 
        WHERE session_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `).bind(sessionId, limit).all();

      return (results.results as Message[]).reverse(); // Return in chronological order
    } catch (error) {
      this.logger.error('Error getting messages', error);
      return [];
    }
  }

  // Voice settings management
  async createVoiceSettings(sessionId: string): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT OR REPLACE INTO voice_settings (session_id, voice_id, speaking_rate, language)
        VALUES (?, 'en-US-Neural2-F', 1.0, 'en-US')
      `).bind(sessionId).run();
    } catch (error) {
      this.logger.error('Error creating voice settings', error);
    }
  }

  async getVoiceSettings(sessionId: string): Promise<VoiceSettings | null> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM voice_settings WHERE session_id = ?
      `).bind(sessionId).first();

      return result as VoiceSettings | null;
    } catch (error) {
      this.logger.error('Error getting voice settings', error);
      return null;
    }
  }

  async updateVoiceSettings(
    sessionId: string, 
    voiceId?: string, 
    speakingRate?: number, 
    language?: string
  ): Promise<void> {
    try {
      const current = await this.getVoiceSettings(sessionId);
      if (!current) {
        await this.createVoiceSettings(sessionId);
        return;
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (voiceId) {
        updates.push('voice_id = ?');
        values.push(voiceId);
      }
      if (speakingRate !== undefined) {
        updates.push('speaking_rate = ?');
        values.push(speakingRate);
      }
      if (language) {
        updates.push('language = ?');
        values.push(language);
      }

      if (updates.length > 0) {
        values.push(sessionId);
        await this.db.prepare(`
          UPDATE voice_settings SET ${updates.join(', ')} WHERE session_id = ?
        `).bind(...values).run();
      }
    } catch (error) {
      this.logger.error('Error updating voice settings', error);
    }
  }

  // Analytics
  async logEvent(sessionId: string, eventType: string, eventData?: any): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO analytics (session_id, event_type, event_data, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(sessionId, eventType, eventData ? JSON.stringify(eventData) : null).run();
    } catch (error) {
      this.logger.error('Error logging analytics event', error);
    }
  }

  // Cleanup old data
  async cleanupOldSessions(daysBefore: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBefore);

      await this.db.prepare(`
        DELETE FROM sessions WHERE last_active < datetime(?)
      `).bind(cutoffDate.toISOString()).run();

      this.logger.info('Cleaned up old sessions', { daysBefore });
    } catch (error) {
      this.logger.error('Error cleaning up old sessions', error);
    }
  }
}