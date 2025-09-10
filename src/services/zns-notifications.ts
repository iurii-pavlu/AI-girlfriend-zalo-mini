import { i18n } from './i18n';

export interface ZNSTemplateData {
  template_id: string;
  content: string;
  language: 'vi' | 'en';
}

export interface NotificationLogEntry {
  id?: number;
  user_id: string;
  template_id: string;
  lang: string;
  content: string;
  scheduled_at: string;
  sent_at?: string;
  status: 'pending' | 'sent' | 'failed' | 'opted_out';
  retry_count: number;
  error_message?: string;
  idempotency_key: string;
}

export interface ZNSApiResponse {
  success: boolean;
  message_id?: string;
  error?: string;
  should_retry?: boolean;
}

class ZNSNotificationService {
  private db: D1Database;
  private znsApiUrl: string;
  private znsAppId: string;
  private znsSecretKey: string;
  private maxRetries: number = 3;
  private baseBackoffMs: number = 1000; // 1 second

  constructor(db: D1Database, apiUrl?: string, appId?: string, secretKey?: string) {
    this.db = db;
    this.znsApiUrl = apiUrl || process.env.ZNS_API_URL || 'https://business.openapi.zalo.me/message/template';
    this.znsAppId = appId || process.env.ZNS_APP_ID || '';
    this.znsSecretKey = secretKey || process.env.ZNS_SECRET_KEY || '';
  }

  /**
   * Get ZNS templates for evening reminders
   */
  private getEveningReminderTemplates(): Record<string, ZNSTemplateData> {
    return {
      vi: {
        template_id: 'evening_reminder_vi',
        content: 'Dành 5–10 phút tối nay cho người yêu AI của bạn? Nhấn để trò chuyện 💬',
        language: 'vi'
      },
      en: {
        template_id: 'evening_reminder_en', 
        content: 'Take 5–10 minutes tonight for your AI girlfriend. Tap to chat 💬',
        language: 'en'
      }
    };
  }

  /**
   * Check if user can receive evening notification
   */
  async canSendEveningNotification(userId: string): Promise<{
    canSend: boolean;
    reason?: string;
  }> {
    try {
      // Check user preferences
      const prefsQuery = await this.db.prepare(`
        SELECT evening_reminders_enabled, notification_opt_out, last_evening_notification, language
        FROM user_preferences 
        WHERE user_id = ?
      `).bind(userId).first();

      if (!prefsQuery) {
        // Create default preferences if not exist
        await this.createDefaultUserPreferences(userId);
        return { canSend: true };
      }

      // Check if opted out
      if (prefsQuery.notification_opt_out) {
        return { canSend: false, reason: 'User opted out of notifications' };
      }

      // Check if evening reminders disabled
      if (!prefsQuery.evening_reminders_enabled) {
        return { canSend: false, reason: 'Evening reminders disabled' };
      }

      // Check if already sent today
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const lastSent = prefsQuery.last_evening_notification;
      
      if (lastSent && lastSent.startsWith(today)) {
        return { canSend: false, reason: 'Already sent today' };
      }

      return { canSend: true };

    } catch (error) {
      console.error('Error checking notification eligibility:', error);
      return { canSend: false, reason: 'Database error' };
    }
  }

  /**
   * Create default user preferences
   */
  private async createDefaultUserPreferences(userId: string): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO user_preferences 
      (user_id, evening_reminders_enabled, language, timezone, notification_opt_out)
      VALUES (?, TRUE, 'vi', 'Asia/Ho_Chi_Minh', FALSE)
    `).bind(userId).run();
  }

  /**
   * Schedule evening notification for a user
   */
  async scheduleEveningNotification(userId: string, scheduledTime: Date): Promise<string> {
    const { canSend, reason } = await this.canSendEveningNotification(userId);
    
    if (!canSend) {
      throw new Error(`Cannot schedule notification: ${reason}`);
    }

    // Get user language preference
    const userLang = await this.getUserLanguage(userId);
    const templates = this.getEveningReminderTemplates();
    const template = templates[userLang];

    // Generate idempotency key
    const idempotencyKey = this.generateIdempotencyKey(userId, scheduledTime, template.template_id);

    // Check for existing scheduled notification
    const existing = await this.db.prepare(`
      SELECT id FROM notifications_log 
      WHERE idempotency_key = ? AND status = 'pending'
    `).bind(idempotencyKey).first();

    if (existing) {
      return idempotencyKey; // Already scheduled
    }

    // Insert notification log entry
    await this.db.prepare(`
      INSERT INTO notifications_log 
      (user_id, template_id, lang, content, scheduled_at, status, retry_count, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
    `).bind(
      userId,
      template.template_id,
      template.language,
      template.content,
      scheduledTime.toISOString(),
      idempotencyKey
    ).run();

    return idempotencyKey;
  }

  /**
   * Send evening notifications to all eligible users
   */
  async sendScheduledEveningNotifications(): Promise<{
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Only run during evening window (20:00-22:00 Vietnam time)
    if (currentHour < 20 || currentHour >= 22) {
      console.log(`Outside evening notification window. Current hour: ${currentHour}`);
      return { sent: 0, failed: 0, skipped: 0 };
    }

    let sent = 0, failed = 0, skipped = 0;

    try {
      // Get all pending notifications for current time window
      const pendingNotifications = await this.db.prepare(`
        SELECT * FROM notifications_log 
        WHERE status = 'pending' 
        AND datetime(scheduled_at) <= datetime('now')
        AND retry_count < ?
        ORDER BY scheduled_at ASC
        LIMIT 100
      `).bind(this.maxRetries).all();

      for (const notification of pendingNotifications.results) {
        try {
          // Double-check user eligibility
          const { canSend, reason } = await this.canSendEveningNotification(notification.user_id as string);
          
          if (!canSend) {
            console.log(`Skipping notification for user ${notification.user_id}: ${reason}`);
            await this.updateNotificationStatus(notification.id as number, 'opted_out', reason);
            skipped++;
            continue;
          }

          // Send notification
          const success = await this.sendZNSNotification(notification as NotificationLogEntry);
          
          if (success) {
            sent++;
            // Update last notification time in preferences
            await this.updateLastNotificationTime(notification.user_id as string);
          } else {
            failed++;
          }

          // Add randomized delay between sends to avoid rate limiting
          await this.sleep(this.getRandomDelay());

        } catch (error) {
          console.error(`Error processing notification ${notification.id}:`, error);
          failed++;
        }
      }

    } catch (error) {
      console.error('Error sending scheduled notifications:', error);
    }

    console.log(`Evening notifications batch complete: ${sent} sent, ${failed} failed, ${skipped} skipped`);
    return { sent, failed, skipped };
  }

  /**
   * Send individual ZNS notification
   */
  private async sendZNSNotification(notification: NotificationLogEntry): Promise<boolean> {
    const maxRetries = this.maxRetries;
    let lastError: string = '';

    for (let attempt = notification.retry_count; attempt < maxRetries; attempt++) {
      try {
        // Calculate backoff delay
        if (attempt > 0) {
          const delay = this.baseBackoffMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }

        // Make ZNS API call
        const response = await this.callZNSApi(notification);
        
        if (response.success) {
          // Mark as sent
          await this.updateNotificationStatus(
            notification.id!,
            'sent',
            undefined,
            response.message_id
          );
          
          // Log analytics
          await this.logNotificationAnalytics(notification.user_id, 'notification_sent', {
            template_id: notification.template_id,
            language: notification.lang,
            attempt: attempt + 1
          });

          return true;
        } else {
          lastError = response.error || 'Unknown ZNS API error';
          
          // Update retry count
          await this.updateNotificationRetryCount(notification.id!, attempt + 1, lastError);
          
          // If API says don't retry, break the loop
          if (!response.should_retry) {
            break;
          }
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Network error';
        console.error(`ZNS send attempt ${attempt + 1} failed:`, error);
        
        await this.updateNotificationRetryCount(notification.id!, attempt + 1, lastError);
      }
    }

    // Mark as failed after all retries exhausted
    await this.updateNotificationStatus(notification.id!, 'failed', lastError);
    
    // Log analytics
    await this.logNotificationAnalytics(notification.user_id, 'notification_failed', {
      template_id: notification.template_id,
      language: notification.lang,
      error: lastError,
      retry_count: maxRetries
    });

    return false;
  }

  /**
   * Call ZNS API (mock implementation - replace with actual Zalo API)
   */
  private async callZNSApi(notification: NotificationLogEntry): Promise<ZNSApiResponse> {
    // This is a mock implementation. Replace with actual Zalo ZNS API integration
    // For now, we'll simulate API behavior for testing
    
    if (!this.znsAppId || !this.znsSecretKey) {
      return {
        success: false,
        error: 'ZNS API credentials not configured',
        should_retry: false
      };
    }

    try {
      // Mock API call - replace with actual implementation
      const payload = {
        recipient_id: notification.user_id,
        template_id: notification.template_id, 
        template_data: {},
        phone: notification.user_id, // Assuming user_id is phone number for ZNS
        lang: notification.lang
      };

      // Simulate network delay
      await this.sleep(100 + Math.random() * 200);

      // Simulate API response (90% success rate for testing)
      const success = Math.random() > 0.1;
      
      if (success) {
        return {
          success: true,
          message_id: `zns_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
      } else {
        return {
          success: false,
          error: 'Simulated ZNS API error',
          should_retry: Math.random() > 0.3 // 70% should retry
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        should_retry: true
      };
    }
  }

  /**
   * Update notification status in database
   */
  private async updateNotificationStatus(
    notificationId: number,
    status: 'sent' | 'failed' | 'opted_out',
    errorMessage?: string,
    messageId?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    
    if (status === 'sent') {
      await this.db.prepare(`
        UPDATE notifications_log 
        SET status = ?, sent_at = ?, error_message = NULL
        WHERE id = ?
      `).bind(status, now, notificationId).run();
    } else {
      await this.db.prepare(`
        UPDATE notifications_log 
        SET status = ?, error_message = ?
        WHERE id = ?
      `).bind(status, errorMessage, notificationId).run();
    }
  }

  /**
   * Update notification retry count
   */
  private async updateNotificationRetryCount(
    notificationId: number,
    retryCount: number,
    errorMessage: string
  ): Promise<void> {
    await this.db.prepare(`
      UPDATE notifications_log 
      SET retry_count = ?, error_message = ?
      WHERE id = ?
    `).bind(retryCount, errorMessage, notificationId).run();
  }

  /**
   * Update user's last notification time
   */
  private async updateLastNotificationTime(userId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE user_preferences 
      SET last_evening_notification = datetime('now')
      WHERE user_id = ?
    `).bind(userId).run();
  }

  /**
   * Get user's preferred language
   */
  private async getUserLanguage(userId: string): Promise<'vi' | 'en'> {
    const result = await this.db.prepare(`
      SELECT language FROM user_preferences WHERE user_id = ?
    `).bind(userId).first();
    
    return (result?.language as 'vi' | 'en') || 'vi';
  }

  /**
   * Generate idempotency key for notification
   */
  private generateIdempotencyKey(userId: string, scheduledTime: Date, templateId: string): string {
    const dateStr = scheduledTime.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${userId}_${templateId}_${dateStr}`;
  }

  /**
   * Log notification analytics
   */
  private async logNotificationAnalytics(
    userId: string,
    eventName: string,
    eventData: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO feature_analytics 
        (user_id, feature_type, event_name, event_data, success, created_at)
        VALUES (?, 'notification', ?, ?, TRUE, datetime('now'))
      `).bind(userId, eventName, JSON.stringify(eventData)).run();
    } catch (error) {
      console.error('Error logging notification analytics:', error);
    }
  }

  /**
   * Get random delay between notifications (in milliseconds)
   */
  private getRandomDelay(): number {
    // Random delay between 1-5 seconds to smooth load
    return 1000 + Math.random() * 4000;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get notification statistics for admin/monitoring
   */
  async getNotificationStats(days: number = 7): Promise<{
    total_scheduled: number;
    total_sent: number;
    total_failed: number;
    total_opted_out: number;
    success_rate: number;
  }> {
    const stats = await this.db.prepare(`
      SELECT 
        COUNT(*) as total_scheduled,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as total_sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as total_failed,
        COUNT(CASE WHEN status = 'opted_out' THEN 1 END) as total_opted_out
      FROM notifications_log 
      WHERE created_at >= datetime('now', '-${days} days')
    `).first();

    const total = stats?.total_scheduled || 0;
    const sent = stats?.total_sent || 0;
    const success_rate = total > 0 ? (sent / total) * 100 : 0;

    return {
      total_scheduled: total,
      total_sent: sent,
      total_failed: stats?.total_failed || 0,
      total_opted_out: stats?.total_opted_out || 0,
      success_rate: Math.round(success_rate * 100) / 100
    };
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(
    userId: string,
    preferences: {
      evening_reminders_enabled?: boolean;
      language?: 'vi' | 'en';
      notification_opt_out?: boolean;
    }
  ): Promise<void> {
    const fields = [];
    const values = [];

    if (preferences.evening_reminders_enabled !== undefined) {
      fields.push('evening_reminders_enabled = ?');
      values.push(preferences.evening_reminders_enabled);
    }

    if (preferences.language !== undefined) {
      fields.push('language = ?');
      values.push(preferences.language);
    }

    if (preferences.notification_opt_out !== undefined) {
      fields.push('notification_opt_out = ?');
      values.push(preferences.notification_opt_out);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = datetime(\'now\')');
    values.push(userId);

    await this.db.prepare(`
      UPDATE user_preferences 
      SET ${fields.join(', ')}
      WHERE user_id = ?
    `).bind(...values).run();
  }
}

export { ZNSNotificationService };