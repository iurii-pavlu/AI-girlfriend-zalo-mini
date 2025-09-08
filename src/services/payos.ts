import { Bindings, PaymentRequest, PaymentResponse } from '../types';
import { Logger } from '../utils/logger';

export class PayOSService {
  private clientId: string;
  private apiKey: string;
  private checksumKey: string;
  private logger: Logger;
  private baseUrl: string = 'https://api-merchant.payos.vn';

  constructor(bindings: Bindings, sessionId: string) {
    this.clientId = bindings.PAYOS_CLIENT_ID;
    this.apiKey = bindings.PAYOS_API_KEY;
    this.checksumKey = bindings.PAYOS_CHECKSUM_KEY;
    this.logger = new Logger(sessionId);
  }

  // Generate signature for PayOS request
  private generateSignature(data: any): string {
    const sortedKeys = Object.keys(data).sort();
    const signaturePayload = sortedKeys
      .map(key => `${key}=${data[key]}`)
      .join('&');
    
    // In a real implementation, you would use HMAC-SHA256
    // For now, we'll use a simple hash (replace with proper HMAC)
    return this.simpleHash(signaturePayload + this.checksumKey);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async createPaymentLink(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      this.logger.info('Creating PayOS payment link', {
        orderCode: request.orderCode,
        amount: request.amount
      });

      // Prepare payment data
      const paymentData = {
        orderCode: request.orderCode,
        amount: request.amount,
        description: request.description,
        cancelUrl: request.cancelUrl,
        returnUrl: request.returnUrl
      };

      // Generate signature
      const signature = this.generateSignature(paymentData);

      // PayOS API call
      const response = await fetch(`${this.baseUrl}/v2/payment-requests`, {
        method: 'POST',
        headers: {
          'x-client-id': this.clientId,
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...paymentData,
          signature
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('PayOS API error', {
          status: response.status,
          error: errorText
        });
        throw new Error(`PayOS API error: ${response.status}`);
      }

      const result = await response.json() as PaymentResponse;

      this.logger.info('PayOS payment link created successfully', {
        orderCode: request.orderCode,
        paymentLinkId: result.data?.paymentLinkId
      });

      return result;

    } catch (error) {
      this.logger.error('Error creating PayOS payment link', error);
      throw new Error('Failed to create payment link');
    }
  }

  async verifyPaymentWebhook(webhookData: any): Promise<boolean> {
    try {
      // Verify webhook signature
      const { signature, ...data } = webhookData;
      const expectedSignature = this.generateSignature(data);

      const isValid = signature === expectedSignature;

      this.logger.info('PayOS webhook verification', {
        isValid,
        orderCode: data.orderCode
      });

      return isValid;

    } catch (error) {
      this.logger.error('Error verifying PayOS webhook', error);
      return false;
    }
  }

  async getPaymentInfo(orderCode: number): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/payment-requests/${orderCode}`, {
        method: 'GET',
        headers: {
          'x-client-id': this.clientId,
          'x-api-key': this.apiKey,
        }
      });

      if (!response.ok) {
        throw new Error(`PayOS API error: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      this.logger.error('Error getting payment info', error);
      throw error;
    }
  }

  // Calculate pricing in VND
  static calculatePrice(subscriptionType: 'weekly' | 'monthly', bindings: Bindings): number {
    const weeklyPrice = parseInt(bindings.WEEKLY_PRICE_VND) || 49000;
    const monthlyPrice = parseInt(bindings.MONTHLY_PRICE_VND) || 149000;

    return subscriptionType === 'weekly' ? weeklyPrice : monthlyPrice;
  }

  // Generate unique order code
  static generateOrderCode(): number {
    return Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
  }

  // Format Vietnamese Dong currency
  static formatVND(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  }
}