import { Hono } from 'hono';
import { ZNSNotificationService } from '../services/zns-notifications';
import { i18n } from '../services/i18n';

type Bindings = {
  DB: D1Database;
  ZNS_API_URL?: string;
  ZNS_APP_ID?: string;
  ZNS_SECRET_KEY?: string;
};

const zns = new Hono<{ Bindings: Bindings }>();

/**
 * Schedule evening notification for a user (Admin endpoint)
 */
zns.post('/schedule-evening/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const { scheduled_time } = await c.req.json() as { scheduled_time?: string };

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    const notificationService = new ZNSNotificationService(
      c.env.DB,
      c.env.ZNS_API_URL,
      c.env.ZNS_APP_ID,
      c.env.ZNS_SECRET_KEY
    );

    // Default to current evening if no time specified
    const scheduledTime = scheduled_time ? new Date(scheduled_time) : (() => {
      const now = new Date();
      now.setHours(20, 0, 0, 0); // 8:00 PM
      return now;
    })();

    const idempotencyKey = await notificationService.scheduleEveningNotification(userId, scheduledTime);

    return c.json({
      success: true,
      data: {
        user_id: userId,
        scheduled_at: scheduledTime.toISOString(),
        idempotency_key: idempotencyKey
      },
      message: 'Evening notification scheduled successfully'
    });

  } catch (error) {
    console.error('Error scheduling evening notification:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to schedule notification'
    }, 500);
  }
});

/**
 * Send evening notifications (Cron job endpoint)
 */
zns.post('/send-evening-batch', async (c) => {
  try {
    const notificationService = new ZNSNotificationService(
      c.env.DB,
      c.env.ZNS_API_URL,
      c.env.ZNS_APP_ID,
      c.env.ZNS_SECRET_KEY
    );

    const results = await notificationService.sendScheduledEveningNotifications();

    return c.json({
      success: true,
      data: results,
      message: `Batch complete: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`
    });

  } catch (error) {
    console.error('Error sending evening notifications batch:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notifications'
    }, 500);
  }
});

/**
 * Update user notification preferences
 */
zns.post('/preferences/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const preferences = await c.req.json() as {
      evening_reminders_enabled?: boolean;
      language?: 'vi' | 'en';
      notification_opt_out?: boolean;
    };

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    const notificationService = new ZNSNotificationService(
      c.env.DB,
      c.env.ZNS_API_URL,
      c.env.ZNS_APP_ID,
      c.env.ZNS_SECRET_Key
    );

    await notificationService.updateUserPreferences(userId, preferences);

    return c.json({
      success: true,
      data: { user_id: userId, preferences },
      message: 'Notification preferences updated successfully'
    });

  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update preferences'
    }, 500);
  }
});

/**
 * Get user notification preferences
 */
zns.get('/preferences/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    const preferences = await c.env.DB.prepare(`
      SELECT 
        evening_reminders_enabled,
        language,
        timezone,
        notification_opt_out,
        last_evening_notification
      FROM user_preferences 
      WHERE user_id = ?
    `).bind(userId).first();

    if (!preferences) {
      // Return default preferences
      return c.json({
        success: true,
        data: {
          user_id: userId,
          evening_reminders_enabled: true,
          language: 'vi',
          timezone: 'Asia/Ho_Chi_Minh',
          notification_opt_out: false,
          last_evening_notification: null
        },
        message: 'Default preferences returned (user preferences not found)'
      });
    }

    return c.json({
      success: true,
      data: {
        user_id: userId,
        ...preferences
      },
      message: 'Notification preferences retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting notification preferences:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get preferences'
    }, 500);
  }
});

/**
 * Get notification statistics (Admin endpoint)
 */
zns.get('/stats', async (c) => {
  try {
    const { days } = c.req.query();
    const dayCount = days ? parseInt(days) : 7;

    const notificationService = new ZNSNotificationService(
      c.env.DB,
      c.env.ZNS_API_URL,
      c.env.ZNS_APP_ID,
      c.env.ZNS_SECRET_KEY
    );

    const stats = await notificationService.getNotificationStats(dayCount);

    return c.json({
      success: true,
      data: {
        period_days: dayCount,
        ...stats
      },
      message: 'Notification statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting notification stats:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats'
    }, 500);
  }
});

/**
 * Test notification send (Admin endpoint)
 */
zns.post('/test-send/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const { template_override, force_send } = await c.req.json() as {
      template_override?: string;
      force_send?: boolean;
    };

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    const notificationService = new ZNSNotificationService(
      c.env.DB,
      c.env.ZNS_API_URL,
      c.env.ZNS_APP_ID,
      c.env.ZNS_SECRET_KEY
    );

    // Check eligibility unless force_send is true
    if (!force_send) {
      const { canSend, reason } = await notificationService.canSendEveningNotification(userId);
      if (!canSend) {
        return c.json({
          success: false,
          error: `Cannot send notification: ${reason}`,
          data: { user_id: userId, can_send: false, reason }
        }, 400);
      }
    }

    // Schedule immediate test notification
    const testTime = new Date();
    testTime.setMinutes(testTime.getMinutes() + 1); // 1 minute from now

    const idempotencyKey = await notificationService.scheduleEveningNotification(userId, testTime);

    return c.json({
      success: true,
      data: {
        user_id: userId,
        test_scheduled_at: testTime.toISOString(),
        idempotency_key: idempotencyKey,
        message: 'Test notification scheduled for 1 minute from now'
      },
      message: 'Test notification scheduled successfully'
    });

  } catch (error) {
    console.error('Error scheduling test notification:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to schedule test notification'
    }, 500);
  }
});

/**
 * Get notification logs for a user (for debugging)
 */
zns.get('/logs/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const { limit, offset } = c.req.query();

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    const limitNum = limit ? parseInt(limit) : 50;
    const offsetNum = offset ? parseInt(offset) : 0;

    const logs = await c.env.DB.prepare(`
      SELECT 
        id,
        template_id,
        lang,
        content,
        scheduled_at,
        sent_at,
        status,
        retry_count,
        error_message,
        created_at
      FROM notifications_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limitNum, offsetNum).all();

    const total = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM notifications_log WHERE user_id = ?
    `).bind(userId).first();

    return c.json({
      success: true,
      data: {
        user_id: userId,
        logs: logs.results,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: (total as any)?.count || 0
        }
      },
      message: 'Notification logs retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting notification logs:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get logs'
    }, 500);
  }
});

/**
 * Opt-out from notifications
 */
zns.post('/opt-out/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    const notificationService = new ZNSNotificationService(
      c.env.DB,
      c.env.ZNS_API_URL,
      c.env.ZNS_APP_ID,
      c.env.ZNS_SECRET_KEY
    );

    await notificationService.updateUserPreferences(userId, { notification_opt_out: true });

    return c.json({
      success: true,
      data: { user_id: userId, opted_out: true },
      message: 'Successfully opted out of notifications'
    });

  } catch (error) {
    console.error('Error opting out of notifications:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to opt out'
    }, 500);
  }
});

/**
 * Opt-in to notifications
 */
zns.post('/opt-in/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    const notificationService = new ZNSNotificationService(
      c.env.DB,
      c.env.ZNS_API_URL,
      c.env.ZNS_APP_ID,
      c.env.ZNS_SECRET_KEY
    );

    await notificationService.updateUserPreferences(userId, {
      notification_opt_out: false,
      evening_reminders_enabled: true
    });

    return c.json({
      success: true,
      data: { user_id: userId, opted_in: true },
      message: 'Successfully opted in to notifications'
    });

  } catch (error) {
    console.error('Error opting in to notifications:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to opt in'
    }, 500);
  }
});

export default zns;