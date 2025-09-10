import crypto from 'crypto';

export interface ZaloPayConfig {
  app_id: string;
  key1: string;
  key2: string;
  endpoint: string;
  webhook_secret?: string;
}

export interface SubscriptionPlan {
  type: 'weekly' | 'monthly';
  amount: number;
  duration_days: number;
  name: string;
  description: string;
}

export interface CreateOrderRequest {
  user_id: string;
  subscription_type: 'weekly' | 'monthly';
  callback_url?: string;
  redirect_url?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  order_id?: string;
  app_trans_id?: string;
  order_url?: string;
  qr_code?: string;
  error?: string;
}

export interface WebhookData {
  app_id: string;
  app_trans_id: string;
  app_time: number;
  app_user: string;
  amount: number;
  embed_data: string;
  item: string;
  zp_trans_id: number;
  server_time: number;
  channel: number;
  merchant_user_id: string;
  zp_user_id: string;
  user_fee_amount: number;
  discount_amount: number;
}

export interface PaymentStatus {
  success: boolean;
  order_id?: string;
  status: 'CREATED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
  amount?: number;
  paid_at?: string;
  error?: string;
}

class ZaloPayService {
  private db: D1Database;
  private config: ZaloPayConfig;
  private subscriptionPlans: Record<string, SubscriptionPlan>;

  constructor(db: D1Database, config: ZaloPayConfig) {
    this.db = db;
    this.config = config;
    
    // Define subscription plans
    this.subscriptionPlans = {
      weekly: {
        type: 'weekly',
        amount: 49000, // 49,000 VND
        duration_days: 7,
        name: 'Gói tuần',
        description: '7 ngày Premium với tính năng không giới hạn'
      },
      monthly: {
        type: 'monthly', 
        amount: 149000, // 149,000 VND
        duration_days: 30,
        name: 'Gói tháng',
        description: '30 ngày Premium với tính năng không giới hạn'
      }
    };
  }

  /**
   * Create ZaloPay order for subscription
   */
  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    try {
      const plan = this.subscriptionPlans[request.subscription_type];
      if (!plan) {
        return { success: false, error: 'Invalid subscription type' };
      }

      // Generate unique IDs
      const orderId = this.generateOrderId();
      const appTransId = this.generateAppTransId();
      
      // Create order in database first
      const orderInsert = await this.db.prepare(`
        INSERT INTO zalopay_orders 
        (user_id, order_id, app_trans_id, amount, currency, subscription_type, plan_duration_days, status, expires_at)
        VALUES (?, ?, ?, ?, 'VND', ?, ?, 'CREATED', datetime('now', '+1 hour'))
      `).bind(
        request.user_id,
        orderId,
        appTransId,
        plan.amount,
        plan.type,
        plan.duration_days
      ).run();

      if (!orderInsert.success) {
        return { success: false, error: 'Failed to create order record' };
      }

      // Prepare ZaloPay API request
      const orderData = {
        app_id: parseInt(this.config.app_id),
        app_trans_id: appTransId,
        app_user: request.user_id,
        app_time: Date.now(),
        item: JSON.stringify([{
          itemid: plan.type,
          itemname: plan.name,
          itemprice: plan.amount,
          itemquantity: 1
        }]),
        embed_data: JSON.stringify({
          user_id: request.user_id,
          subscription_type: plan.type,
          order_id: orderId
        }),
        amount: plan.amount,
        callback_url: request.callback_url || `${this.config.endpoint}/zalopay/callback`,
        description: `Thanh toán ${plan.name} - AI Girlfriend`,
        bank_code: "",
        mac: ""
      };

      // Generate MAC signature
      orderData.mac = this.generateMac(orderData, this.config.key1);

      // Call ZaloPay API
      const zaloResponse = await this.callZaloPayAPI('/v2/create', orderData);
      
      if (zaloResponse.return_code === 1) {
        // Update order with ZaloPay response
        await this.db.prepare(`
          UPDATE zalopay_orders 
          SET zalopay_order_url = ?, qr_code_url = ?, signature = ?
          WHERE order_id = ?
        `).bind(
          zaloResponse.order_url,
          zaloResponse.qr_code,
          orderData.mac,
          orderId
        ).run();

        // Log analytics
        await this.logPaymentAnalytics(request.user_id, 'order_created', {
          order_id: orderId,
          subscription_type: plan.type,
          amount: plan.amount
        });

        return {
          success: true,
          order_id: orderId,
          app_trans_id: appTransId,
          order_url: zaloResponse.order_url,
          qr_code: zaloResponse.qr_code
        };
      } else {
        // Update order status to failed
        await this.updateOrderStatus(orderId, 'FAILED', zaloResponse.return_message);

        return {
          success: false,
          error: zaloResponse.return_message || 'ZaloPay API error'
        };
      }

    } catch (error) {
      console.error('Error creating ZaloPay order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle ZaloPay webhook callback
   */
  async handleWebhook(requestBody: string, signature: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Log webhook for debugging
      await this.logWebhook(requestBody, signature);

      // Verify signature
      const isValidSignature = this.verifyWebhookSignature(requestBody, signature);
      
      if (!isValidSignature) {
        await this.updateWebhookLog(requestBody, false, false, 'Invalid signature');
        return { success: false, message: 'Invalid signature' };
      }

      // Parse webhook data
      const webhookData: WebhookData = JSON.parse(requestBody);
      
      // Find order
      const order = await this.db.prepare(`
        SELECT * FROM zalopay_orders WHERE app_trans_id = ?
      `).bind(webhookData.app_trans_id).first();

      if (!order) {
        await this.updateWebhookLog(requestBody, true, false, 'Order not found');
        return { success: false, message: 'Order not found' };
      }

      // Prevent duplicate processing
      if (order.callback_received) {
        await this.updateWebhookLog(requestBody, true, true, 'Duplicate callback');
        return { success: true, message: 'Already processed' };
      }

      // Update order status to PAID
      const paidAt = new Date().toISOString();
      await this.db.prepare(`
        UPDATE zalopay_orders 
        SET status = 'PAID', zalopay_trans_id = ?, callback_received = TRUE, webhook_verified = TRUE, paid_at = ?
        WHERE app_trans_id = ?
      `).bind(webhookData.zp_trans_id.toString(), paidAt, webhookData.app_trans_id).run();

      // Activate user subscription
      await this.activateUserSubscription(order.user_id as string, order.subscription_type as string, order.plan_duration_days as number);

      // Mark webhook as processed
      await this.updateWebhookLog(requestBody, true, true, 'Processed successfully');

      // Log analytics
      await this.logPaymentAnalytics(order.user_id as string, 'payment_success', {
        order_id: order.order_id,
        subscription_type: order.subscription_type,
        amount: order.amount,
        zalopay_trans_id: webhookData.zp_trans_id
      });

      return { success: true, message: 'Payment processed successfully' };

    } catch (error) {
      console.error('Error handling ZaloPay webhook:', error);
      await this.updateWebhookLog(requestBody, false, false, error instanceof Error ? error.message : 'Processing error');
      
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(orderId: string): Promise<PaymentStatus> {
    try {
      const order = await this.db.prepare(`
        SELECT * FROM zalopay_orders WHERE order_id = ?
      `).bind(orderId).first();

      if (!order) {
        return { success: false, error: 'Order not found', status: 'FAILED' };
      }

      // If already marked as paid, return success
      if (order.status === 'PAID') {
        return {
          success: true,
          order_id: orderId,
          status: 'PAID',
          amount: order.amount as number,
          paid_at: order.paid_at as string
        };
      }

      // Check if order expired
      const now = new Date();
      const expiresAt = new Date(order.expires_at as string);
      
      if (now > expiresAt && order.status === 'CREATED') {
        await this.updateOrderStatus(orderId, 'CANCELLED', 'Order expired');
        return { success: false, status: 'CANCELLED', error: 'Order expired' };
      }

      // Query ZaloPay API for latest status (optional - for real-time updates)
      // This can be implemented if ZaloPay provides a status check endpoint

      return {
        success: true,
        order_id: orderId,
        status: order.status as any,
        amount: order.amount as number
      };

    } catch (error) {
      console.error('Error checking payment status:', error);
      return {
        success: false,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user subscription info
   */
  async getUserSubscription(userId: string): Promise<{
    is_premium: boolean;
    subscription_type?: string;
    expires_at?: string;
    days_remaining?: number;
  }> {
    try {
      const user = await this.db.prepare(`
        SELECT subscription_type, subscription_expires_at 
        FROM users 
        WHERE id = ?
      `).bind(userId).first();

      if (!user || !user.subscription_expires_at) {
        return { is_premium: false };
      }

      const expiresAt = new Date(user.subscription_expires_at as string);
      const now = new Date();
      const isActive = expiresAt > now;

      if (!isActive) {
        // Update user to free if expired
        await this.db.prepare(`
          UPDATE users 
          SET subscription_type = 'free', subscription_expires_at = NULL 
          WHERE id = ?
        `).bind(userId).run();

        return { is_premium: false };
      }

      const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        is_premium: true,
        subscription_type: user.subscription_type as string,
        expires_at: user.subscription_expires_at as string,
        days_remaining: daysRemaining
      };

    } catch (error) {
      console.error('Error getting user subscription:', error);
      return { is_premium: false };
    }
  }

  /**
   * Get available subscription plans
   */
  getSubscriptionPlans(): Record<string, SubscriptionPlan> {
    return this.subscriptionPlans;
  }

  /**
   * Generate order ID
   */
  private generateOrderId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate app transaction ID (format: YYMMDD_appid_xxxxxxxxxx)
   */
  private generateAppTransId(): string {
    const date = new Date();
    const dateStr = date.getFullYear().toString().substr(2) + 
                   (date.getMonth() + 1).toString().padStart(2, '0') + 
                   date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 10);
    return `${dateStr}_${this.config.app_id}_${random}`;
  }

  /**
   * Generate MAC signature for ZaloPay API
   */
  private generateMac(data: any, key: string): string {
    const rawData = `${data.app_id}|${data.app_trans_id}|${data.app_user}|${data.amount}|${data.app_time}|${data.embed_data}|${data.item}`;
    return crypto.createHmac('sha256', key).update(rawData).digest('hex');
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(requestBody: string, signature: string): boolean {
    try {
      const webhookData = JSON.parse(requestBody);
      const rawData = `${webhookData.app_id}|${webhookData.app_trans_id}|${webhookData.app_user}|${webhookData.amount}|${webhookData.app_time}|${webhookData.embed_data}|${webhookData.item}`;
      const expectedSignature = crypto.createHmac('sha256', this.config.key2).update(rawData).digest('hex');
      return signature === expectedSignature;
    } catch {
      return false;
    }
  }

  /**
   * Call ZaloPay API
   */
  private async callZaloPayAPI(endpoint: string, data: any): Promise<any> {
    const url = `${this.config.endpoint}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`ZaloPay API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Update order status
   */
  private async updateOrderStatus(orderId: string, status: string, error?: string): Promise<void> {
    await this.db.prepare(`
      UPDATE zalopay_orders 
      SET status = ?
      WHERE order_id = ?
    `).bind(status, orderId).run();
  }

  /**
   * Activate user subscription
   */
  private async activateUserSubscription(userId: string, subscriptionType: string, durationDays: number): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    await this.db.prepare(`
      UPDATE users 
      SET subscription_type = ?, subscription_expires_at = ?
      WHERE id = ?
    `).bind(subscriptionType, expiresAt.toISOString(), userId).run();
  }

  /**
   * Log webhook for debugging
   */
  private async logWebhook(requestBody: string, signature: string): Promise<void> {
    try {
      const webhookData = JSON.parse(requestBody);
      await this.db.prepare(`
        INSERT INTO zalopay_webhooks 
        (app_trans_id, request_body, signature, signature_valid, order_found, processed)
        VALUES (?, ?, ?, FALSE, FALSE, FALSE)
      `).bind(webhookData.app_trans_id, requestBody, signature).run();
    } catch (error) {
      console.error('Error logging webhook:', error);
    }
  }

  /**
   * Update webhook log status
   */
  private async updateWebhookLog(
    requestBody: string, 
    signatureValid: boolean, 
    orderFound: boolean, 
    errorMessage?: string
  ): Promise<void> {
    try {
      const webhookData = JSON.parse(requestBody);
      await this.db.prepare(`
        UPDATE zalopay_webhooks 
        SET signature_valid = ?, order_found = ?, processed = ?, error_message = ?
        WHERE app_trans_id = ? AND request_body = ?
      `).bind(
        signatureValid, 
        orderFound, 
        orderFound && signatureValid, 
        errorMessage, 
        webhookData.app_trans_id, 
        requestBody
      ).run();
    } catch (error) {
      console.error('Error updating webhook log:', error);
    }
  }

  /**
   * Log payment analytics
   */
  private async logPaymentAnalytics(
    userId: string,
    eventName: string,
    eventData: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO feature_analytics 
        (user_id, feature_type, event_name, event_data, success, created_at)
        VALUES (?, 'payment', ?, ?, TRUE, datetime('now'))
      `).bind(userId, eventName, JSON.stringify(eventData)).run();
    } catch (error) {
      console.error('Error logging payment analytics:', error);
    }
  }
}

export { ZaloPayService };