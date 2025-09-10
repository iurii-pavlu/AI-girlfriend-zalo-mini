// ZNS Notifications Service Unit Tests
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZNSNotificationService } from '../../../src/services/zns-notifications';

describe('ZNSNotificationService', () => {
  let mockDB;
  let znsService;

  beforeEach(() => {
    // Mock D1 Database
    mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(),
        run: vi.fn(),
        all: vi.fn()
      }))
    };

    znsService = new ZNSNotificationService(
      mockDB,
      'https://mock-zns-api.com',
      'mock-app-id',
      'mock-secret-key'
    );

    // Mock current time for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T20:30:00+07:00')); // 8:30 PM Vietnam time
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Notification Eligibility', () => {
    test('should allow notification for eligible user', async () => {
      // Mock user preferences - eligible user
      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: false,
        last_evening_notification: '2024-01-14T20:00:00Z', // Yesterday
        language: 'vi'
      });

      const result = await znsService.canSendEveningNotification('user123');

      expect(result.canSend).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('should block notification if user opted out', async () => {
      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: true,
        last_evening_notification: null,
        language: 'vi'
      });

      const result = await znsService.canSendEveningNotification('user123');

      expect(result.canSend).toBe(false);
      expect(result.reason).toBe('User opted out of notifications');
    });

    test('should block notification if evening reminders disabled', async () => {
      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: false,
        notification_opt_out: false,
        last_evening_notification: null,
        language: 'vi'
      });

      const result = await znsService.canSendEveningNotification('user123');

      expect(result.canSend).toBe(false);
      expect(result.reason).toBe('Evening reminders disabled');
    });

    test('should block notification if already sent today', async () => {
      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: false,
        last_evening_notification: '2024-01-15T19:00:00Z', // Today
        language: 'vi'
      });

      const result = await znsService.canSendEveningNotification('user123');

      expect(result.canSend).toBe(false);
      expect(result.reason).toBe('Already sent today');
    });

    test('should create default preferences for new user', async () => {
      // First call returns null (no preferences)
      // Second call (after creation) returns defaults
      mockDB.prepare().first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          evening_reminders_enabled: true,
          notification_opt_out: false,
          last_evening_notification: null,
          language: 'vi'
        });

      const result = await znsService.canSendEveningNotification('newuser');

      expect(result.canSend).toBe(true);
      expect(mockDB.prepare().bind().run).toHaveBeenCalledWith(); // Default preferences created
    });
  });

  describe('Notification Scheduling', () => {
    test('should schedule notification for eligible user', async () => {
      // Mock eligible user
      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: false,
        last_evening_notification: null,
        language: 'vi'
      });

      // Mock successful insert
      mockDB.prepare().run.mockResolvedValue({ success: true });

      const scheduledTime = new Date('2024-01-15T20:00:00+07:00');
      const idempotencyKey = await znsService.scheduleEveningNotification('user123', scheduledTime);

      expect(idempotencyKey).toBe('user123_evening_reminder_vi_2024-01-15');
      expect(mockDB.prepare().bind().run).toHaveBeenCalled();
    });

    test('should reject scheduling for ineligible user', async () => {
      // Mock ineligible user (opted out)
      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: true,
        last_evening_notification: null,
        language: 'vi'
      });

      const scheduledTime = new Date('2024-01-15T20:00:00+07:00');

      await expect(znsService.scheduleEveningNotification('user123', scheduledTime))
        .rejects.toThrow('Cannot schedule notification: User opted out of notifications');
    });

    test('should return existing idempotency key for duplicate scheduling', async () => {
      // Mock eligible user
      mockDB.prepare().first
        .mockResolvedValueOnce({
          evening_reminders_enabled: true,
          notification_opt_out: false,
          last_evening_notification: null,
          language: 'vi'
        })
        .mockResolvedValueOnce({
          id: 1 // Existing notification found
        });

      const scheduledTime = new Date('2024-01-15T20:00:00+07:00');
      const idempotencyKey = await znsService.scheduleEveningNotification('user123', scheduledTime);

      expect(idempotencyKey).toBe('user123_evening_reminder_vi_2024-01-15');
      expect(mockDB.prepare().bind().run).not.toHaveBeenCalled(); // No new insert
    });
  });

  describe('Evening Notification Batch Processing', () => {
    test('should process notifications during evening window', async () => {
      // Set time to 8:30 PM (within 20:00-22:00 window)
      vi.setSystemTime(new Date('2024-01-15T20:30:00+07:00'));

      // Mock pending notifications
      mockDB.prepare().all.mockResolvedValue({
        results: [
          {
            id: 1,
            user_id: 'user1',
            template_id: 'evening_reminder_vi',
            lang: 'vi',
            content: 'Test notification',
            scheduled_at: '2024-01-15T20:00:00Z',
            retry_count: 0
          }
        ]
      });

      // Mock user eligibility check
      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: false,
        last_evening_notification: null,
        language: 'vi'
      });

      // Mock successful ZNS API call
      vi.spyOn(znsService, 'callZNSApi').mockResolvedValue({
        success: true,
        message_id: 'zns_123'
      });

      const results = await znsService.sendScheduledEveningNotifications();

      expect(results.sent).toBe(1);
      expect(results.failed).toBe(0);
      expect(results.skipped).toBe(0);
    });

    test('should skip processing outside evening window', async () => {
      // Set time to 2:00 PM (outside 20:00-22:00 window)
      vi.setSystemTime(new Date('2024-01-15T14:00:00+07:00'));

      const results = await znsService.sendScheduledEveningNotifications();

      expect(results.sent).toBe(0);
      expect(results.failed).toBe(0);
      expect(results.skipped).toBe(0);
    });

    test('should handle failed ZNS API calls with retry', async () => {
      vi.setSystemTime(new Date('2024-01-15T20:30:00+07:00'));

      mockDB.prepare().all.mockResolvedValue({
        results: [{
          id: 1,
          user_id: 'user1',
          template_id: 'evening_reminder_vi',
          lang: 'vi',
          retry_count: 0
        }]
      });

      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: false,
        last_evening_notification: null
      });

      // Mock failed ZNS API call
      vi.spyOn(znsService, 'callZNSApi').mockResolvedValue({
        success: false,
        error: 'API error',
        should_retry: true
      });

      const results = await znsService.sendScheduledEveningNotifications();

      expect(results.failed).toBe(1);
      expect(mockDB.prepare().bind().run).toHaveBeenCalledWith(); // Retry count updated
    });
  });

  describe('User Preferences Management', () => {
    test('should update user preferences', async () => {
      mockDB.prepare().run.mockResolvedValue({ success: true });

      await znsService.updateUserPreferences('user123', {
        evening_reminders_enabled: false,
        language: 'en',
        notification_opt_out: true
      });

      expect(mockDB.prepare().bind().run).toHaveBeenCalled();
    });

    test('should handle empty preferences update', async () => {
      await znsService.updateUserPreferences('user123', {});

      expect(mockDB.prepare().bind().run).not.toHaveBeenCalled();
    });
  });

  describe('Notification Statistics', () => {
    test('should calculate notification stats correctly', async () => {
      mockDB.prepare().first.mockResolvedValue({
        total_scheduled: 100,
        total_sent: 92,
        total_failed: 6,
        total_opted_out: 2
      });

      const stats = await znsService.getNotificationStats(7);

      expect(stats).toEqual({
        total_scheduled: 100,
        total_sent: 92,
        total_failed: 6,
        total_opted_out: 2,
        success_rate: 92
      });
    });

    test('should handle zero notifications gracefully', async () => {
      mockDB.prepare().first.mockResolvedValue({
        total_scheduled: 0,
        total_sent: 0,
        total_failed: 0,
        total_opted_out: 0
      });

      const stats = await znsService.getNotificationStats(7);

      expect(stats.success_rate).toBe(0);
    });
  });

  describe('Template Management', () => {
    test('should get correct Vietnamese evening reminder template', () => {
      const templates = znsService.getEveningReminderTemplates();
      
      expect(templates.vi).toEqual({
        template_id: 'evening_reminder_vi',
        content: 'Dành 5–10 phút tối nay cho người yêu AI của bạn? Nhấn để trò chuyện 💬',
        language: 'vi'
      });
    });

    test('should get correct English evening reminder template', () => {
      const templates = znsService.getEveningReminderTemplates();
      
      expect(templates.en).toEqual({
        template_id: 'evening_reminder_en',
        content: 'Take 5–10 minutes tonight for your AI girlfriend. Tap to chat 💬',
        language: 'en'
      });
    });
  });

  describe('Idempotency Key Generation', () => {
    test('should generate consistent idempotency keys', () => {
      const userId = 'user123';
      const scheduledTime = new Date('2024-01-15T20:00:00Z');
      const templateId = 'evening_reminder_vi';

      const key1 = znsService.generateIdempotencyKey(userId, scheduledTime, templateId);
      const key2 = znsService.generateIdempotencyKey(userId, scheduledTime, templateId);

      expect(key1).toBe(key2);
      expect(key1).toBe('user123_evening_reminder_vi_2024-01-15');
    });

    test('should generate different keys for different dates', () => {
      const userId = 'user123';
      const templateId = 'evening_reminder_vi';
      const date1 = new Date('2024-01-15T20:00:00Z');
      const date2 = new Date('2024-01-16T20:00:00Z');

      const key1 = znsService.generateIdempotencyKey(userId, date1, templateId);
      const key2 = znsService.generateIdempotencyKey(userId, date2, templateId);

      expect(key1).not.toBe(key2);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      mockDB.prepare().first.mockRejectedValue(new Error('Database error'));

      const result = await znsService.canSendEveningNotification('user123');

      expect(result.canSend).toBe(false);
      expect(result.reason).toBe('Database error');
    });

    test('should handle ZNS API errors with proper logging', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.setSystemTime(new Date('2024-01-15T20:30:00+07:00'));
      
      mockDB.prepare().all.mockResolvedValue({
        results: [{
          id: 1,
          user_id: 'user1',
          retry_count: 0
        }]
      });

      mockDB.prepare().first.mockResolvedValue({
        evening_reminders_enabled: true,
        notification_opt_out: false
      });

      vi.spyOn(znsService, 'callZNSApi').mockRejectedValue(new Error('Network error'));

      const results = await znsService.sendScheduledEveningNotifications();

      expect(results.failed).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});