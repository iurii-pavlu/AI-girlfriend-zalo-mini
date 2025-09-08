import { Bindings, User, Referral, SubscriptionStatus, ReferralStats } from '../types';
import { Logger } from '../utils/logger';

export class SubscriptionService {
  private db: D1Database;
  private logger: Logger;
  private freeMessagesLimit: number;
  private referralBonusDays: number;

  constructor(bindings: Bindings, sessionId: string) {
    this.db = bindings.DB;
    this.logger = new Logger(sessionId);
    this.freeMessagesLimit = parseInt(bindings.FREE_MESSAGES_LIMIT) || 10;
    this.referralBonusDays = parseInt(bindings.REFERRAL_BONUS_DAYS) || 1;
  }

  // Generate unique referral code
  private generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'GF'; // Girlfriend prefix
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Create or get user
  async getOrCreateUser(userId: string, referralCode?: string): Promise<User> {
    try {
      // Try to get existing user
      let user = await this.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).bind(userId).first() as User;

      if (!user) {
        // Create new user
        const newReferralCode = this.generateReferralCode();
        let referredBy = null;

        // Validate referral code if provided
        if (referralCode) {
          const referrer = await this.db.prepare(`
            SELECT id FROM users WHERE referral_code = ?
          `).bind(referralCode).first();

          if (referrer) {
            referredBy = referralCode;
          }
        }

        await this.db.prepare(`
          INSERT INTO users (id, referral_code, referred_by, subscription_type, messages_used, created_at, last_active)
          VALUES (?, ?, ?, 'free', 0, datetime('now'), datetime('now'))
        `).bind(userId, newReferralCode, referredBy).run();

        // If referred by someone, create referral record
        if (referredBy) {
          const referrer = await this.db.prepare(`
            SELECT id FROM users WHERE referral_code = ?
          `).bind(referredBy).first();

          if (referrer) {
            await this.db.prepare(`
              INSERT INTO referrals (referrer_id, referred_id, reward_days, claimed, created_at)
              VALUES (?, ?, ?, false, datetime('now'))
            `).bind(referrer.id, userId, this.referralBonusDays).run();

            this.logger.info('Referral created', {
              referrerId: referrer.id,
              referredId: userId,
              rewardDays: this.referralBonusDays
            });
          }
        }

        // Get the created user
        user = await this.db.prepare(`
          SELECT * FROM users WHERE id = ?
        `).bind(userId).first() as User;
      }

      // Update last active
      await this.db.prepare(`
        UPDATE users SET last_active = datetime('now') WHERE id = ?
      `).bind(userId).run();

      return user;

    } catch (error) {
      this.logger.error('Error getting or creating user', error);
      throw new Error('Failed to get or create user');
    }
  }

  // Check subscription status
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    try {
      const user = await this.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).bind(userId).first() as User;

      if (!user) {
        return {
          canChat: false,
          messagesLeft: 0,
          subscriptionType: 'free',
          needsPayment: true,
          showPaywall: true
        };
      }

      const now = new Date();
      const messagesUsed = user.messages_used || 0;

      // Check if subscription is active
      let hasActiveSubscription = false;
      if (user.subscription_type !== 'free' && user.subscription_expires_at) {
        const expiresAt = new Date(user.subscription_expires_at);
        hasActiveSubscription = expiresAt > now;
      }

      // Calculate available messages
      let messagesLeft = 0;
      let canChat = false;

      if (hasActiveSubscription) {
        // Unlimited messages for paid subscribers
        canChat = true;
        messagesLeft = -1; // Unlimited
      } else {
        // Free user - check message limit
        messagesLeft = Math.max(0, this.freeMessagesLimit - messagesUsed);
        canChat = messagesLeft > 0;
      }

      // Check if should show paywall (after 10 messages)
      const showPaywall = !hasActiveSubscription && messagesUsed >= this.freeMessagesLimit;

      return {
        canChat,
        messagesLeft,
        subscriptionType: user.subscription_type,
        expiresAt: user.subscription_expires_at,
        needsPayment: !hasActiveSubscription && messagesLeft === 0,
        showPaywall
      };

    } catch (error) {
      this.logger.error('Error getting subscription status', error);
      throw new Error('Failed to get subscription status');
    }
  }

  // Increment message count
  async incrementMessageCount(userId: string): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE users SET messages_used = messages_used + 1 WHERE id = ?
      `).bind(userId).run();

      this.logger.info('Message count incremented', { userId });

    } catch (error) {
      this.logger.error('Error incrementing message count', error);
    }
  }

  // Apply referral bonus
  async applyReferralBonus(referrerId: string): Promise<void> {
    try {
      // Get unclaimed referrals
      const referrals = await this.db.prepare(`
        SELECT * FROM referrals WHERE referrer_id = ? AND claimed = false
      `).bind(referrerId).all();

      if (referrals.results.length === 0) {
        return;
      }

      const totalBonusDays = referrals.results.length * this.referralBonusDays;
      const bonusDate = new Date();
      bonusDate.setDate(bonusDate.getDate() + totalBonusDays);

      // Get current user
      const user = await this.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).bind(referrerId).first() as User;

      if (!user) return;

      let newExpiresAt = bonusDate.toISOString();

      // If user already has subscription, extend it
      if (user.subscription_expires_at) {
        const currentExpiry = new Date(user.subscription_expires_at);
        if (currentExpiry > new Date()) {
          const extendedDate = new Date(currentExpiry);
          extendedDate.setDate(extendedDate.getDate() + totalBonusDays);
          newExpiresAt = extendedDate.toISOString();
        }
      }

      // Update user subscription
      await this.db.prepare(`
        UPDATE users 
        SET subscription_expires_at = ?, subscription_type = 'weekly'
        WHERE id = ?
      `).bind(newExpiresAt, referrerId).run();

      // Mark referrals as claimed
      for (const referral of referrals.results) {
        await this.db.prepare(`
          UPDATE referrals SET claimed = true WHERE id = ?
        `).bind(referral.id).run();
      }

      this.logger.info('Referral bonus applied', {
        referrerId,
        bonusDays: totalBonusDays,
        newExpiresAt
      });

    } catch (error) {
      this.logger.error('Error applying referral bonus', error);
    }
  }

  // Get referral statistics
  async getReferralStats(userId: string): Promise<ReferralStats> {
    try {
      const user = await this.db.prepare(`
        SELECT referral_code FROM users WHERE id = ?
      `).bind(userId).first() as Pick<User, 'referral_code'>;

      if (!user) {
        throw new Error('User not found');
      }

      // Count total referrals
      const referralsCount = await this.db.prepare(`
        SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?
      `).bind(userId).first() as { count: number };

      // Count bonus days earned
      const bonusStats = await this.db.prepare(`
        SELECT 
          COUNT(*) as claimed_count,
          COALESCE(SUM(reward_days), 0) as total_days
        FROM referrals 
        WHERE referrer_id = ? AND claimed = true
      `).bind(userId).first() as { claimed_count: number; total_days: number };

      return {
        referralCode: user.referral_code,
        referralsCount: referralsCount.count || 0,
        bonusDaysEarned: bonusStats.total_days || 0,
        canEarnMore: true // Always can refer more friends
      };

    } catch (error) {
      this.logger.error('Error getting referral stats', error);
      throw new Error('Failed to get referral stats');
    }
  }

  // Upgrade subscription after payment
  async upgradeSubscription(userId: string, subscriptionType: 'weekly' | 'monthly'): Promise<void> {
    try {
      const now = new Date();
      const daysToAdd = subscriptionType === 'weekly' ? 7 : 30;
      
      // Get current user
      const user = await this.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).bind(userId).first() as User;

      if (!user) {
        throw new Error('User not found');
      }

      let newExpiresAt = new Date(now);
      
      // If user already has active subscription, extend it
      if (user.subscription_expires_at) {
        const currentExpiry = new Date(user.subscription_expires_at);
        if (currentExpiry > now) {
          newExpiresAt = new Date(currentExpiry);
        }
      }

      newExpiresAt.setDate(newExpiresAt.getDate() + daysToAdd);

      // Update subscription
      await this.db.prepare(`
        UPDATE users 
        SET subscription_type = ?, subscription_expires_at = ?
        WHERE id = ?
      `).bind(subscriptionType, newExpiresAt.toISOString(), userId).run();

      // Reset message count for fresh start
      await this.db.prepare(`
        UPDATE users SET messages_used = 0 WHERE id = ?
      `).bind(userId).run();

      this.logger.info('Subscription upgraded', {
        userId,
        subscriptionType,
        expiresAt: newExpiresAt.toISOString()
      });

    } catch (error) {
      this.logger.error('Error upgrading subscription', error);
      throw new Error('Failed to upgrade subscription');
    }
  }
}