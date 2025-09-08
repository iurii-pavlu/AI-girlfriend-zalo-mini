import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from '../types';
import { SubscriptionService } from '../services/subscription';
import { PayOSService } from '../services/payos';
import { Logger } from '../utils/logger';

const subscription = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
subscription.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  maxAge: 3600
}));

// Get subscription status
subscription.get('/status', async (c) => {
  const userId = c.req.header('x-user-id') || 'anonymous';
  const logger = new Logger(userId);

  try {
    const subService = new SubscriptionService(c.env, userId);
    
    // Get or create user (with potential referral)
    const referralCode = c.req.query('ref');
    const user = await subService.getOrCreateUser(userId, referralCode);
    
    // Get subscription status
    const status = await subService.getSubscriptionStatus(userId);
    
    // Apply any pending referral bonuses
    await subService.applyReferralBonus(userId);
    
    // Get referral stats
    const referralStats = await subService.getReferralStats(userId);

    logger.info('Subscription status retrieved', {
      userId,
      canChat: status.canChat,
      messagesLeft: status.messagesLeft
    });

    return c.json({
      user: {
        id: user.id,
        referralCode: user.referral_code,
        subscriptionType: user.subscription_type
      },
      subscription: status,
      referral: referralStats
    });

  } catch (error) {
    logger.error('Error getting subscription status', error);
    return c.json({
      error: 'Không thể lấy thông tin đăng ký',
      user: null,
      subscription: {
        canChat: false,
        messagesLeft: 0,
        subscriptionType: 'free',
        needsPayment: true,
        showPaywall: true
      },
      referral: {
        referralCode: '',
        referralsCount: 0,
        bonusDaysEarned: 0,
        canEarnMore: true
      }
    }, 500);
  }
});

// Create payment link
subscription.post('/payment/create', async (c) => {
  const userId = c.req.header('x-user-id') || 'anonymous';
  const logger = new Logger(userId);

  try {
    const { subscriptionType } = await c.req.json() as { 
      subscriptionType: 'weekly' | 'monthly' 
    };

    if (!['weekly', 'monthly'].includes(subscriptionType)) {
      return c.json({ error: 'Loại đăng ký không hợp lệ' }, 400);
    }

    const payosService = new PayOSService(c.env, userId);
    const subService = new SubscriptionService(c.env, userId);

    // Ensure user exists
    await subService.getOrCreateUser(userId);

    // Calculate price
    const amount = PayOSService.calculatePrice(subscriptionType, c.env);
    const orderCode = PayOSService.generateOrderCode();

    // Create payment request
    const paymentRequest = {
      orderCode,
      amount,
      description: `AI Girlfriend ${subscriptionType === 'weekly' ? '1 tuần' : '1 tháng'} - ${PayOSService.formatVND(amount)}`,
      cancelUrl: `${c.env.APP_BASE_URL}/?payment=cancelled`,
      returnUrl: `${c.env.APP_BASE_URL}/?payment=success&orderCode=${orderCode}`
    };

    // Store payment record
    await c.env.DB.prepare(`
      INSERT INTO payments (user_id, order_code, amount, subscription_type, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', datetime('now'))
    `).bind(userId, orderCode, amount, subscriptionType).run();

    // Create PayOS payment link
    const paymentResponse = await payosService.createPaymentLink(paymentRequest);

    logger.info('Payment link created', {
      userId,
      orderCode,
      amount,
      subscriptionType
    });

    return c.json({
      success: true,
      paymentUrl: paymentResponse.data?.checkoutUrl,
      qrCode: paymentResponse.data?.qrCode,
      orderCode,
      amount,
      amountFormatted: PayOSService.formatVND(amount),
      description: paymentRequest.description
    });

  } catch (error) {
    logger.error('Error creating payment', error);
    return c.json({
      error: 'Không thể tạo liên kết thanh toán. Vui lòng thử lại.',
      success: false
    }, 500);
  }
});

// PayOS webhook for payment confirmation
subscription.post('/payment/webhook', async (c) => {
  const logger = new Logger('webhook');

  try {
    const webhookData = await c.req.json();
    const payosService = new PayOSService(c.env, 'webhook');

    // Verify webhook signature
    const isValid = await payosService.verifyPaymentWebhook(webhookData);
    if (!isValid) {
      logger.warn('Invalid webhook signature', webhookData);
      return c.json({ error: 'Invalid signature' }, 400);
    }

    const { orderCode, status } = webhookData;

    // Get payment record
    const payment = await c.env.DB.prepare(`
      SELECT * FROM payments WHERE order_code = ?
    `).bind(orderCode).first();

    if (!payment) {
      logger.warn('Payment not found', { orderCode });
      return c.json({ error: 'Payment not found' }, 404);
    }

    if (status === 'PAID') {
      // Update payment status
      await c.env.DB.prepare(`
        UPDATE payments 
        SET status = 'paid', paid_at = datetime('now'), payos_transaction_id = ?
        WHERE order_code = ?
      `).bind(webhookData.transactionId, orderCode).run();

      // Upgrade user subscription
      const subService = new SubscriptionService(c.env, payment.user_id);
      await subService.upgradeSubscription(
        payment.user_id, 
        payment.subscription_type as 'weekly' | 'monthly'
      );

      logger.info('Payment confirmed and subscription upgraded', {
        userId: payment.user_id,
        orderCode,
        subscriptionType: payment.subscription_type
      });
    } else {
      // Update payment as failed
      await c.env.DB.prepare(`
        UPDATE payments SET status = 'failed' WHERE order_code = ?
      `).bind(orderCode).run();

      logger.info('Payment failed', { orderCode, status });
    }

    return c.json({ success: true });

  } catch (error) {
    logger.error('Webhook processing error', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

// Check payment status
subscription.get('/payment/status/:orderCode', async (c) => {
  const orderCode = parseInt(c.req.param('orderCode'));
  const userId = c.req.header('x-user-id') || 'anonymous';
  const logger = new Logger(userId);

  try {
    const payment = await c.env.DB.prepare(`
      SELECT * FROM payments WHERE order_code = ? AND user_id = ?
    `).bind(orderCode, userId).first();

    if (!payment) {
      return c.json({ 
        error: 'Không tìm thấy thanh toán',
        status: 'not_found'
      }, 404);
    }

    return c.json({
      orderCode,
      status: payment.status,
      amount: payment.amount,
      amountFormatted: PayOSService.formatVND(payment.amount),
      subscriptionType: payment.subscription_type,
      createdAt: payment.created_at,
      paidAt: payment.paid_at
    });

  } catch (error) {
    logger.error('Error checking payment status', error);
    return c.json({
      error: 'Không thể kiểm tra trạng thái thanh toán',
      status: 'error'
    }, 500);
  }
});

// Get referral link
subscription.get('/referral', async (c) => {
  const userId = c.req.header('x-user-id') || 'anonymous';
  const logger = new Logger(userId);

  try {
    const subService = new SubscriptionService(c.env, userId);
    const user = await subService.getOrCreateUser(userId);
    const stats = await subService.getReferralStats(userId);

    const referralUrl = `${c.env.APP_BASE_URL}/?ref=${user.referral_code}`;

    return c.json({
      referralCode: user.referral_code,
      referralUrl,
      stats,
      shareMessage: `Tham gia AI Girlfriend với em! Sử dụng mã giới thiệu ${user.referral_code} để nhận 1 ngày miễn phí! ${referralUrl}`
    });

  } catch (error) {
    logger.error('Error getting referral info', error);
    return c.json({
      error: 'Không thể lấy thông tin giới thiệu'
    }, 500);
  }
});

export default subscription;