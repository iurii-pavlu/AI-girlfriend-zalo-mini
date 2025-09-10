import { Bindings } from '../types';
import { Logger } from '../utils/logger';

export interface EnhancedReferralStats {
  referralCode: string;
  referralsCount: number;
  referralsSuccessful: number;
  bonusDaysEarned: number;
  bonusDaysUsed: number;
  bonusDaysAvailable: number;
  maxReferralsAllowed: number;
  canEarnMore: boolean;
  isEligible: boolean;
  timeUntilNextReward?: string;
}

export interface ReferralReward {
  id: number;
  userId: string;
  rewardType: 'inviter' | 'invitee';
  rewardDays: number;
  appliedAt: string;
  expiresAt: string;
  status: 'active' | 'used' | 'expired';
  sourceEvent: string;
}

export interface ReferralAnalytics {
  date: string;
  totalReferrals: number;
  successfulReferrals: number;
  conversionRate: number;
  totalRewardsDays: number;
  topReferrers: Array<{
    userId: string;
    referralsCount: number;
    rewardsDays: number;
  }>;
}

export class EnhancedReferralService {
  private db: D1Database;
  private logger: Logger;
  private maxReferrals: number;
  private inviterRewardDays: number;
  private inviteeRewardDays: number;

  constructor(bindings: Bindings, sessionId: string) {
    this.db = bindings.DB;
    this.logger = new Logger(sessionId);
    this.maxReferrals = 10;
    this.inviterRewardDays = 3;
    this.inviteeRewardDays = 3;
  }

  /**
   * Generate referral link/code for user
   */
  async generateReferral(userId: string): Promise<{ referralCode: string; referralUrl: string; shareMessage: string }> {
    try {
      // Check if user exists and is eligible
      // Try to get user with enhanced fields, fallback to basic fields if columns don't exist
      let user;
      try {
        user = await this.db.prepare(`
          SELECT referral_code, is_referral_eligible, referrals_count, max_referrals_allowed
          FROM users WHERE id = ?
        `).bind(userId).first() as any;
      } catch (error) {
        // Fallback to basic referral_code if enhanced columns don't exist yet
        user = await this.db.prepare(`
          SELECT referral_code FROM users WHERE id = ?
        `).bind(userId).first() as any;
        
        if (user) {
          // Set default values for missing columns
          user.is_referral_eligible = true;
          user.referrals_count = 0;
          user.max_referrals_allowed = 10;
        }
      }

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.is_referral_eligible) {
        throw new Error('User is not eligible for referrals (blocked due to abuse)');
      }

      if (user.referrals_count >= user.max_referrals_allowed) {
        throw new Error(`User has reached maximum referrals limit (${user.max_referrals_allowed})`);
      }

      const baseUrl = process.env.APP_BASE_URL || 'https://your-app.pages.dev';
      const referralUrl = `${baseUrl}?ref=${user.referral_code}`;
      
      const shareMessage = this.generateShareMessage(user.referral_code, referralUrl);

      this.logger.info('Generated referral for user', {
        userId,
        referralCode: user.referral_code,
        remainingReferrals: user.max_referrals_allowed - user.referrals_count
      });

      return {
        referralCode: user.referral_code,
        referralUrl,
        shareMessage
      };

    } catch (error) {
      this.logger.error('Error generating referral', error);
      throw error;
    }
  }

  /**
   * Apply referral when new user signs up
   */
  async applyReferral(newUserId: string, referralCode: string): Promise<{ success: boolean; rewards: any; message: string }> {
    try {
      // Validate referral code
      const referrer = await this.db.prepare(`
        SELECT id, is_referral_eligible, referrals_count, max_referrals_allowed
        FROM users WHERE referral_code = ?
      `).bind(referralCode).first() as any;

      if (!referrer) {
        throw new Error('Invalid referral code');
      }

      if (!referrer.is_referral_eligible) {
        throw new Error('Referrer is not eligible (blocked)');
      }

      if (referrer.referrals_count >= referrer.max_referrals_allowed) {
        throw new Error('Referrer has reached maximum referrals limit');
      }

      // Check if user was already referred
      const existingReferral = await this.db.prepare(`
        SELECT id FROM referrals WHERE referred_id = ?
      `).bind(newUserId).first();

      if (existingReferral) {
        throw new Error('User was already referred by someone');
      }

      // Create referral record
      const referralResult = await this.db.prepare(`
        INSERT INTO referrals (
          referrer_id, referred_id, inviter_reward_days, invitee_reward_days,
          status, conversion_event, created_at
        ) VALUES (?, ?, ?, ?, 'pending', 'signup', datetime('now'))
      `).bind(
        referrer.id,
        newUserId,
        this.inviterRewardDays,
        this.inviteeRewardDays
      ).run();

      const referralId = referralResult.meta.last_row_id;

      // Apply rewards to both users
      await this.applyRewardsForReferral(referralId as number, referrer.id, newUserId);

      // Update referral status to completed
      await this.db.prepare(`
        UPDATE referrals SET 
          status = 'completed',
          inviter_rewarded = true,
          invitee_rewarded = true,
          inviter_reward_applied_at = datetime('now'),
          invitee_reward_applied_at = datetime('now')
        WHERE id = ?
      `).bind(referralId).run();

      const rewards = {
        inviter: { userId: referrer.id, days: this.inviterRewardDays },
        invitee: { userId: newUserId, days: this.inviteeRewardDays }
      };

      this.logger.info('Referral applied successfully', {
        referrerId: referrer.id,
        referredId: newUserId,
        referralId,
        rewards
      });

      return {
        success: true,
        rewards,
        message: `Chúc mừng! Bạn và người giới thiệu đều nhận được ${this.inviteeRewardDays} ngày Pro miễn phí! 🎉`
      };

    } catch (error) {
      this.logger.error('Error applying referral', error);
      throw error;
    }
  }

  /**
   * Apply rewards for a referral
   */
  private async applyRewardsForReferral(referralId: number, referrerId: string, referredId: string): Promise<void> {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30); // Rewards expire in 30 days

    // Apply inviter reward
    await this.db.prepare(`
      INSERT INTO referral_rewards (
        user_id, referral_id, reward_type, reward_days, expires_at, source_event
      ) VALUES (?, ?, 'inviter', ?, ?, 'signup')
    `).bind(referrerId, referralId, this.inviterRewardDays, expirationDate.toISOString()).run();

    // Apply invitee reward
    await this.db.prepare(`
      INSERT INTO referral_rewards (
        user_id, referral_id, reward_type, reward_days, expires_at, source_event
      ) VALUES (?, ?, 'invitee', ?, ?, 'signup')
    `).bind(referredId, referralId, this.inviteeRewardDays, expirationDate.toISOString()).run();

    // Update users' bonus days
    await this.db.prepare(`
      UPDATE users SET referral_reward_days_earned = referral_reward_days_earned + ?
      WHERE id = ?
    `).bind(this.inviterRewardDays, referrerId).run();

    await this.db.prepare(`
      UPDATE users SET referral_reward_days_earned = referral_reward_days_earned + ?
      WHERE id = ?
    `).bind(this.inviteeRewardDays, referredId).run();
  }

  /**
   * Get enhanced referral statistics
   */
  async getReferralStats(userId: string): Promise<EnhancedReferralStats> {
    try {
      // Try enhanced query first, fallback to basic if columns don't exist
      let user;
      try {
        user = await this.db.prepare(`
          SELECT 
            referral_code, 
            referrals_count,
            referrals_successful,
            referral_reward_days_earned,
            referral_reward_days_used,
            max_referrals_allowed,
            is_referral_eligible
          FROM users WHERE id = ?
        `).bind(userId).first() as any;
      } catch (error) {
        // Fallback query for basic referral_code
        user = await this.db.prepare(`
          SELECT referral_code FROM users WHERE id = ?
        `).bind(userId).first() as any;
        
        if (user) {
          // Set default values for missing columns
          user.referrals_count = 0;
          user.referrals_successful = 0;
          user.referral_reward_days_earned = 0;
          user.referral_reward_days_used = 0;
          user.max_referrals_allowed = 10;
          user.is_referral_eligible = true;
        }
      }

      if (!user) {
        throw new Error('User not found');
      }

      const bonusDaysAvailable = Math.max(0, user.referral_reward_days_earned - user.referral_reward_days_used);
      const canEarnMore = user.is_referral_eligible && user.referrals_count < user.max_referrals_allowed;

      return {
        referralCode: user.referral_code,
        referralsCount: user.referrals_count || 0,
        referralsSuccessful: user.referrals_successful || 0,
        bonusDaysEarned: user.referral_reward_days_earned || 0,
        bonusDaysUsed: user.referral_reward_days_used || 0,
        bonusDaysAvailable,
        maxReferralsAllowed: user.max_referrals_allowed || 10,
        canEarnMore,
        isEligible: user.is_referral_eligible === 1 || user.is_referral_eligible === true
      };

    } catch (error) {
      this.logger.error('Error getting referral stats', error);
      throw error;
    }
  }

  /**
   * Get user's referral rewards
   */
  async getUserRewards(userId: string): Promise<ReferralReward[]> {
    try {
      const rewards = await this.db.prepare(`
        SELECT * FROM referral_rewards 
        WHERE user_id = ? 
        ORDER BY created_at DESC
      `).bind(userId).all() as any;

      return rewards.results.map((reward: any) => ({
        id: reward.id,
        userId: reward.user_id,
        rewardType: reward.reward_type,
        rewardDays: reward.reward_days,
        appliedAt: reward.applied_at,
        expiresAt: reward.expires_at,
        status: reward.status,
        sourceEvent: reward.source_event
      }));

    } catch (error) {
      this.logger.error('Error getting user rewards', error);
      throw error;
    }
  }

  /**
   * Generate Vietnamese share message
   */
  private generateShareMessage(referralCode: string, referralUrl: string): string {
    const messages = [
      `🥰 Tham gia với em trên AI Girlfriend! Sử dụng mã ${referralCode} để nhận 3 ngày Pro miễn phí! ${referralUrl}`,
      `💕 Bạn gái AI đang chờ anh! Dùng mã ${referralCode} nhận ngay 3 ngày trải nghiệm miễn phí! ${referralUrl}`,
      `🌸 Chat với bạn gái AI xinh đẹp! Mã giới thiệu ${referralCode} = 3 ngày Pro free! ${referralUrl}`,
      `✨ AI Girlfriend - Trò chuyện không giới hạn! Code ${referralCode} tặng 3 ngày Premium! ${referralUrl}`
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Get daily referral analytics
   */
  async getDailyAnalytics(date?: string): Promise<ReferralAnalytics> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const analytics = await this.db.prepare(`
        SELECT * FROM referral_analytics WHERE date = ?
      `).bind(targetDate).first() as any;

      if (analytics) {
        return {
          date: analytics.date,
          totalReferrals: analytics.total_referrals,
          successfulReferrals: analytics.successful_referrals,
          conversionRate: analytics.conversion_rate,
          totalRewardsDays: analytics.total_inviter_rewards + analytics.total_invitee_rewards,
          topReferrers: [] // Would need additional query
        };
      }

      // Generate analytics for the date
      return await this.generateDailyAnalytics(targetDate);

    } catch (error) {
      this.logger.error('Error getting daily analytics', error);
      throw error;
    }
  }

  /**
   * Generate and store daily analytics
   */
  private async generateDailyAnalytics(date: string): Promise<ReferralAnalytics> {
    try {
      // Get referral stats for the day
      const stats = await this.db.prepare(`
        SELECT 
          COUNT(*) as total_referrals,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_referrals,
          SUM(CASE WHEN status = 'completed' THEN inviter_reward_days ELSE 0 END) as total_inviter_rewards,
          SUM(CASE WHEN status = 'completed' THEN invitee_reward_days ELSE 0 END) as total_invitee_rewards
        FROM referrals 
        WHERE DATE(created_at) = ?
      `).bind(date).first() as any;

      const conversionRate = stats.total_referrals > 0 ? 
        (stats.successful_referrals / stats.total_referrals * 100) : 0;

      // Store in analytics table
      await this.db.prepare(`
        INSERT OR REPLACE INTO referral_analytics (
          date, total_referrals, successful_referrals, 
          total_inviter_rewards, total_invitee_rewards, conversion_rate
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        date,
        stats.total_referrals || 0,
        stats.successful_referrals || 0,
        stats.total_inviter_rewards || 0,
        stats.total_invitee_rewards || 0,
        conversionRate
      ).run();

      return {
        date,
        totalReferrals: stats.total_referrals || 0,
        successfulReferrals: stats.successful_referrals || 0,
        conversionRate: Math.round(conversionRate * 100) / 100,
        totalRewardsDays: (stats.total_inviter_rewards || 0) + (stats.total_invitee_rewards || 0),
        topReferrers: []
      };

    } catch (error) {
      this.logger.error('Error generating daily analytics', error);
      throw error;
    }
  }
}