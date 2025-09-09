import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from '../types';
import { ZaloIntegrationService } from '../services/zalo-integration';
import { DatabaseService } from '../services/database';
import { SubscriptionService } from '../services/subscription';
import { Logger } from '../utils/logger';

const zalo = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
zalo.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'https://miniapp.zalo.me'
    ];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Zalo-User-Id'],
  maxAge: 3600
}));

// Validate Zalo user and get subscription status
zalo.post('/validate-user', async (c) => {
  const logger = new Logger('zalo-validate-user');

  try {
    const body = await c.req.json();
    const { zaloUserId, userInfo, referralCode } = body;

    if (!zaloUserId) {
      return c.json({ error: 'Zalo user ID required' }, 400);
    }

    logger.info('Validating Zalo user', { zaloUserId, referralCode });

    // Validate Zalo context (check headers)
    const zaloService = new ZaloIntegrationService();
    const userAgent = c.req.header('User-Agent') || '';
    const referer = c.req.header('Referer') || '';
    
    const isValidZaloContext = zaloService.validateZaloContext(userAgent, referer);
    
    // Initialize database and subscription services
    const db = new DatabaseService(c.env, 'zalo-validation');
    const subService = new SubscriptionService(c.env, 'zalo-validation');

    // Create our internal user ID from Zalo ID
    const internalUserId = `zalo_${zaloUserId}`;

    // Get or create user with Zalo information
    const user = await subService.getOrCreateUser(internalUserId, referralCode);
    
    // Update user with Zalo information if provided
    if (userInfo && c.env.DB) {
      try {
        await c.env.DB.prepare(`
          UPDATE users 
          SET zalo_user_id = ?, zalo_name = ?, zalo_avatar = ?, last_active = ?
          WHERE id = ?
        `).bind(
          zaloUserId,
          userInfo.name || null,
          userInfo.avatar || null,
          new Date().toISOString(),
          internalUserId
        ).run();
      } catch (dbError) {
        logger.warn('Failed to update Zalo user info', dbError);
      }
    }

    // Get subscription status
    const subscriptionStatus = await subService.getSubscriptionStatus(internalUserId);
    
    // Generate secure session token
    const sessionToken = zaloService.generateSecureToken(zaloUserId, Date.now());

    const response = {
      success: true,
      user: {
        id: internalUserId,
        zaloUserId: zaloUserId,
        referralCode: user.referral_code
      },
      subscriptionStatus,
      sessionToken,
      isValidZaloContext,
      timestamp: new Date().toISOString()
    };

    logger.info('Zalo user validation successful', {
      userId: internalUserId,
      subscriptionType: subscriptionStatus.subscriptionType,
      messagesLeft: subscriptionStatus.messagesLeft
    });

    return c.json(response);

  } catch (error) {
    logger.error('Zalo user validation failed', error);
    return c.json({ 
      success: false,
      error: 'User validation failed',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// Handle Zalo payment success callback
zalo.post('/payment-callback', async (c) => {
  const logger = new Logger('zalo-payment-callback');

  try {
    const body = await c.req.json();
    const { zaloUserId, paymentId, orderCode, status } = body;

    if (!zaloUserId || !paymentId) {
      return c.json({ error: 'Missing payment data' }, 400);
    }

    logger.info('Processing Zalo payment callback', { zaloUserId, paymentId, status });

    const zaloService = new ZaloIntegrationService();
    const payment = await zaloService.processZaloPayment(body);

    if (!payment) {
      return c.json({ error: 'Invalid payment data' }, 400);
    }

    // Update user subscription if payment successful
    if (status === 'completed' && c.env.DB) {
      const internalUserId = `zalo_${zaloUserId}`;
      
      // Determine subscription type based on order code or amount
      let subscriptionType = 'weekly';
      let expiresAt = new Date();
      
      if (body.amount >= 149000) { // Monthly price
        subscriptionType = 'monthly';
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else { // Weekly price
        expiresAt.setDate(expiresAt.getDate() + 7);
      }

      try {
        await c.env.DB.prepare(`
          UPDATE users 
          SET subscription_type = ?, subscription_expires_at = ?, last_active = ?
          WHERE id = ?
        `).bind(
          subscriptionType,
          expiresAt.toISOString(),
          new Date().toISOString(),
          internalUserId
        ).run();

        logger.info('Updated user subscription', { 
          userId: internalUserId, 
          subscriptionType,
          expiresAt: expiresAt.toISOString()
        });

      } catch (dbError) {
        logger.error('Failed to update subscription', dbError);
        return c.json({ error: 'Subscription update failed' }, 500);
      }
    }

    return c.json({
      success: true,
      payment,
      message: 'Payment processed successfully'
    });

  } catch (error) {
    logger.error('Payment callback processing failed', error);
    return c.json({ 
      error: 'Payment processing failed',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// Get Zalo sharing data for referrals
zalo.get('/share-data/:referralCode', async (c) => {
  const logger = new Logger('zalo-share-data');

  try {
    const referralCode = c.req.param('referralCode');
    const baseUrl = c.env.APP_BASE_URL || 'https://your-app.pages.dev';

    const zaloService = new ZaloIntegrationService();
    const shareData = zaloService.createShareData(referralCode, baseUrl);

    logger.info('Generated Zalo share data', { referralCode });

    return c.json({
      success: true,
      shareData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to generate share data', error);
    return c.json({ 
      error: 'Share data generation failed',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export default zalo;