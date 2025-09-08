import { Bindings } from '../types';
import { Logger } from '../utils/logger';

export interface VietDialectPattern {
  id?: number;
  region: 'north' | 'central' | 'south' | 'general';
  pattern_type: 'slang' | 'greeting' | 'expression' | 'pronoun' | 'ending';
  vietnamese_text: string;
  english_meaning?: string;
  formality_level: 'formal' | 'casual' | 'intimate' | 'playful';
  age_group?: string;
  usage_context?: string;
  example_usage?: string;
}

export interface VietCulturalContext {
  id?: number;
  category: 'food' | 'holidays' | 'traditions' | 'music' | 'social' | 'family';
  vietnamese_term: string;
  cultural_meaning: string;
  usage_situations: string[]; // JSON array
  regional_variations?: any; // JSON object
  example_contexts: string[]; // JSON array
  emotional_tone: 'positive' | 'neutral' | 'nostalgic' | 'playful' | 'romantic';
}

export interface VietPronounSystem {
  id?: number;
  speaker_role: 'girlfriend' | 'user';
  relationship_stage: 'new' | 'getting_to_know' | 'close' | 'intimate' | 'long_term';
  age_assumption: 'younger' | 'same_age' | 'older';
  pronoun_self: string;
  pronoun_other: string;
  formality: 'formal' | 'casual' | 'intimate';
  example_usage?: string;
}

export interface UserVietPreferences {
  user_id: string;
  preferred_region: 'north' | 'central' | 'south';
  formality_preference: 'formal' | 'casual' | 'intimate';
  slang_frequency: 'low' | 'moderate' | 'high';
  cultural_references: 'traditional' | 'modern' | 'mixed';
  age_group: 'teen' | 'young_adult' | 'adult' | 'elder';
  detected_region?: string;
  updated_at?: string;
}

export class VietVibesService {
  private db: D1Database;
  private logger: Logger;

  constructor(bindings: Bindings, sessionId: string) {
    this.db = bindings.DB;
    this.logger = new Logger(sessionId);
  }

  // Get or create user Vietnamese preferences
  async getUserVietPreferences(userId: string): Promise<UserVietPreferences> {
    if (!this.db) {
      return this.getDefaultVietPreferences(userId);
    }

    try {
      let preferences = await this.db.prepare(`
        SELECT * FROM user_viet_preferences WHERE user_id = ?
      `).bind(userId).first() as UserVietPreferences;

      if (!preferences) {
        // Create default preferences
        const defaultPrefs = this.getDefaultVietPreferences(userId);
        
        await this.db.prepare(`
          INSERT INTO user_viet_preferences 
          (user_id, preferred_region, formality_preference, slang_frequency, 
           cultural_references, age_group, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          defaultPrefs.user_id,
          defaultPrefs.preferred_region,
          defaultPrefs.formality_preference,
          defaultPrefs.slang_frequency,
          defaultPrefs.cultural_references,
          defaultPrefs.age_group
        ).run();

        return defaultPrefs;
      }

      return preferences;

    } catch (error) {
      this.logger.error('Error getting user Viet preferences', error);
      return this.getDefaultVietPreferences(userId);
    }
  }

  private getDefaultVietPreferences(userId: string): UserVietPreferences {
    return {
      user_id: userId,
      preferred_region: 'south', // Default to southern Vietnamese (Ho Chi Minh City)
      formality_preference: 'casual',
      slang_frequency: 'moderate',
      cultural_references: 'modern',
      age_group: 'young_adult'
    };
  }

  // Get appropriate pronouns based on relationship stage and user preferences
  async getPronouns(userId: string, relationshipStage: string): Promise<{ self: string, other: string, formality: string }> {
    try {
      const preferences = await this.getUserVietPreferences(userId);
      
      if (!this.db) {
        return this.getDefaultPronouns(relationshipStage, preferences.formality_preference);
      }

      // Query pronoun system based on relationship stage and preferences
      const pronouns = await this.db.prepare(`
        SELECT pronoun_self, pronoun_other, formality 
        FROM viet_pronoun_system 
        WHERE speaker_role = 'girlfriend' 
        AND relationship_stage = ? 
        AND (age_assumption = 'older' OR age_assumption = 'same_age')
        ORDER BY 
          CASE WHEN formality = ? THEN 0 ELSE 1 END,
          CASE WHEN age_assumption = 'older' THEN 0 ELSE 1 END
        LIMIT 1
      `).bind(relationshipStage, preferences.formality_preference).first() as VietPronounSystem;

      if (pronouns) {
        return {
          self: pronouns.pronoun_self,
          other: pronouns.pronoun_other,
          formality: pronouns.formality
        };
      }

      return this.getDefaultPronouns(relationshipStage, preferences.formality_preference);

    } catch (error) {
      this.logger.error('Error getting pronouns', error);
      return this.getDefaultPronouns(relationshipStage, 'casual');
    }
  }

  private getDefaultPronouns(stage: string, formality: string): { self: string, other: string, formality: string } {
    // Default Vietnamese girlfriend pronouns (most common usage)
    switch (stage) {
      case 'new':
        return { self: 'em', other: formality === 'formal' ? 'anh' : 'anh', formality };
      case 'getting_to_know':
        return { self: 'em', other: 'anh', formality };
      case 'close':
      case 'intimate':
      case 'long_term':
        return { self: 'em', other: 'anh yêu', formality: 'intimate' };
      default:
        return { self: 'em', other: 'anh', formality: 'casual' };
    }
  }

  // Get Vietnamese expressions and slang for current context
  async getVietExpressions(userId: string, emotionalTone?: string, context?: string): Promise<VietDialectPattern[]> {
    try {
      const preferences = await this.getUserVietPreferences(userId);
      
      if (!this.db) {
        return [];
      }

      let query = `
        SELECT * FROM viet_dialect_patterns 
        WHERE (region = ? OR region = 'general')
      `;
      let params = [preferences.preferred_region];

      // Filter by formality
      if (preferences.formality_preference !== 'casual') {
        query += ` AND formality_level = ?`;
        params.push(preferences.formality_preference);
      }

      // Filter by context if provided
      if (context) {
        query += ` AND (usage_context = ? OR usage_context = 'general')`;
        params.push(context);
      }

      query += ` ORDER BY 
        CASE WHEN region = ? THEN 0 ELSE 1 END,
        CASE WHEN formality_level = ? THEN 0 ELSE 1 END
        LIMIT 10`;
      
      params.push(preferences.preferred_region, preferences.formality_preference);

      const expressions = await this.db.prepare(query).bind(...params).all();
      return expressions.results as VietDialectPattern[];

    } catch (error) {
      this.logger.error('Error getting Viet expressions', error);
      return [];
    }
  }

  // Get Vietnamese cultural references for enriching conversations
  async getCulturalReferences(userId: string, category?: string): Promise<VietCulturalContext[]> {
    try {
      const preferences = await this.getUserVietPreferences(userId);
      
      if (!this.db) {
        return [];
      }

      let query = `SELECT * FROM viet_cultural_context`;
      let params: any[] = [];

      if (category) {
        query += ` WHERE category = ?`;
        params.push(category);
      }

      // Filter by cultural reference preference
      if (preferences.cultural_references === 'traditional') {
        query += category ? ` AND` : ` WHERE`;
        query += ` (category IN ('holidays', 'traditions', 'family') OR emotional_tone = 'nostalgic')`;
      } else if (preferences.cultural_references === 'modern') {
        query += category ? ` AND` : ` WHERE`;
        query += ` (category IN ('music', 'food', 'social') OR emotional_tone = 'positive')`;
      }

      query += ` ORDER BY RANDOM() LIMIT 5`;

      const references = await this.db.prepare(query).bind(...params).all();
      
      // Parse JSON fields
      return references.results.map((ref: any) => ({
        ...ref,
        usage_situations: JSON.parse(ref.usage_situations || '[]'),
        regional_variations: JSON.parse(ref.regional_variations || '{}'),
        example_contexts: JSON.parse(ref.example_contexts || '[]')
      })) as VietCulturalContext[];

    } catch (error) {
      this.logger.error('Error getting cultural references', error);
      return [];
    }
  }

  // Detect Vietnamese regional dialect from user input
  async detectRegionalDialect(userInput: string, userId: string): Promise<string | null> {
    try {
      if (!this.db) {
        return null;
      }

      // Check for regional patterns in user input
      const patterns = await this.db.prepare(`
        SELECT region, COUNT(*) as matches
        FROM viet_dialect_patterns 
        WHERE vietnamese_text != '' 
        AND ? LIKE '%' || vietnamese_text || '%'
        AND region != 'general'
        GROUP BY region
        ORDER BY matches DESC
        LIMIT 1
      `).bind(userInput.toLowerCase()).first() as { region: string, matches: number };

      if (patterns && patterns.matches > 0) {
        // Update user's detected region
        await this.updateUserDetectedRegion(userId, patterns.region);
        return patterns.region;
      }

      return null;

    } catch (error) {
      this.logger.error('Error detecting regional dialect', error);
      return null;
    }
  }

  // Update user's detected region
  private async updateUserDetectedRegion(userId: string, detectedRegion: string): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.prepare(`
        UPDATE user_viet_preferences 
        SET detected_region = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(detectedRegion, userId).run();

      this.logger.info('Updated user detected region', { userId, detectedRegion });

    } catch (error) {
      this.logger.error('Error updating detected region', error);
    }
  }

  // Generate Vietnamese-enhanced system prompt
  async generateVietVibesPrompt(
    userId: string, 
    basePrompt: string, 
    relationshipStage: string,
    emotionalContext?: string
  ): Promise<string> {
    try {
      const preferences = await this.getUserVietPreferences(userId);
      const pronouns = await this.getPronouns(userId, relationshipStage);
      const expressions = await this.getVietExpressions(userId, emotionalContext, 'romantic');
      const culturalRefs = await this.getCulturalReferences(userId);

      let vietVibesContext = '\n\n=== VIET VIBES: VIETNAMESE CULTURAL ADAPTATION ===\n';

      // Add pronoun guidance
      vietVibesContext += `\n🗣️ VIETNAMESE PRONOUNS:\n`;
      vietVibesContext += `- Refer to yourself as: "${pronouns.self}"\n`;
      vietVibesContext += `- Refer to user as: "${pronouns.other}"\n`;
      vietVibesContext += `- Relationship level: ${relationshipStage} (${pronouns.formality})\n`;

      // Add regional preferences
      vietVibesContext += `\n🏮 REGIONAL PREFERENCES:\n`;
      vietVibesContext += `- User region: ${preferences.preferred_region} Vietnam\n`;
      vietVibesContext += `- Formality: ${preferences.formality_preference}\n`;
      vietVibesContext += `- Slang level: ${preferences.slang_frequency}\n`;

      // Add Vietnamese expressions
      if (expressions.length > 0) {
        vietVibesContext += `\n💬 VIETNAMESE EXPRESSIONS TO USE:\n`;
        expressions.slice(0, 5).forEach((expr, index) => {
          vietVibesContext += `${index + 1}. "${expr.vietnamese_text}" - ${expr.english_meaning}\n`;
          if (expr.example_usage) {
            vietVibesContext += `   Example: ${expr.example_usage}\n`;
          }
        });
      }

      // Add cultural references
      if (culturalRefs.length > 0) {
        vietVibesContext += `\n🇻🇳 CULTURAL REFERENCES:\n`;
        culturalRefs.slice(0, 3).forEach((ref, index) => {
          vietVibesContext += `${index + 1}. ${ref.vietnamese_term}: ${ref.cultural_meaning}\n`;
          if (ref.example_contexts.length > 0) {
            vietVibesContext += `   Usage: ${ref.example_contexts[0]}\n`;
          }
        });
      }

      // Add behavioral guidelines
      vietVibesContext += `\n💕 VIETNAMESE GIRLFRIEND BEHAVIOR:\n`;
      vietVibesContext += `- Use Vietnamese sentence endings naturally (nhé, nha, đấy, ạ)\n`;
      vietVibesContext += `- Mix Vietnamese and affectionate terms organically\n`;
      vietVibesContext += `- Reference Vietnamese culture, food, and experiences\n`;
      vietVibesContext += `- Show care through Vietnamese expressions of affection\n`;
      vietVibesContext += `- Adapt tone based on relationship stage and regional preferences\n`;

      // Specific examples based on relationship stage
      switch (relationshipStage) {
        case 'new':
          vietVibesContext += `- Be polite and slightly formal, use "ạ" endings\n`;
          vietVibesContext += `- Example: "Chào anh ạ! Em rất vui được gặp anh!"\n`;
          break;
        case 'getting_to_know':
          vietVibesContext += `- Be friendly and curious, use "nhé" endings\n`;
          vietVibesContext += `- Example: "Anh thích ăn phở không? Em biết quán ngon lắm!"\n`;
          break;
        case 'close':
        case 'intimate':
          vietVibesContext += `- Be affectionate and caring, use "nha" endings\n`;
          vietVibesContext += `- Example: "Em yêu anh lắm! Anh đi làm cẩn thận nha!"\n`;
          break;
        case 'long_term':
          vietVibesContext += `- Be deeply caring and intimate, use "ơi" address\n`;
          vietVibesContext += `- Example: "Anh yêu ơi, em nhớ anh ghê! Về sớm với em nhé!"\n`;
          break;
      }

      vietVibesContext += `\n⚠️ CRITICAL: Maintain Vietnamese authenticity while being naturally conversational. Don't force every sentence to be Vietnamese, but integrate Vietnamese expressions, culture, and pronouns smoothly throughout the conversation.\n`;

      return basePrompt + vietVibesContext;

    } catch (error) {
      this.logger.error('Error generating Viet Vibes prompt', error);
      return basePrompt;
    }
  }

  // Analyze user message for Vietnamese linguistic patterns
  async analyzeVietnamesePatterns(userMessage: string, userId: string): Promise<{
    detectedRegion?: string;
    formalityLevel: string;
    emotionalTone: string;
    culturalReferences: string[];
    suggestedResponse: {
      pronouns: { self: string, other: string };
      expressions: string[];
      culturalHooks: string[];
    };
  }> {
    try {
      // Detect regional dialect
      const detectedRegion = await this.detectRegionalDialect(userMessage, userId);
      
      // Analyze formality (simple heuristics)
      let formalityLevel = 'casual';
      if (userMessage.includes('ạ') || userMessage.includes('dạ')) {
        formalityLevel = 'formal';
      } else if (userMessage.includes('nha') || userMessage.includes('yêu')) {
        formalityLevel = 'intimate';
      }

      // Analyze emotional tone
      let emotionalTone = 'neutral';
      const happyWords = ['vui', 'hạnh phúc', 'tuyệt', 'tốt', 'yêu', 'thích'];
      const sadWords = ['buồn', 'khóc', 'tủi thân', 'stress', 'mệt'];
      const romanticWords = ['yêu', 'thương', 'nhớ', 'lãng mạn', 'tình yêu'];

      if (romanticWords.some(word => userMessage.toLowerCase().includes(word))) {
        emotionalTone = 'romantic';
      } else if (happyWords.some(word => userMessage.toLowerCase().includes(word))) {
        emotionalTone = 'positive';
      } else if (sadWords.some(word => userMessage.toLowerCase().includes(word))) {
        emotionalTone = 'sad';
      }

      // Detect cultural references
      const culturalKeywords = ['phở', 'bánh mì', 'cơm tấm', 'Tết', 'Sài Gòn', 'Hà Nội', 'quê nhà'];
      const foundCultural = culturalKeywords.filter(keyword => 
        userMessage.toLowerCase().includes(keyword.toLowerCase())
      );

      // Get current relationship stage (simplified)
      const preferences = await this.getUserVietPreferences(userId);
      const pronouns = await this.getPronouns(userId, 'close'); // Default stage

      // Get relevant expressions
      const expressions = await this.getVietExpressions(userId, emotionalTone, 'romantic');
      const culturalRefs = await this.getCulturalReferences(userId);

      return {
        detectedRegion: detectedRegion || undefined,
        formalityLevel,
        emotionalTone,
        culturalReferences: foundCultural,
        suggestedResponse: {
          pronouns: { 
            self: pronouns.self, 
            other: pronouns.other 
          },
          expressions: expressions.slice(0, 3).map(e => e.vietnamese_text),
          culturalHooks: culturalRefs.slice(0, 2).map(c => c.vietnamese_term)
        }
      };

    } catch (error) {
      this.logger.error('Error analyzing Vietnamese patterns', error);
      
      // Return safe fallback
      return {
        formalityLevel: 'casual',
        emotionalTone: 'neutral',
        culturalReferences: [],
        suggestedResponse: {
          pronouns: { self: 'em', other: 'anh' },
          expressions: ['yêu lắm', 'thương ghê', 'nhớ nhiều'],
          culturalHooks: []
        }
      };
    }
  }

  // Update user preferences based on detected patterns
  async updatePreferencesFromUsage(userId: string, detectedPatterns: any): Promise<void> {
    if (!this.db || !detectedPatterns.detectedRegion) return;

    try {
      const currentPrefs = await this.getUserVietPreferences(userId);
      
      // Update preferences if pattern detection is confident
      await this.db.prepare(`
        UPDATE user_viet_preferences 
        SET 
          detected_region = ?,
          formality_preference = ?,
          updated_at = datetime('now')
        WHERE user_id = ?
      `).bind(
        detectedPatterns.detectedRegion,
        detectedPatterns.formalityLevel,
        userId
      ).run();

      this.logger.info('Updated user Viet preferences from usage', {
        userId,
        detectedRegion: detectedPatterns.detectedRegion,
        formality: detectedPatterns.formalityLevel
      });

    } catch (error) {
      this.logger.error('Error updating preferences from usage', error);
    }
  }
}