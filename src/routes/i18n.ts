import { Hono } from 'hono';
import { i18n, SupportedLanguage } from '../services/i18n';

type Bindings = {
  DB: D1Database;
};

const i18nRoutes = new Hono<{ Bindings: Bindings }>();

/**
 * Get available languages
 */
i18nRoutes.get('/languages', async (c) => {
  try {
    const languages = i18n.getAvailableLanguages();
    const currentLanguage = i18n.getCurrentLanguage();

    return c.json({
      success: true,
      data: {
        available_languages: languages,
        current_language: currentLanguage,
        default_language: 'vi'
      },
      message: 'Available languages retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting available languages:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get languages'
    }, 500);
  }
});

/**
 * Get all translations for current language
 */
i18nRoutes.get('/translations', async (c) => {
  try {
    const { lang } = c.req.query();
    
    // Set language if provided
    if (lang && ['vi', 'en'].includes(lang)) {
      i18n.setLanguage(lang as SupportedLanguage);
    }

    const translations = i18n.getAllTranslations();
    const currentLanguage = i18n.getCurrentLanguage();

    return c.json({
      success: true,
      data: {
        language: currentLanguage,
        translations: translations
      },
      message: 'Translations retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting translations:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get translations'
    }, 500);
  }
});

/**
 * Get translation for specific key
 */
i18nRoutes.get('/translate/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const { lang, params } = c.req.query();

    if (!key) {
      return c.json({
        success: false,
        error: 'Translation key is required'
      }, 400);
    }

    // Set language if provided
    if (lang && ['vi', 'en'].includes(lang)) {
      i18n.setLanguage(lang as SupportedLanguage);
    }

    // Parse parameters if provided
    let translationParams: Record<string, string | number> | undefined;
    if (params) {
      try {
        translationParams = JSON.parse(params);
      } catch (e) {
        return c.json({
          success: false,
          error: 'Invalid params format. Expected JSON object.'
        }, 400);
      }
    }

    const translation = i18n.t(key, translationParams);
    const currentLanguage = i18n.getCurrentLanguage();

    return c.json({
      success: true,
      data: {
        key: key,
        translation: translation,
        language: currentLanguage,
        params: translationParams
      },
      message: 'Translation retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting translation:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get translation'
    }, 500);
  }
});

/**
 * Set user language preference
 */
i18nRoutes.post('/set-language/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');
    const { language } = await c.req.json() as { language: SupportedLanguage };

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    if (!language || !['vi', 'en'].includes(language)) {
      return c.json({
        success: false,
        error: 'Valid language is required (vi or en)'
      }, 400);
    }

    // Update user preferences in database
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO user_preferences 
      (user_id, language, updated_at)
      VALUES (?, ?, datetime('now'))
    `).bind(userId, language).run();

    // Update users table language as well for backwards compatibility
    await c.env.DB.prepare(`
      UPDATE users 
      SET language = ?
      WHERE id = ?
    `).bind(language, userId).run();

    // Set current i18n language
    i18n.setLanguage(language);

    // Log analytics
    await c.env.DB.prepare(`
      INSERT INTO feature_analytics 
      (user_id, feature_type, event_name, event_data, success, created_at)
      VALUES (?, 'language_switch', 'language_changed', ?, TRUE, datetime('now'))
    `).bind(userId, JSON.stringify({ 
      previous_language: i18n.getCurrentLanguage(),
      new_language: language 
    })).run();

    return c.json({
      success: true,
      data: {
        user_id: userId,
        language: language,
        applied: true
      },
      message: `Language set to ${language === 'vi' ? 'Vietnamese' : 'English'} successfully`
    });

  } catch (error) {
    console.error('Error setting user language:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set language'
    }, 500);
  }
});

/**
 * Get user language preference
 */
i18nRoutes.get('/user-language/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required'
      }, 400);
    }

    // Get user language from preferences
    const userPrefs = await c.env.DB.prepare(`
      SELECT language, timezone FROM user_preferences WHERE user_id = ?
    `).bind(userId).first();

    // Fallback to users table if not in preferences
    let language = userPrefs?.language as SupportedLanguage;
    if (!language) {
      const userRecord = await c.env.DB.prepare(`
        SELECT language FROM users WHERE id = ?
      `).bind(userId).first();
      language = (userRecord?.language as SupportedLanguage) || 'vi';
    }

    const timezone = (userPrefs?.timezone as string) || 'Asia/Ho_Chi_Minh';

    return c.json({
      success: true,
      data: {
        user_id: userId,
        language: language,
        timezone: timezone,
        available_languages: i18n.getAvailableLanguages()
      },
      message: 'User language retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting user language:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user language'
    }, 500);
  }
});

/**
 * Format date/time according to user language
 */
i18nRoutes.post('/format-datetime', async (c) => {
  try {
    const { datetime, language, format_options } = await c.req.json() as {
      datetime: string;
      language?: SupportedLanguage;
      format_options?: Intl.DateTimeFormatOptions;
    };

    if (!datetime) {
      return c.json({
        success: false,
        error: 'datetime is required'
      }, 400);
    }

    // Set language if provided
    if (language && ['vi', 'en'].includes(language)) {
      i18n.setLanguage(language);
    }

    const date = new Date(datetime);
    if (isNaN(date.getTime())) {
      return c.json({
        success: false,
        error: 'Invalid datetime format'
      }, 400);
    }

    const formattedDate = i18n.formatDateTime(date, format_options);

    return c.json({
      success: true,
      data: {
        original_datetime: datetime,
        formatted_datetime: formattedDate,
        language: i18n.getCurrentLanguage(),
        timezone: i18n.getTimezone()
      },
      message: 'Datetime formatted successfully'
    });

  } catch (error) {
    console.error('Error formatting datetime:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to format datetime'
    }, 500);
  }
});

/**
 * Format currency according to user language
 */
i18nRoutes.post('/format-currency', async (c) => {
  try {
    const { amount, language } = await c.req.json() as {
      amount: number;
      language?: SupportedLanguage;
    };

    if (amount === undefined || amount === null) {
      return c.json({
        success: false,
        error: 'amount is required'
      }, 400);
    }

    if (typeof amount !== 'number') {
      return c.json({
        success: false,
        error: 'amount must be a number'
      }, 400);
    }

    // Set language if provided
    if (language && ['vi', 'en'].includes(language)) {
      i18n.setLanguage(language);
    }

    const formattedCurrency = i18n.formatCurrency(amount);

    return c.json({
      success: true,
      data: {
        original_amount: amount,
        formatted_currency: formattedCurrency,
        language: i18n.getCurrentLanguage(),
        currency: 'VND'
      },
      message: 'Currency formatted successfully'
    });

  } catch (error) {
    console.error('Error formatting currency:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to format currency'
    }, 500);
  }
});

/**
 * Batch translate multiple keys
 */
i18nRoutes.post('/batch-translate', async (c) => {
  try {
    const { keys, language, params } = await c.req.json() as {
      keys: string[];
      language?: SupportedLanguage;
      params?: Record<string, Record<string, string | number>>;
    };

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return c.json({
        success: false,
        error: 'keys array is required and must not be empty'
      }, 400);
    }

    // Set language if provided
    if (language && ['vi', 'en'].includes(language)) {
      i18n.setLanguage(language);
    }

    const translations: Record<string, string> = {};
    
    for (const key of keys) {
      const keyParams = params?.[key];
      translations[key] = i18n.t(key, keyParams);
    }

    return c.json({
      success: true,
      data: {
        translations: translations,
        language: i18n.getCurrentLanguage(),
        total_keys: keys.length
      },
      message: 'Batch translation completed successfully'
    });

  } catch (error) {
    console.error('Error batch translating:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to batch translate'
    }, 500);
  }
});

/**
 * Get language statistics (Admin endpoint)
 */
i18nRoutes.get('/stats', async (c) => {
  try {
    const { days } = c.req.query();
    const dayCount = days ? parseInt(days) : 7;

    // Get language distribution from user preferences
    const languageStats = await c.env.DB.prepare(`
      SELECT 
        language,
        COUNT(*) as user_count
      FROM user_preferences
      GROUP BY language
      ORDER BY user_count DESC
    `).all();

    // Get recent language switches
    const recentSwitches = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as switch_count
      FROM feature_analytics
      WHERE feature_type = 'language_switch' 
      AND event_name = 'language_changed'
      AND created_at >= datetime('now', '-${dayCount} days')
    `).first();

    // Get language preferences by new users
    const newUserLanguages = await c.env.DB.prepare(`
      SELECT 
        up.language,
        COUNT(*) as new_users
      FROM user_preferences up
      JOIN users u ON up.user_id = u.id
      WHERE u.created_at >= datetime('now', '-${dayCount} days')
      GROUP BY up.language
      ORDER BY new_users DESC
    `).all();

    return c.json({
      success: true,
      data: {
        period_days: dayCount,
        language_distribution: languageStats.results,
        recent_language_switches: (recentSwitches as any)?.switch_count || 0,
        new_user_languages: newUserLanguages.results,
        available_languages: i18n.getAvailableLanguages()
      },
      message: 'Language statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting language stats:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get language stats'
    }, 500);
  }
});

export default i18nRoutes;