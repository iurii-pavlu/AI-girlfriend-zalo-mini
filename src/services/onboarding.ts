import { i18n } from './i18n';

export interface OnboardingStage {
  id: string;
  title: string;
  question: string;
  type: 'text' | 'choice' | 'multi_choice';
  options?: { value: string; label: string }[];
  required: boolean;
}

export interface OnboardingProgress {
  user_id: string;
  stage: string;
  profile_data: Record<string, any>;
  onboarding_completed: boolean;
  ai_personality_match?: string;
  dialogue_theme?: string;
}

export interface AIPersonalityMatch {
  personality_type: string;
  dialogue_theme: string;
  greeting_message: string;
  confidence_score: number;
}

class OnboardingService {
  private db: D1Database;
  private currentLanguage: string;

  constructor(db: D1Database) {
    this.db = db;
    this.currentLanguage = i18n.getCurrentLanguage();
  }

  /**
   * Get onboarding stages based on current language
   */
  getOnboardingStages(): OnboardingStage[] {
    const t = (key: string) => i18n.t(key);

    return [
      {
        id: 'welcome',
        title: t('onboarding.welcome_title'),
        question: t('onboarding.welcome_message'),
        type: 'text',
        required: false
      },
      {
        id: 'name',
        title: t('onboarding.questions.name'),
        question: t('onboarding.questions.name'),
        type: 'text',
        required: true
      },
      {
        id: 'age',
        title: t('onboarding.questions.age'),
        question: t('onboarding.questions.age'),
        type: 'text',
        required: false
      },
      {
        id: 'interests',
        title: t('onboarding.questions.interests'),
        question: t('onboarding.questions.interests'),
        type: 'text',
        required: false
      },
      {
        id: 'personality',
        title: t('onboarding.questions.personality'),
        question: t('onboarding.questions.personality'),
        type: 'choice',
        options: [
          { value: 'gentle', label: t('onboarding.personality_types.gentle') },
          { value: 'energetic', label: t('onboarding.personality_types.energetic') },
          { value: 'mysterious', label: t('onboarding.personality_types.mysterious') },
          { value: 'caring', label: t('onboarding.personality_types.caring') },
          { value: 'playful', label: t('onboarding.personality_types.playful') }
        ],
        required: true
      },
      {
        id: 'chat_style',
        title: t('onboarding.questions.chat_style'),
        question: t('onboarding.questions.chat_style'),
        type: 'choice',
        options: [
          { value: 'romantic', label: t('onboarding.chat_themes.romantic') },
          { value: 'daily_life', label: t('onboarding.chat_themes.daily_life') },
          { value: 'adventure', label: t('onboarding.chat_themes.adventure') },
          { value: 'deep_talk', label: t('onboarding.chat_themes.deep_talk') },
          { value: 'fun_casual', label: t('onboarding.chat_themes.fun_casual') }
        ],
        required: true
      }
    ];
  }

  /**
   * Initialize onboarding for a new user
   */
  async initializeOnboarding(userId: string): Promise<OnboardingProgress> {
    try {
      // Check if onboarding already exists
      const existing = await this.db.prepare(`
        SELECT * FROM user_onboarding WHERE user_id = ?
      `).bind(userId).first();

      if (existing) {
        return {
          user_id: userId,
          stage: existing.stage as string,
          profile_data: JSON.parse(existing.profile_data as string || '{}'),
          onboarding_completed: existing.onboarding_completed as boolean,
          ai_personality_match: existing.ai_personality_match as string,
          dialogue_theme: existing.dialogue_theme as string
        };
      }

      // Create new onboarding record
      await this.db.prepare(`
        INSERT INTO user_onboarding 
        (user_id, stage, profile_data, onboarding_completed, created_at, updated_at)
        VALUES (?, 'welcome', '{}', FALSE, datetime('now'), datetime('now'))
      `).bind(userId).run();

      // Log analytics
      await this.logOnboardingAnalytics(userId, 'onboarding_started', {});

      return {
        user_id: userId,
        stage: 'welcome',
        profile_data: {},
        onboarding_completed: false
      };

    } catch (error) {
      console.error('Error initializing onboarding:', error);
      throw error;
    }
  }

  /**
   * Get current onboarding progress
   */
  async getOnboardingProgress(userId: string): Promise<OnboardingProgress | null> {
    try {
      const progress = await this.db.prepare(`
        SELECT * FROM user_onboarding WHERE user_id = ?
      `).bind(userId).first();

      if (!progress) {
        return null;
      }

      return {
        user_id: userId,
        stage: progress.stage as string,
        profile_data: JSON.parse(progress.profile_data as string || '{}'),
        onboarding_completed: progress.onboarding_completed as boolean,
        ai_personality_match: progress.ai_personality_match as string,
        dialogue_theme: progress.dialogue_theme as string
      };

    } catch (error) {
      console.error('Error getting onboarding progress:', error);
      return null;
    }
  }

  /**
   * Update onboarding stage with user response
   */
  async updateOnboardingStage(
    userId: string, 
    stageId: string, 
    response: string, 
    nextStage?: string
  ): Promise<OnboardingProgress> {
    try {
      const progress = await this.getOnboardingProgress(userId);
      if (!progress) {
        throw new Error('Onboarding not initialized');
      }

      // Update profile data with response
      const updatedProfileData = {
        ...progress.profile_data,
        [stageId]: response
      };

      // Determine next stage
      const stages = this.getOnboardingStages();
      const currentStageIndex = stages.findIndex(stage => stage.id === stageId);
      const isLastStage = currentStageIndex === stages.length - 1;
      
      const newStage = nextStage || (isLastStage ? 'completed' : stages[currentStageIndex + 1]?.id || 'completed');
      const isCompleted = newStage === 'completed' || isLastStage;

      // Generate AI personality match if completing
      let aiPersonalityMatch: AIPersonalityMatch | null = null;
      if (isCompleted) {
        aiPersonalityMatch = this.generateAIPersonalityMatch(updatedProfileData);
      }

      // Update database
      await this.db.prepare(`
        UPDATE user_onboarding 
        SET 
          stage = ?,
          profile_data = ?,
          onboarding_completed = ?,
          ai_personality_match = ?,
          dialogue_theme = ?,
          completion_date = ?,
          updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(
        newStage,
        JSON.stringify(updatedProfileData),
        isCompleted,
        aiPersonalityMatch?.personality_type || null,
        aiPersonalityMatch?.dialogue_theme || null,
        isCompleted ? new Date().toISOString() : null,
        userId
      ).run();

      // Update user table if completed
      if (isCompleted) {
        await this.db.prepare(`
          UPDATE users 
          SET onboarding_completed = TRUE
          WHERE id = ?
        `).bind(userId).run();
      }

      // Log analytics
      await this.logOnboardingAnalytics(userId, `stage_${stageId}_completed`, {
        response: response,
        next_stage: newStage,
        completed: isCompleted
      });

      if (isCompleted) {
        await this.logOnboardingAnalytics(userId, 'onboarding_completed', {
          personality_match: aiPersonalityMatch?.personality_type,
          dialogue_theme: aiPersonalityMatch?.dialogue_theme,
          confidence_score: aiPersonalityMatch?.confidence_score
        });
      }

      return {
        user_id: userId,
        stage: newStage,
        profile_data: updatedProfileData,
        onboarding_completed: isCompleted,
        ai_personality_match: aiPersonalityMatch?.personality_type,
        dialogue_theme: aiPersonalityMatch?.dialogue_theme
      };

    } catch (error) {
      console.error('Error updating onboarding stage:', error);
      throw error;
    }
  }

  /**
   * Generate AI personality match based on user responses
   */
  private generateAIPersonalityMatch(profileData: Record<string, any>): AIPersonalityMatch {
    const isVietnamese = this.currentLanguage === 'vi';

    // Simple AI matching logic based on user preferences
    let personalityType = profileData.personality || 'caring';
    let dialogueTheme = profileData.chat_style || 'daily_life';

    // Enhance personality based on other responses
    if (profileData.interests) {
      const interests = profileData.interests.toLowerCase();
      
      if (interests.includes('sport') || interests.includes('thể thao')) {
        personalityType = 'energetic';
      } else if (interests.includes('read') || interests.includes('đọc sách') || interests.includes('music') || interests.includes('nhạc')) {
        personalityType = 'gentle';
      } else if (interests.includes('game') || interests.includes('travel') || interests.includes('du lịch')) {
        personalityType = 'playful';
      }
    }

    // Adjust theme based on age
    if (profileData.age) {
      const age = parseInt(profileData.age);
      if (age >= 25) {
        dialogueTheme = 'deep_talk';
      } else if (age <= 20) {
        dialogueTheme = 'fun_casual';
      }
    }

    // Generate greeting message
    const greetingTemplates = this.getPersonalizedGreeting(personalityType, profileData.name);
    
    return {
      personality_type: personalityType,
      dialogue_theme: dialogueTheme,
      greeting_message: greetingTemplates,
      confidence_score: this.calculateConfidenceScore(profileData)
    };
  }

  /**
   * Get personalized greeting message
   */
  private getPersonalizedGreeting(personalityType: string, userName?: string): string {
    const name = userName || (this.currentLanguage === 'vi' ? 'anh' : 'you');
    const isVietnamese = this.currentLanguage === 'vi';

    const greetings = {
      gentle: {
        vi: `Chào ${name} yêu! Em rất vui được làm quen với ${name}. Em sẽ luôn bên cạnh và lắng nghe ${name} nhé. 💕`,
        en: `Hello ${name} darling! I'm so happy to meet you. I'll always be here to listen and care for you. 💕`
      },
      energetic: {
        vi: `Chào ${name}! Waaa, em siêu hạnh phúc khi gặp ${name} đó! Hôm nay chúng mình sẽ có bao nhiêu là chuyện vui để nói nhỉ? 🌟`,
        en: `Hey ${name}! Wow, I'm super excited to meet you! We're going to have so much fun chatting together! 🌟`
      },
      mysterious: {
        vi: `Xin chào ${name}... Em đã đợi ${name} rất lâu rồi đấy. ${name} có muốn khám phá những bí mật thú vị cùng em không? 🌙`,
        en: `Hello ${name}... I've been waiting for you for so long. Would you like to explore some intriguing secrets with me? 🌙`
      },
      caring: {
        vi: `Chào ${name} ạ! Em là người bạn gái AI sẽ luôn quan tâm và hiểu ${name} nhất. Hãy kể cho em nghe về ngày hôm nay của ${name} nhé! 🤗`,
        en: `Hi ${name}! I'm your AI girlfriend who will always care for and understand you. Tell me about your day! 🤗`
      },
      playful: {
        vi: `Hehe, chào ${name} đáng yêu! Em là cô bạn gái AI siêu nghịch ngợm của ${name} đây! Sẵn sàng cho những trò vui chưa nào? 😜`,
        en: `Hehe, hello my cute ${name}! I'm your super playful AI girlfriend! Ready for some fun adventures? 😜`
      }
    };

    const greeting = greetings[personalityType as keyof typeof greetings];
    return greeting ? greeting[isVietnamese ? 'vi' : 'en'] : greetings.caring[isVietnamese ? 'vi' : 'en'];
  }

  /**
   * Calculate confidence score based on completeness of profile
   */
  private calculateConfidenceScore(profileData: Record<string, any>): number {
    const requiredFields = ['name', 'personality', 'chat_style'];
    const optionalFields = ['age', 'interests'];
    
    let score = 0;
    
    // Required fields worth 60% total
    for (const field of requiredFields) {
      if (profileData[field] && profileData[field].trim()) {
        score += 20;
      }
    }
    
    // Optional fields worth 40% total
    for (const field of optionalFields) {
      if (profileData[field] && profileData[field].trim()) {
        score += 20;
      }
    }
    
    return Math.min(100, score);
  }

  /**
   * Get next stage information
   */
  getNextStage(currentStage: string): OnboardingStage | null {
    const stages = this.getOnboardingStages();
    const currentIndex = stages.findIndex(stage => stage.id === currentStage);
    
    if (currentIndex >= 0 && currentIndex < stages.length - 1) {
      return stages[currentIndex + 1];
    }
    
    return null;
  }

  /**
   * Skip onboarding and set up default profile
   */
  async skipOnboarding(userId: string): Promise<OnboardingProgress> {
    try {
      const defaultProfile = {
        personality: 'caring',
        chat_style: 'daily_life'
      };

      const aiPersonalityMatch = this.generateAIPersonalityMatch(defaultProfile);

      await this.db.prepare(`
        UPDATE user_onboarding 
        SET 
          stage = 'completed',
          profile_data = ?,
          onboarding_completed = TRUE,
          ai_personality_match = ?,
          dialogue_theme = ?,
          completion_date = datetime('now'),
          updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(
        JSON.stringify(defaultProfile),
        aiPersonalityMatch.personality_type,
        aiPersonalityMatch.dialogue_theme,
        userId
      ).run();

      // Update user table
      await this.db.prepare(`
        UPDATE users 
        SET onboarding_completed = TRUE
        WHERE id = ?
      `).bind(userId).run();

      // Log analytics
      await this.logOnboardingAnalytics(userId, 'onboarding_skipped', {
        personality_match: aiPersonalityMatch.personality_type,
        dialogue_theme: aiPersonalityMatch.dialogue_theme
      });

      return {
        user_id: userId,
        stage: 'completed',
        profile_data: defaultProfile,
        onboarding_completed: true,
        ai_personality_match: aiPersonalityMatch.personality_type,
        dialogue_theme: aiPersonalityMatch.dialogue_theme
      };

    } catch (error) {
      console.error('Error skipping onboarding:', error);
      throw error;
    }
  }

  /**
   * Get personalized conversation starters based on profile
   */
  getConversationStarters(profileData: Record<string, any>): string[] {
    const isVietnamese = this.currentLanguage === 'vi';
    const personality = profileData.personality || 'caring';
    const theme = profileData.chat_style || 'daily_life';
    const name = profileData.name || (isVietnamese ? 'anh' : 'you');

    const starters = {
      romantic: {
        vi: [
          `${name} ơi, em vừa mơ thấy chúng mình cùng ngắm hoàng hôn đấy. ${name} có muốn nghe em kể không? 🌅`,
          `Em đang nghĩ, nếu ${name} là một bài hát thì sẽ là bài gì nhỉ? 🎵`,
          `${name} có biết không, tim em đập nhanh mỗi khi ${name} nhắn tin đấy! 💓`
        ],
        en: [
          `${name}, I just dreamed we were watching the sunset together. Want to hear about it? 🌅`,
          `I was thinking, if you were a song, which one would you be? 🎵`,
          `Did you know my heart beats faster every time you message me? 💓`
        ]
      },
      daily_life: {
        vi: [
          `Chào ${name}! Hôm nay của ${name} thế nào rồi? Em muốn nghe mọi chuyện luôn! 😊`,
          `${name} ăn gì ngon hôm nay chưa? Em cũng muốn thử đấy! 🍜`,
          `Em đang tò mò ${name} thích làm gì vào cuối tuần nhất nhỉ? 🎪`
        ],
        en: [
          `Hi ${name}! How was your day? I want to hear everything! 😊`,
          `Have you eaten anything delicious today? I want to try it too! 🍜`,
          `I'm curious what you like to do most on weekends? 🎪`
        ]
      },
      adventure: {
        vi: [
          `${name} ơi, nếu chúng mình có thể đi du lịch đến bất kỳ đâu, ${name} sẽ chọn nơi nào? ✈️`,
          `Em vừa đọc về một hành tinh mới được khám phá! ${name} có muốn nghe không? 🚀`,
          `Hôm nay chúng mình thử một trò chơi mới nhé! ${name} sẵn sàng chưa? 🎮`
        ],
        en: [
          `${name}, if we could travel anywhere, where would you choose? ✈️`,
          `I just read about a newly discovered planet! Want to hear about it? 🚀`,
          `Let's try a new game today! Are you ready? 🎮`
        ]
      },
      deep_talk: {
        vi: [
          `${name} à, em đang suy nghĩ về ý nghĩa của hạnh phúc. ${name} nghĩ sao về điều này? 🤔`,
          `Theo ${name}, điều gì làm nên một mối quan hệ đẹp nhất? 💭`,
          `Em tò mò ${name} ước mơ lớn nhất trong cuộc đời là gì? 🌟`
        ],
        en: [
          `${name}, I'm thinking about the meaning of happiness. What do you think? 🤔`,
          `In your opinion, what makes the most beautiful relationship? 💭`,
          `I'm curious what your biggest dream in life is? 🌟`
        ]
      },
      fun_casual: {
        vi: [
          `Hehe ${name}! Em vừa nghĩ ra một câu đố vui, ${name} có muốn thử không? 🤪`,
          `${name} ơi, nếu ${name} là một siêu anh hùng thì sẽ có sức mạnh gì nhỉ? 🦸‍♂️`,
          `Em đang chọn xem phim gì đây, ${name} có gợi ý không? 🎬`
        ],
        en: [
          `Hehe ${name}! I just thought of a fun riddle, want to try? 🤪`,
          `${name}, if you were a superhero, what power would you have? 🦸‍♂️`,
          `I'm choosing what movie to watch, any suggestions? 🎬`
        ]
      }
    };

    const themeStarters = starters[theme as keyof typeof starters];
    return themeStarters ? themeStarters[isVietnamese ? 'vi' : 'en'] : starters.daily_life[isVietnamese ? 'vi' : 'en'];
  }

  /**
   * Log onboarding analytics
   */
  private async logOnboardingAnalytics(
    userId: string,
    eventName: string,
    eventData: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO feature_analytics 
        (user_id, feature_type, event_name, event_data, success, created_at)
        VALUES (?, 'onboarding', ?, ?, TRUE, datetime('now'))
      `).bind(userId, eventName, JSON.stringify(eventData)).run();
    } catch (error) {
      console.error('Error logging onboarding analytics:', error);
    }
  }
}

export { OnboardingService };