import { Bindings } from '../types';
import { Logger } from '../utils/logger';
// Using Web Crypto API instead of bcrypt for Cloudflare Workers compatibility

export interface PrivateModeSettings {
  user_id: string;
  privacy_level: 'standard' | 'enhanced' | 'stealth';
  stealth_enabled: boolean;
  quick_exit_enabled: boolean;
  passcode_protection: boolean;
  passcode_hash?: string;
  fake_app_mode: 'calculator' | 'notepad' | 'weather' | 'news';
  decoy_last_used?: string;
  auto_clear_history: boolean;
  clear_history_minutes: number;
  hide_notifications: boolean;
  incognito_mode: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DecoyApp {
  id?: number;
  app_type: string;
  app_name: string;
  app_description: string;
  app_icon_url?: string;
  html_template: string;
  css_styles: string;
  js_functionality: string;
  entry_method: 'tap_sequence' | 'swipe_pattern' | 'long_press';
  entry_trigger: string;
  is_active: boolean;
  created_at?: string;
}

export interface StealthSession {
  session_id: string;
  user_id: string;
  stealth_level: 'basic' | 'enhanced' | 'maximum';
  auto_destruct_minutes: number;
  created_at?: string;
  expires_at: string;
  is_active: boolean;
}

export interface PrivacyAuditLog {
  id?: number;
  user_id: string;
  event_type: 'login' | 'logout' | 'stealth_enable' | 'quick_exit' | 'passcode_fail' | 'decoy_access';
  event_details: any; // JSON object
  ip_address?: string;
  user_agent?: string;
  timestamp?: string;
  risk_level: 'low' | 'medium' | 'high';
}

export class PrivateModeService {
  private db: D1Database;
  private logger: Logger;

  constructor(bindings: Bindings, sessionId: string) {
    this.db = bindings.DB;
    this.logger = new Logger(sessionId);
  }

  // Get or create user private mode settings
  async getPrivateModeSettings(userId: string): Promise<PrivateModeSettings> {
    if (!this.db) {
      return this.getDefaultPrivateSettings(userId);
    }

    try {
      let settings = await this.db.prepare(`
        SELECT * FROM private_mode_settings WHERE user_id = ?
      `).bind(userId).first() as PrivateModeSettings;

      if (!settings) {
        // Create default settings
        const defaultSettings = this.getDefaultPrivateSettings(userId);
        
        await this.db.prepare(`
          INSERT INTO private_mode_settings 
          (user_id, privacy_level, stealth_enabled, quick_exit_enabled, 
           passcode_protection, fake_app_mode, auto_clear_history, 
           clear_history_minutes, hide_notifications, incognito_mode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          defaultSettings.user_id,
          defaultSettings.privacy_level,
          defaultSettings.stealth_enabled ? 1 : 0,
          defaultSettings.quick_exit_enabled ? 1 : 0,
          defaultSettings.passcode_protection ? 1 : 0,
          defaultSettings.fake_app_mode,
          defaultSettings.auto_clear_history ? 1 : 0,
          defaultSettings.clear_history_minutes,
          defaultSettings.hide_notifications ? 1 : 0,
          defaultSettings.incognito_mode ? 1 : 0
        ).run();

        return defaultSettings;
      }

      // Convert integer fields back to booleans
      return {
        ...settings,
        stealth_enabled: Boolean(settings.stealth_enabled),
        quick_exit_enabled: Boolean(settings.quick_exit_enabled),
        passcode_protection: Boolean(settings.passcode_protection),
        auto_clear_history: Boolean(settings.auto_clear_history),
        hide_notifications: Boolean(settings.hide_notifications),
        incognito_mode: Boolean(settings.incognito_mode)
      };

    } catch (error) {
      this.logger.error('Error getting private mode settings', error);
      return this.getDefaultPrivateSettings(userId);
    }
  }

  private getDefaultPrivateSettings(userId: string): PrivateModeSettings {
    return {
      user_id: userId,
      privacy_level: 'standard',
      stealth_enabled: false,
      quick_exit_enabled: true,
      passcode_protection: false,
      fake_app_mode: 'calculator',
      auto_clear_history: false,
      clear_history_minutes: 30,
      hide_notifications: false,
      incognito_mode: false
    };
  }

  // Update private mode settings
  async updatePrivateModeSettings(userId: string, settings: Partial<PrivateModeSettings>): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    try {
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      if (settings.privacy_level !== undefined) {
        updateFields.push('privacy_level = ?');
        values.push(settings.privacy_level);
      }
      if (settings.stealth_enabled !== undefined) {
        updateFields.push('stealth_enabled = ?');
        values.push(settings.stealth_enabled ? 1 : 0);
      }
      if (settings.quick_exit_enabled !== undefined) {
        updateFields.push('quick_exit_enabled = ?');
        values.push(settings.quick_exit_enabled ? 1 : 0);
      }
      if (settings.passcode_protection !== undefined) {
        updateFields.push('passcode_protection = ?');
        values.push(settings.passcode_protection ? 1 : 0);
      }
      if (settings.fake_app_mode !== undefined) {
        updateFields.push('fake_app_mode = ?');
        values.push(settings.fake_app_mode);
      }
      if (settings.auto_clear_history !== undefined) {
        updateFields.push('auto_clear_history = ?');
        values.push(settings.auto_clear_history ? 1 : 0);
      }
      if (settings.clear_history_minutes !== undefined) {
        updateFields.push('clear_history_minutes = ?');
        values.push(settings.clear_history_minutes);
      }
      if (settings.hide_notifications !== undefined) {
        updateFields.push('hide_notifications = ?');
        values.push(settings.hide_notifications ? 1 : 0);
      }
      if (settings.incognito_mode !== undefined) {
        updateFields.push('incognito_mode = ?');
        values.push(settings.incognito_mode ? 1 : 0);
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = datetime("now")');
        values.push(userId);

        await this.db.prepare(`
          UPDATE private_mode_settings 
          SET ${updateFields.join(', ')}
          WHERE user_id = ?
        `).bind(...values).run();
      }

      this.logger.info('Updated private mode settings', {
        userId,
        updatedFields: Object.keys(settings)
      });

      return true;

    } catch (error) {
      this.logger.error('Error updating private mode settings', error);
      return false;
    }
  }

  // Set or verify passcode using Web Crypto API
  async setPasscode(userId: string, passcode: string): Promise<boolean> {
    if (!this.db || !passcode || passcode.length < 4) {
      return false;
    }

    try {
      const hashedPasscode = await this.hashPasscode(passcode);
      
      await this.db.prepare(`
        UPDATE private_mode_settings 
        SET passcode_hash = ?, passcode_protection = 1, updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(hashedPasscode, userId).run();

      await this.logPrivacyEvent(userId, 'passcode_set', {
        action: 'passcode_created',
        strength: this.getPasscodeStrength(passcode)
      });

      return true;

    } catch (error) {
      this.logger.error('Error setting passcode', error);
      return false;
    }
  }

  // Verify passcode using Web Crypto API
  async verifyPasscode(userId: string, passcode: string): Promise<boolean> {
    if (!this.db || !passcode) {
      return false;
    }

    try {
      const settings = await this.getPrivateModeSettings(userId);
      
      if (!settings.passcode_hash) {
        return false;
      }

      const hashedInput = await this.hashPasscode(passcode);
      const isValid = hashedInput === settings.passcode_hash;
      
      await this.logPrivacyEvent(userId, isValid ? 'passcode_success' : 'passcode_fail', {
        action: 'passcode_verification',
        success: isValid
      }, isValid ? 'low' : 'medium');

      return isValid;

    } catch (error) {
      this.logger.error('Error verifying passcode', error);
      await this.logPrivacyEvent(userId, 'passcode_fail', {
        action: 'passcode_error',
        error: error.message
      }, 'high');
      return false;
    }
  }

  private getPasscodeStrength(passcode: string): string {
    if (passcode.length >= 8 && /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]/.test(passcode)) {
      return 'strong';
    } else if (passcode.length >= 6 && /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]/.test(passcode)) {
      return 'medium';
    } else {
      return 'weak';
    }
  }

  // Create stealth session
  async createStealthSession(userId: string, level: 'basic' | 'enhanced' | 'maximum', durationMinutes: number = 60): Promise<string | null> {
    if (!this.db) {
      return null;
    }

    try {
      const sessionId = `stealth_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

      await this.db.prepare(`
        INSERT INTO stealth_sessions 
        (session_id, user_id, stealth_level, auto_destruct_minutes, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(sessionId, userId, level, durationMinutes, expiresAt).run();

      await this.logPrivacyEvent(userId, 'stealth_enable', {
        session_id: sessionId,
        level: level,
        duration_minutes: durationMinutes
      });

      this.logger.info('Created stealth session', {
        userId,
        sessionId,
        level,
        durationMinutes
      });

      return sessionId;

    } catch (error) {
      this.logger.error('Error creating stealth session', error);
      return null;
    }
  }

  // Validate stealth session
  async validateStealthSession(sessionId: string): Promise<StealthSession | null> {
    if (!this.db) {
      return null;
    }

    try {
      const session = await this.db.prepare(`
        SELECT * FROM stealth_sessions 
        WHERE session_id = ? AND is_active = 1 AND expires_at > datetime('now')
      `).bind(sessionId).first() as StealthSession;

      return session || null;

    } catch (error) {
      this.logger.error('Error validating stealth session', error);
      return null;
    }
  }

  // Get decoy app by type
  async getDecoyApp(appType: string): Promise<DecoyApp | null> {
    if (!this.db) {
      return null;
    }

    try {
      const decoyApp = await this.db.prepare(`
        SELECT * FROM decoy_apps 
        WHERE app_type = ? AND is_active = 1
        LIMIT 1
      `).bind(appType).first() as DecoyApp;

      return decoyApp || null;

    } catch (error) {
      this.logger.error('Error getting decoy app', error);
      return null;
    }
  }

  // Log decoy app access
  async logDecoyAccess(userId: string, appType: string, entryMethod: string): Promise<void> {
    try {
      // Update last used timestamp
      if (this.db) {
        await this.db.prepare(`
          UPDATE private_mode_settings 
          SET decoy_last_used = datetime('now'), updated_at = datetime('now')
          WHERE user_id = ?
        `).bind(userId).run();
      }

      await this.logPrivacyEvent(userId, 'decoy_access', {
        app_type: appType,
        entry_method: entryMethod,
        access_time: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Error logging decoy access', error);
    }
  }

  // Auto-clear history based on settings
  async autoCleanHistory(userId: string): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const settings = await this.getPrivateModeSettings(userId);
      
      if (!settings.auto_clear_history) {
        return;
      }

      const cutoffTime = new Date(Date.now() - settings.clear_history_minutes * 60 * 1000).toISOString();

      // Clear old messages
      await this.db.prepare(`
        DELETE FROM messages 
        WHERE session_id IN (
          SELECT id FROM sessions WHERE user_ref = ?
        ) AND created_at < ?
      `).bind(userId, cutoffTime).run();

      // Clear old memories if in maximum stealth
      if (settings.privacy_level === 'stealth') {
        await this.db.prepare(`
          DELETE FROM relationship_memory 
          WHERE user_id = ? AND created_at < ?
        `).bind(userId, cutoffTime).run();
      }

      this.logger.info('Auto-cleared history', {
        userId,
        cutoffTime,
        privacyLevel: settings.privacy_level
      });

    } catch (error) {
      this.logger.error('Error auto-clearing history', error);
    }
  }

  // Quick exit functionality
  async triggerQuickExit(userId: string, exitMethod: 'close_tab' | 'redirect_decoy' | 'clear_session'): Promise<{
    success: boolean;
    redirectUrl?: string;
    clearData: boolean;
  }> {
    try {
      const settings = await this.getPrivateModeSettings(userId);
      
      if (!settings.quick_exit_enabled) {
        return { success: false, clearData: false };
      }

      await this.logPrivacyEvent(userId, 'quick_exit', {
        exit_method: exitMethod,
        privacy_level: settings.privacy_level
      });

      let response = {
        success: true,
        clearData: settings.incognito_mode
      };

      if (exitMethod === 'redirect_decoy') {
        response = {
          ...response,
          redirectUrl: `/decoy/${settings.fake_app_mode}`
        };
      }

      // Auto-clear if incognito mode is enabled
      if (settings.incognito_mode) {
        await this.autoCleanHistory(userId);
      }

      this.logger.info('Quick exit triggered', {
        userId,
        exitMethod,
        privacyLevel: settings.privacy_level
      });

      return response;

    } catch (error) {
      this.logger.error('Error triggering quick exit', error);
      return { success: false, clearData: false };
    }
  }

  // Log privacy events for audit trail
  async logPrivacyEvent(
    userId: string, 
    eventType: string, 
    eventDetails: any, 
    riskLevel: 'low' | 'medium' | 'high' = 'low',
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      await this.db.prepare(`
        INSERT INTO privacy_audit_log 
        (user_id, event_type, event_details, ip_address, user_agent, risk_level)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        eventType,
        JSON.stringify(eventDetails),
        ipAddress || null,
        userAgent || null,
        riskLevel
      ).run();

    } catch (error) {
      this.logger.error('Error logging privacy event', error);
    }
  }

  // Generate stealth-aware response modifications
  async getStealthResponseModifications(userId: string): Promise<{
    hideTimestamps: boolean;
    useCodewords: boolean;
    minimizeEmotions: boolean;
    enableQuickExit: boolean;
    suppressNotifications: boolean;
  }> {
    try {
      const settings = await this.getPrivateModeSettings(userId);
      
      return {
        hideTimestamps: settings.privacy_level === 'stealth',
        useCodewords: settings.stealth_enabled,
        minimizeEmotions: settings.privacy_level !== 'standard',
        enableQuickExit: settings.quick_exit_enabled,
        suppressNotifications: settings.hide_notifications
      };

    } catch (error) {
      this.logger.error('Error getting stealth response modifications', error);
      return {
        hideTimestamps: false,
        useCodewords: false,
        minimizeEmotions: false,
        enableQuickExit: true,
        suppressNotifications: false
      };
    }
  }

  // Clean up expired stealth sessions
  async cleanupExpiredStealthSessions(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      await this.db.prepare(`
        UPDATE stealth_sessions 
        SET is_active = 0 
        WHERE expires_at <= datetime('now')
      `).run();

      this.logger.info('Cleaned up expired stealth sessions');

    } catch (error) {
      this.logger.error('Error cleaning up stealth sessions', error);
    }
  }

  // Get privacy audit log for user
  async getPrivacyAuditLog(userId: string, limit: number = 50): Promise<PrivacyAuditLog[]> {
    if (!this.db) {
      return [];
    }

    try {
      const logs = await this.db.prepare(`
        SELECT * FROM privacy_audit_log 
        WHERE user_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).bind(userId, limit).all();

      return logs.results.map((log: any) => ({
        ...log,
        event_details: JSON.parse(log.event_details || '{}')
      })) as PrivacyAuditLog[];

    } catch (error) {
      this.logger.error('Error getting privacy audit log', error);
      return [];
    }
  }

  // Hash passcode using Web Crypto API (Cloudflare Workers compatible)
  private async hashPasscode(passcode: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(passcode + 'ai-girlfriend-salt'); // Add salt
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      this.logger.error('Error hashing passcode', error);
      throw error;
    }
  }
}