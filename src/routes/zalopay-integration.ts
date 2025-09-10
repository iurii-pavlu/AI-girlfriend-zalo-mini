import { Hono } from 'hono';
import { ZaloPayService, ZaloPayConfig } from '../services/zalopay';

type Bindings = {
  DB: D1Database;
  ZALOPAY_APP_ID?: string;
  ZALOPAY_KEY1?: string;
  ZALOPAY_KEY2?: string;
  ZALOPAY_ENDPOINT?: string;
  ZALOPAY_WEBHOOK_SECRET?: string;
  PAYMENTS_ENABLED?: string;
};

const zalopayIntegration = new Hono<{ Bindings: Bindings }>();

/**
 * Get ZaloPay configuration
 */
function getZaloPayConfig(env: Bindings): ZaloPayConfig {
  return {
    app_id: env.ZALOPAY_APP_ID || '',
    key1: env.ZALOPAY_KEY1 || '',
    key2: env.ZALOPAY_KEY2 || '',
    endpoint: env.ZALOPAY_ENDPOINT || 'https://sb-openapi.zalopay.vn',
    webhook_secret: env.ZALOPAY_WEBHOOK_SECRET
  };
}

/**
 * Check if payments are enabled
 */
function arePaymentsEnabled(env: Bindings): boolean {
  return env.PAYMENTS_ENABLED === 'true' || env.PAYMENTS_ENABLED === '1';
}

/**
 * Get available subscription plans
 */
zalopayIntegration.get('/plans', async (c) => {
  try {
    const config = getZaloPayConfig(c.env);
    const zaloPayService = new ZaloPayService(c.env.DB, config);
    const plans = zaloPayService.getSubscriptionPlans();

    return c.json({
      success: true,
      data: {
        plans: Object.values(plans),
        payments_enabled: arePaymentsEnabled(c.env)
      },
      message: 'Subscription plans retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting subscription plans:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get plans'
    }, 500);
  }
});

/**
 * Create ZaloPay order for subscription
 */
zalopayIntegration.post('/create-order', async (c) => {
  try {
    if (!arePaymentsEnabled(c.env)) {
      return c.json({
        success: false,
        error: 'Payments are currently disabled'
      }, 403);
    }

    const { user_id, subscription_type, callback_url, redirect_url } = await c.req.json() as {
      user_id: string;
      subscription_type: 'weekly' | 'monthly';
      callback_url?: string;
      redirect_url?: string;
    };

    if (!user_id || !subscription_type) {
      return c.json({
        success: false,
        error: 'user_id and subscription_type are required'
      }, 400);
    }

    if (!['weekly', 'monthly'].includes(subscription_type)) {
      return c.json({
        success: false,
        error: 'subscription_type must be either "weekly" or "monthly"'
      }, 400);
    }

    const config = getZaloPayConfig(c.env);
    
    // Validate config
    if (!config.app_id || !config.key1 || !config.key2) {
      return c.json({
        success: false,
        error: 'ZaloPay configuration is incomplete'
      }, 500);
    }

    const zaloPayService = new ZaloPayService(c.env.DB, config);

    const orderResult = await zaloPayService.createOrder({
      user_id,
      subscription_type,
      callback_url,
      redirect_url
    });

    if (!orderResult.success) {
      return c.json({
        success: false,
        error: orderResult.error
      }, 400);
    }

    return c.json({
      success: true,
      data: {
        order_id: orderResult.order_id,
        app_trans_id: orderResult.app_trans_id,
        order_url: orderResult.order_url,
        qr_code: orderResult.qr_code,
        subscription_type,
        user_id
      },
      message: 'ZaloPay order created successfully'
    });

  } catch (error) {
    console.error('Error creating ZaloPay order:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order'
    }, 500);
  }
});

/**
 * ZaloPay webhook callback handler
 */
zalopayIntegration.post('/callback', async (c) => {
  try {
    // Get raw body and signature
    const body = await c.req.text();
    const signature = c.req.header('signature') || c.req.header('mac') || '';

    if (!body || !signature) {
      console.error('Missing body or signature in webhook');
      return c.json({
        return_code: -1,
        return_message: 'Missing required parameters'
      });
    }

    const config = getZaloPayConfig(c.env);
    const zaloPayService = new ZaloPayService(c.env.DB, config);

    const result = await zaloPayService.handleWebhook(body, signature);

    if (result.success) {
      return c.json({
        return_code: 1,
        return_message: 'success'
      });
    } else {
      return c.json({
        return_code: 0,
        return_message: result.message
      });
    }

  } catch (error) {
    console.error('Error handling ZaloPay webhook:', error);
    return c.json({
      return_code: -1,
      return_message: 'Internal server error'
    });
  }
});

/**
 * Check payment status
 */
zalopayIntegration.get('/status/:order_id', async (c) => {
  try {
    const orderId = c.req.param('order_id');

    if (!orderId) {
      return c.json({
        success: false,
        error: 'Order ID is required'
      }, 400);
    }

    const config = getZaloPayConfig(c.env);
    const zaloPayService = new ZaloPayService(c.env.DB, config);

    const status = await zaloPayService.checkPaymentStatus(orderId);

    return c.json({
      success: status.success,
      data: status,
      message: status.success ? 'Payment status retrieved successfully' : status.error
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check status'
    }, 500);
  }
});

/**
 * Get user subscription info
 */
zalopayIntegration.get('/subscription/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    const config = getZaloPayConfig(c.env);
    const zaloPayService = new ZaloPayService(c.env.DB, config);

    const subscription = await zaloPayService.getUserSubscription(userId);

    return c.json({
      success: true,
      data: {
        user_id: userId,
        ...subscription
      },
      message: 'Subscription info retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting user subscription:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get subscription'
    }, 500);
  }
});

/**
 * Get user payment history
 */
zalopayIntegration.get('/history/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const { limit, offset } = c.req.query();

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    const limitNum = limit ? parseInt(limit) : 20;
    const offsetNum = offset ? parseInt(offset) : 0;

    const payments = await c.env.DB.prepare(`
      SELECT 
        order_id,
        app_trans_id,
        amount,
        currency,
        subscription_type,
        plan_duration_days,
        status,
        zalopay_trans_id,
        created_at,
        paid_at,
        expires_at
      FROM zalopay_orders
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limitNum, offsetNum).all();

    const total = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM zalopay_orders WHERE user_id = ?
    `).bind(userId).first();

    return c.json({
      success: true,
      data: {
        user_id: userId,
        payments: payments.results,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: (total as any)?.count || 0
        }
      },
      message: 'Payment history retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting payment history:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment history'
    }, 500);
  }
});

/**
 * Cancel order (before payment)
 */
zalopayIntegration.post('/cancel/:order_id', async (c) => {
  try {
    const orderId = c.req.param('order_id');
    const { user_id, reason } = await c.req.json() as {
      user_id: string;
      reason?: string;
    };

    if (!orderId || !user_id) {
      return c.json({
        success: false,
        error: 'Order ID and user ID are required'
      }, 400);
    }

    // Check if order exists and belongs to user
    const order = await c.env.DB.prepare(`
      SELECT * FROM zalopay_orders 
      WHERE order_id = ? AND user_id = ? AND status = 'CREATED'
    `).bind(orderId, user_id).first();

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found or already processed'
      }, 404);
    }

    // Update order status to cancelled
    await c.env.DB.prepare(`
      UPDATE zalopay_orders 
      SET status = 'CANCELLED'
      WHERE order_id = ?
    `).bind(orderId).run();

    // Log analytics
    await c.env.DB.prepare(`
      INSERT INTO feature_analytics 
      (user_id, feature_type, event_name, event_data, success, created_at)
      VALUES (?, 'payment', 'order_cancelled', ?, TRUE, datetime('now'))
    `).bind(user_id, JSON.stringify({ order_id: orderId, reason: reason || 'User cancelled' })).run();

    return c.json({
      success: true,
      data: {
        order_id: orderId,
        status: 'CANCELLED'
      },
      message: 'Order cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order'
    }, 500);
  }
});

/**
 * Get ZaloPay webhook logs (Admin endpoint)
 */
zalopayIntegration.get('/webhook-logs', async (c) => {
  try {
    const { limit, offset } = c.req.query();

    const limitNum = limit ? parseInt(limit) : 50;
    const offsetNum = offset ? parseInt(offset) : 0;

    const logs = await c.env.DB.prepare(`
      SELECT 
        id,
        app_trans_id,
        signature_valid,
        order_found,
        processed,
        error_message,
        created_at
      FROM zalopay_webhooks
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limitNum, offsetNum).all();

    const total = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM zalopay_webhooks
    `).first();

    return c.json({
      success: true,
      data: {
        logs: logs.results,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: (total as any)?.count || 0
        }
      },
      message: 'Webhook logs retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting webhook logs:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get webhook logs'
    }, 500);
  }
});

/**
 * Test webhook (Admin endpoint for testing)
 */
zalopayIntegration.post('/test-webhook', async (c) => {
  try {
    const { app_trans_id } = await c.req.json() as { app_trans_id: string };

    if (!app_trans_id) {
      return c.json({
        success: false,
        error: 'app_trans_id is required'
      }, 400);
    }

    // Create mock webhook payload
    const mockWebhook = {
      app_id: parseInt(c.env.ZALOPAY_APP_ID || '2553'),
      app_trans_id: app_trans_id,
      app_time: Date.now(),
      app_user: 'test_user',
      amount: 49000,
      embed_data: JSON.stringify({ user_id: 'test_user', subscription_type: 'weekly' }),
      item: JSON.stringify([{ itemid: 'weekly', itemname: 'Gói tuần', itemprice: 49000, itemquantity: 1 }]),
      zp_trans_id: 999999,
      server_time: Date.now(),
      channel: 1,
      merchant_user_id: 'test_user',
      zp_user_id: 'test_zalo_user',
      user_fee_amount: 0,
      discount_amount: 0
    };

    const config = getZaloPayConfig(c.env);
    const zaloPayService = new ZaloPayService(c.env.DB, config);

    const result = await zaloPayService.handleWebhook(JSON.stringify(mockWebhook), 'test_signature');

    return c.json({
      success: true,
      data: {
        webhook_payload: mockWebhook,
        processing_result: result
      },
      message: 'Test webhook processed'
    });

  } catch (error) {
    console.error('Error testing webhook:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test webhook'
    }, 500);
  }
});

export default zalopayIntegration;