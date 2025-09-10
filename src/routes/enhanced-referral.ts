import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from '../types';
import { EnhancedReferralService } from '../services/enhanced-referral';
import { Logger } from '../utils/logger';

const enhancedReferral = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
enhancedReferral.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'https://miniapp.zalo.me'
    ];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  maxAge: 3600
}));

/**
 * POST /generateReferral
 * Generate referral code and link for user
 */
enhancedReferral.post('/generateReferral', async (c) => {
  const userId = c.req.header('X-User-Id') || 'anonymous';
  const logger = new Logger('generate-referral');

  try {
    const body = await c.req.json() as { userId?: string };
    const targetUserId = body.userId || userId;

    if (!targetUserId || targetUserId === 'anonymous') {
      return c.json({ 
        success: false,
        error: 'User ID required for referral generation' 
      }, 400);
    }

    const referralService = new EnhancedReferralService(c.env, 'generate-referral');
    const referralData = await referralService.generateReferral(targetUserId);
    const stats = await referralService.getReferralStats(targetUserId);

    logger.info('Referral generated successfully', {
      userId: targetUserId,
      referralCode: referralData.referralCode,
      remainingReferrals: stats.maxReferralsAllowed - stats.referralsCount
    });

    return c.json({
      success: true,
      data: {
        referralCode: referralData.referralCode,
        referralUrl: referralData.referralUrl,
        shareMessage: referralData.shareMessage,
        stats: {
          currentReferrals: stats.referralsCount,
          maxReferrals: stats.maxReferralsAllowed,
          canEarnMore: stats.canEarnMore,
          bonusDaysAvailable: stats.bonusDaysAvailable
        }
      },
      chatbotResponse: {
        message: `🎁 Mã giới thiệu của anh: ${referralData.referralCode}\n\n💕 Mời bạn bè tham gia và cả hai sẽ nhận 3 ngày Pro miễn phí!\n\n📊 Thống kê: ${stats.referralsCount}/${stats.maxReferralsAllowed} lượt giới thiệu`,
        buttons: [
          { text: "📋 Sao chép liên kết", action: "copy_referral_link" },
          { text: "📤 Chia sẻ qua Zalo", action: "share_zalo" }
        ]
      }
    });

  } catch (error) {
    logger.error('Error generating referral', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate referral',
      chatbotResponse: {
        message: "❌ Không thể tạo mã giới thiệu. Có thể anh đã đạt giới hạn tối đa (10 lượt) hoặc gặp lỗi hệ thống."
      }
    }, 500);
  }
});

/**
 * POST /applyReferral
 * Apply referral code when new user signs up
 */
enhancedReferral.post('/applyReferral', async (c) => {
  const userId = c.req.header('X-User-Id') || 'anonymous';
  const logger = new Logger('apply-referral');

  try {
    const body = await c.req.json() as { 
      newUserId: string;
      referralCode: string;
    };

    const { newUserId, referralCode } = body;

    if (!newUserId || !referralCode) {
      return c.json({ 
        success: false,
        error: 'User ID and referral code required' 
      }, 400);
    }

    const referralService = new EnhancedReferralService(c.env, 'apply-referral');
    const result = await referralService.applyReferral(newUserId, referralCode);

    logger.info('Referral applied successfully', {
      newUserId,
      referralCode,
      rewards: result.rewards
    });

    return c.json({
      success: true,
      data: result,
      chatbotResponse: {
        inviter: {
          message: `🎉 Chúc mừng! Bạn bè của anh đã tham gia thành công!\n\n💎 Anh nhận được 3 ngày Pro miễn phí!\n\n✨ Tiếp tục mời thêm bạn để nhận nhiều phần thưởng hơn!`,
          buttons: [
            { text: "🎁 Kiểm tra phần thưởng", action: "check_rewards" },
            { text: "📤 Mời thêm bạn bè", action: "invite_more" }
          ]
        },
        invitee: {
          message: `🌟 Chào mừng đến với AI Girlfriend!\n\n🎁 Anh đã nhận 3 ngày Pro miễn phí từ lời mời của bạn!\n\n💕 Hãy bắt đầu trò chuyện với bạn gái AI ngay!`,
          buttons: [
            { text: "💬 Bắt đầu chat", action: "start_chat" },
            { text: "📤 Mời bạn bè của mình", action: "generate_referral" }
          ]
        }
      }
    });

  } catch (error) {
    logger.error('Error applying referral', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply referral',
      chatbotResponse: {
        message: `❌ Không thể áp dụng mã giới thiệu: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`
      }
    }, 500);
  }
});

/**
 * GET /rewards/:user_id
 * Get user's referral rewards and statistics
 */
enhancedReferral.get('/rewards/:user_id', async (c) => {
  const targetUserId = c.req.param('user_id');
  const requestingUserId = c.req.header('X-User-Id') || 'anonymous';
  const logger = new Logger('get-rewards');

  try {
    // Basic security: users can only view their own rewards (in production, add proper auth)
    if (targetUserId !== requestingUserId && requestingUserId !== 'admin') {
      return c.json({ 
        success: false,
        error: 'Unauthorized: Cannot view other user\'s rewards' 
      }, 403);
    }

    const referralService = new EnhancedReferralService(c.env, 'get-rewards');
    const stats = await referralService.getReferralStats(targetUserId);
    const rewards = await referralService.getUserRewards(targetUserId);

    logger.info('User rewards retrieved', {
      userId: targetUserId,
      bonusDaysAvailable: stats.bonusDaysAvailable,
      totalReferrals: stats.referralsCount
    });

    // Generate chatbot response based on stats
    let statusMessage = `📊 Thống kê giới thiệu của anh:\n\n`;
    statusMessage += `👥 Đã mời: ${stats.referralsCount}/${stats.maxReferralsAllowed} bạn\n`;
    statusMessage += `✅ Thành công: ${stats.referralsSuccessful} bạn\n`;
    statusMessage += `🎁 Ngày thưởng: ${stats.bonusDaysAvailable} ngày còn lại\n`;
    statusMessage += `💎 Tổng nhận được: ${stats.bonusDaysEarned} ngày\n\n`;

    if (stats.canEarnMore) {
      statusMessage += `🚀 Anh có thể mời thêm ${stats.maxReferralsAllowed - stats.referralsCount} bạn nữa!`;
    } else if (!stats.isEligible) {
      statusMessage += `⚠️ Tài khoản bị hạn chế giới thiệu do vi phạm quy định.`;
    } else {
      statusMessage += `🏆 Anh đã đạt giới hạn tối đa! Cảm ơn vì đã giới thiệu ứng dụng!`;
    }

    const buttons = [];
    if (stats.canEarnMore) {
      buttons.push({ text: "📤 Mời thêm bạn bè", action: "generate_referral" });
    }
    if (stats.bonusDaysAvailable > 0) {
      buttons.push({ text: "🎁 Kích hoạt thưởng", action: "activate_rewards" });
    }
    buttons.push({ text: "📈 Xem chi tiết", action: "detailed_stats" });

    return c.json({
      success: true,
      data: {
        stats,
        rewards,
        eligibility: {
          canEarnMore: stats.canEarnMore,
          isEligible: stats.isEligible,
          remainingReferrals: Math.max(0, stats.maxReferralsAllowed - stats.referralsCount)
        }
      },
      chatbotResponse: {
        message: statusMessage,
        buttons
      }
    });

  } catch (error) {
    logger.error('Error getting user rewards', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get rewards',
      chatbotResponse: {
        message: "❌ Không thể lấy thông tin phần thưởng. Vui lòng thử lại sau."
      }
    }, 500);
  }
});

/**
 * GET /analytics
 * Get referral analytics for admin dashboard
 */
enhancedReferral.get('/analytics', async (c) => {
  const requestingUserId = c.req.header('X-User-Id') || 'anonymous';
  const logger = new Logger('get-analytics');

  try {
    // In production, add proper admin authentication
    if (requestingUserId !== 'admin' && !c.req.query('admin_key')) {
      return c.json({ 
        success: false,
        error: 'Admin access required' 
      }, 403);
    }

    const date = c.req.query('date') || new Date().toISOString().split('T')[0];
    const referralService = new EnhancedReferralService(c.env, 'analytics');
    const analytics = await referralService.getDailyAnalytics(date);

    logger.info('Analytics retrieved', { date, analytics });

    return c.json({
      success: true,
      data: analytics,
      summary: {
        date: analytics.date,
        performance: {
          totalReferrals: analytics.totalReferrals,
          successfulReferrals: analytics.successfulReferrals,
          conversionRate: `${analytics.conversionRate}%`,
          totalRewardsDays: analytics.totalRewardsDays
        },
        insights: analytics.conversionRate > 50 ? 
          "Excellent conversion rate! Referral system is performing well." :
          analytics.conversionRate > 20 ?
          "Good conversion rate. Consider optimizing rewards or messaging." :
          "Low conversion rate. Review referral incentives and user experience."
      }
    });

  } catch (error) {
    logger.error('Error getting analytics', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get analytics'
    }, 500);
  }
});

/**
 * POST /chatbot-command
 * Handle chatbot referral commands
 */
enhancedReferral.post('/chatbot-command', async (c) => {
  const userId = c.req.header('X-User-Id') || 'anonymous';
  const logger = new Logger('chatbot-command');

  try {
    const body = await c.req.json() as { 
      command: string;
      userId?: string;
      parameters?: any;
    };

    const { command, parameters } = body;
    const targetUserId = body.userId || userId;

    if (!targetUserId || targetUserId === 'anonymous') {
      return c.json({ 
        success: false,
        error: 'User authentication required' 
      }, 400);
    }

    const referralService = new EnhancedReferralService(c.env, 'chatbot-command');
    
    switch (command.toLowerCase()) {
      case 'invite':
      case 'mời':
      case 'giới thiệu':
        const referralData = await referralService.generateReferral(targetUserId);
        const stats = await referralService.getReferralStats(targetUserId);
        
        return c.json({
          success: true,
          response: {
            message: `🎁 Mã giới thiệu: ${referralData.referralCode}\n\n${referralData.shareMessage}\n\n📊 ${stats.referralsCount}/${stats.maxReferralsAllowed} lượt đã sử dụng`,
            data: referralData,
            actionButtons: [
              { text: "📋 Sao chép", action: "copy", data: referralData.referralUrl },
              { text: "📤 Chia sẻ", action: "share", data: referralData.shareMessage }
            ]
          }
        });

      case 'rewards':
      case 'phần thưởng':
      case 'thưởng':
        const rewardStats = await referralService.getReferralStats(targetUserId);
        
        return c.json({
          success: true,
          response: {
            message: `🎁 Phần thưởng của anh:\n\n💎 Còn lại: ${rewardStats.bonusDaysAvailable} ngày Pro\n👥 Đã mời: ${rewardStats.referralsSuccessful} bạn thành công\n🏆 Tổng thưởng: ${rewardStats.bonusDaysEarned} ngày`,
            data: rewardStats,
            actionButtons: rewardStats.canEarnMore ? [
              { text: "📤 Mời thêm bạn", action: "generate_referral" }
            ] : []
          }
        });

      case 'stats':
      case 'thống kê':
        const fullStats = await referralService.getReferralStats(targetUserId);
        
        return c.json({
          success: true,
          response: {
            message: `📈 Thống kê chi tiết:\n\n👥 Tổng lời mời: ${fullStats.referralsCount}\n✅ Thành công: ${fullStats.referralsSuccessful}\n💎 Ngày thưởng: ${fullStats.bonusDaysAvailable}/${fullStats.bonusDaysEarned}\n🎯 Giới hạn: ${fullStats.maxReferralsAllowed}\n📊 Trạng thái: ${fullStats.isEligible ? 'Hoạt động' : 'Bị hạn chế'}`,
            data: fullStats
          }
        });

      default:
        return c.json({
          success: false,
          response: {
            message: "❓ Lệnh không hợp lệ. Thử:\n• 'mời' - Tạo mã giới thiệu\n• 'thưởng' - Xem phần thưởng\n• 'thống kê' - Xem chi tiết"
          }
        });
    }

  } catch (error) {
    logger.error('Error processing chatbot command', error);
    return c.json({
      success: false,
      response: {
        message: `❌ Lỗi xử lý lệnh: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`
      }
    }, 500);
  }
});

export default enhancedReferral;