import { Logger } from '../utils/logger';

export interface ZaloUserInfo {
  id: string;
  name: string;
  avatar: string;
}

export interface ZaloPayment {
  zaloUserId: string;
  paymentId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export class ZaloIntegrationService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('zalo-integration');
  }

  /**
   * Get Zalo user information
   * This would be called from the frontend after Zalo SDK authentication
   */
  async getUserInfo(zaloUserId: string): Promise<ZaloUserInfo | null> {
    try {
      // In production, this would validate the Zalo user ID
      // For now, return mock data based on the provided ID
      
      if (!zaloUserId || zaloUserId.length < 10) {
        this.logger.warn('Invalid Zalo user ID provided');
        return null;
      }

      // Mock user data - in production you'd call Zalo API
      return {
        id: zaloUserId,
        name: `Zalo User ${zaloUserId.substring(0, 8)}`,
        avatar: `https://avatar.zdn.vn/default/${zaloUserId}`
      };

    } catch (error) {
      this.logger.error('Error getting Zalo user info', error);
      return null;
    }
  }

  /**
   * Validate Zalo Mini App context
   */
  validateZaloContext(userAgent: string, referer: string): boolean {
    try {
      // Check if request is coming from Zalo Mini App
      const isZaloMiniApp = userAgent.includes('ZaloMiniApp') || 
                           referer.includes('miniapp.zalo.me') ||
                           referer.includes('zalo.me');

      this.logger.info('Zalo context validation', { 
        isZaloMiniApp, 
        userAgent: userAgent.substring(0, 100),
        referer 
      });

      return isZaloMiniApp;
    } catch (error) {
      this.logger.error('Error validating Zalo context', error);
      return false;
    }
  }

  /**
   * Generate secure user session token
   */
  generateSecureToken(zaloUserId: string, timestamp: number): string {
    try {
      // In production, use proper JWT or similar secure token
      const payload = `${zaloUserId}_${timestamp}`;
      const hash = this.simpleHash(payload);
      return `zalo_${hash}`;
    } catch (error) {
      this.logger.error('Error generating secure token', error);
      return `fallback_${Date.now()}`;
    }
  }

  /**
   * Simple hash function (replace with proper crypto in production)
   */
  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Process Zalo payment callback
   */
  async processZaloPayment(paymentData: any): Promise<ZaloPayment | null> {
    try {
      // Validate payment data from Zalo
      if (!paymentData.zaloUserId || !paymentData.paymentId) {
        this.logger.warn('Invalid payment data from Zalo');
        return null;
      }

      const payment: ZaloPayment = {
        zaloUserId: paymentData.zaloUserId,
        paymentId: paymentData.paymentId,
        amount: paymentData.amount || 0,
        status: paymentData.status || 'pending',
        createdAt: new Date().toISOString()
      };

      this.logger.info('Processed Zalo payment', payment);
      return payment;

    } catch (error) {
      this.logger.error('Error processing Zalo payment', error);
      return null;
    }
  }

  /**
   * Create Zalo-compatible sharing data
   */
  createShareData(referralCode: string, baseUrl: string) {
    return {
      title: "Bạn Gái AI - Người Bạn Gái Ảo Dễ Thương",
      description: "Trò chuyện với bạn gái AI thông minh bằng tiếng Việt! Tham gia ngay để nhận 1 ngày miễn phí!",
      imageUrl: `${baseUrl}/static/og-image.png`,
      linkUrl: `${baseUrl}?ref=${referralCode}`,
      hashtag: "#BanGaiAI #ZaloMiniApp #AIVietnamese"
    };
  }
}