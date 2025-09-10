import { Hono } from 'hono';
import { OnboardingService } from '../services/onboarding';
import { i18n } from '../services/i18n';

type Bindings = {
  DB: D1Database;
};

const onboarding = new Hono<{ Bindings: Bindings }>();

/**
 * Initialize onboarding for a user
 */
onboarding.post('/initialize/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    const onboardingService = new OnboardingService(c.env.DB);
    const progress = await onboardingService.initializeOnboarding(userId);

    return c.json({
      success: true,
      data: {
        progress,
        stages: onboardingService.getOnboardingStages(),
        next_stage: onboardingService.getNextStage(progress.stage)
      },
      message: 'Onboarding initialized successfully'
    });

  } catch (error) {
    console.error('Error initializing onboarding:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize onboarding'
    }, 500);
  }
});

/**
 * Get current onboarding progress
 */
onboarding.get('/progress/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    const onboardingService = new OnboardingService(c.env.DB);
    const progress = await onboardingService.getOnboardingProgress(userId);

    if (!progress) {
      return c.json({
        success: false,
        error: 'Onboarding not found for this user',
        data: null
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        progress,
        stages: onboardingService.getOnboardingStages(),
        next_stage: progress.onboarding_completed ? null : onboardingService.getNextStage(progress.stage)
      },
      message: 'Onboarding progress retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting onboarding progress:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get progress'
    }, 500);
  }
});

/**
 * Update onboarding stage with user response
 */
onboarding.post('/update/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const { stage_id, response, next_stage } = await c.req.json() as {
      stage_id: string;
      response: string;
      next_stage?: string;
    };

    if (!userId || !stage_id || response === undefined) {
      return c.json({
        success: false,
        error: 'user_id, stage_id, and response are required'
      }, 400);
    }

    const onboardingService = new OnboardingService(c.env.DB);
    
    // Get current progress to validate stage
    const currentProgress = await onboardingService.getOnboardingProgress(userId);
    if (!currentProgress) {
      return c.json({
        success: false,
        error: 'Onboarding not initialized for this user'
      }, 404);
    }

    if (currentProgress.onboarding_completed) {
      return c.json({
        success: false,
        error: 'Onboarding already completed'
      }, 400);
    }

    const updatedProgress = await onboardingService.updateOnboardingStage(
      userId,
      stage_id,
      response,
      next_stage
    );

    // If onboarding completed, get conversation starters
    let conversationStarters = null;
    if (updatedProgress.onboarding_completed) {
      conversationStarters = onboardingService.getConversationStarters(updatedProgress.profile_data);
    }

    return c.json({
      success: true,
      data: {
        progress: updatedProgress,
        conversation_starters: conversationStarters,
        next_stage: updatedProgress.onboarding_completed ? null : onboardingService.getNextStage(updatedProgress.stage),
        completion_message: updatedProgress.onboarding_completed ? i18n.t('onboarding.completion') : null
      },
      message: updatedProgress.onboarding_completed ? 'Onboarding completed successfully!' : 'Stage updated successfully'
    });

  } catch (error) {
    console.error('Error updating onboarding stage:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update stage'
    }, 500);
  }
});

/**
 * Skip onboarding and use defaults
 */
onboarding.post('/skip/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    const onboardingService = new OnboardingService(c.env.DB);
    
    // Check if already completed
    const currentProgress = await onboardingService.getOnboardingProgress(userId);
    if (currentProgress?.onboarding_completed) {
      return c.json({
        success: false,
        error: 'Onboarding already completed'
      }, 400);
    }

    const skippedProgress = await onboardingService.skipOnboarding(userId);
    const conversationStarters = onboardingService.getConversationStarters(skippedProgress.profile_data);

    return c.json({
      success: true,
      data: {
        progress: skippedProgress,
        conversation_starters: conversationStarters,
        completion_message: i18n.t('onboarding.completion')
      },
      message: 'Onboarding skipped successfully'
    });

  } catch (error) {
    console.error('Error skipping onboarding:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to skip onboarding'
    }, 500);
  }
});

/**
 * Get onboarding stages (for frontend to render questions)
 */
onboarding.get('/stages', async (c) => {
  try {
    const onboardingService = new OnboardingService(c.env.DB);
    const stages = onboardingService.getOnboardingStages();

    return c.json({
      success: true,
      data: {
        stages,
        total_stages: stages.length,
        language: i18n.getCurrentLanguage()
      },
      message: 'Onboarding stages retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting onboarding stages:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stages'
    }, 500);
  }
});

/**
 * Get personalized conversation starters based on completed profile
 */
onboarding.get('/conversation-starters/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    const onboardingService = new OnboardingService(c.env.DB);
    const progress = await onboardingService.getOnboardingProgress(userId);

    if (!progress) {
      return c.json({
        success: false,
        error: 'Onboarding not found for this user'
      }, 404);
    }

    if (!progress.onboarding_completed) {
      return c.json({
        success: false,
        error: 'Onboarding not completed yet'
      }, 400);
    }

    const conversationStarters = onboardingService.getConversationStarters(progress.profile_data);

    return c.json({
      success: true,
      data: {
        user_id: userId,
        conversation_starters: conversationStarters,
        personality_match: progress.ai_personality_match,
        dialogue_theme: progress.dialogue_theme,
        profile_data: progress.profile_data
      },
      message: 'Conversation starters generated successfully'
    });

  } catch (error) {
    console.error('Error getting conversation starters:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get conversation starters'
    }, 500);
  }
});

/**
 * Restart onboarding (reset progress)
 */
onboarding.post('/restart/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    // Reset onboarding progress
    await c.env.DB.prepare(`
      DELETE FROM user_onboarding WHERE user_id = ?
    `).bind(userId).run();

    // Update user table
    await c.env.DB.prepare(`
      UPDATE users SET onboarding_completed = FALSE WHERE id = ?
    `).bind(userId).run();

    // Log analytics
    await c.env.DB.prepare(`
      INSERT INTO feature_analytics 
      (user_id, feature_type, event_name, event_data, success, created_at)
      VALUES (?, 'onboarding', 'onboarding_restarted', '{}', TRUE, datetime('now'))
    `).bind(userId).run();

    // Reinitialize
    const onboardingService = new OnboardingService(c.env.DB);
    const progress = await onboardingService.initializeOnboarding(userId);

    return c.json({
      success: true,
      data: {
        progress,
        stages: onboardingService.getOnboardingStages(),
        next_stage: onboardingService.getNextStage(progress.stage)
      },
      message: 'Onboarding restarted successfully'
    });

  } catch (error) {
    console.error('Error restarting onboarding:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restart onboarding'
    }, 500);
  }
});

/**
 * Get onboarding analytics (Admin endpoint)
 */
onboarding.get('/analytics', async (c) => {
  try {
    const { days } = c.req.query();
    const dayCount = days ? parseInt(days) : 7;

    // Get completion stats
    const completionStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_started,
        COUNT(CASE WHEN onboarding_completed = 1 THEN 1 END) as total_completed,
        COUNT(CASE WHEN created_at >= datetime('now', '-${dayCount} days') THEN 1 END) as recent_started,
        COUNT(CASE WHEN completion_date >= datetime('now', '-${dayCount} days') THEN 1 END) as recent_completed
      FROM user_onboarding
    `).first();

    // Get stage drop-off analysis
    const stageStats = await c.env.DB.prepare(`
      SELECT 
        stage,
        COUNT(*) as users_at_stage
      FROM user_onboarding
      WHERE onboarding_completed = 0
      GROUP BY stage
      ORDER BY users_at_stage DESC
    `).all();

    // Get personality distribution
    const personalityStats = await c.env.DB.prepare(`
      SELECT 
        ai_personality_match as personality,
        COUNT(*) as count
      FROM user_onboarding
      WHERE onboarding_completed = 1 AND ai_personality_match IS NOT NULL
      GROUP BY ai_personality_match
      ORDER BY count DESC
    `).all();

    // Get theme distribution
    const themeStats = await c.env.DB.prepare(`
      SELECT 
        dialogue_theme as theme,
        COUNT(*) as count
      FROM user_onboarding
      WHERE onboarding_completed = 1 AND dialogue_theme IS NOT NULL
      GROUP BY dialogue_theme
      ORDER BY count DESC
    `).all();

    const totalStarted = (completionStats as any)?.total_started || 0;
    const totalCompleted = (completionStats as any)?.total_completed || 0;
    const completionRate = totalStarted > 0 ? (totalCompleted / totalStarted) * 100 : 0;

    return c.json({
      success: true,
      data: {
        period_days: dayCount,
        completion_stats: {
          ...completionStats,
          completion_rate: Math.round(completionRate * 100) / 100
        },
        stage_analysis: stageStats.results,
        personality_distribution: personalityStats.results,
        theme_distribution: themeStats.results
      },
      message: 'Onboarding analytics retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting onboarding analytics:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get analytics'
    }, 500);
  }
});

/**
 * Update user profile data (after onboarding completion)
 */
onboarding.patch('/profile/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const updates = await c.req.json() as Record<string, any>;

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    const onboardingService = new OnboardingService(c.env.DB);
    const currentProgress = await onboardingService.getOnboardingProgress(userId);

    if (!currentProgress) {
      return c.json({
        success: false,
        error: 'User onboarding not found'
      }, 404);
    }

    // Merge updates with existing profile data
    const updatedProfileData = {
      ...currentProgress.profile_data,
      ...updates
    };

    // Update database
    await c.env.DB.prepare(`
      UPDATE user_onboarding 
      SET 
        profile_data = ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(JSON.stringify(updatedProfileData), userId).run();

    // Log analytics
    await c.env.DB.prepare(`
      INSERT INTO feature_analytics 
      (user_id, feature_type, event_name, event_data, success, created_at)
      VALUES (?, 'onboarding', 'profile_updated', ?, TRUE, datetime('now'))
    `).bind(userId, JSON.stringify(updates)).run();

    return c.json({
      success: true,
      data: {
        user_id: userId,
        profile_data: updatedProfileData
      },
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile'
    }, 500);
  }
});

export default onboarding;