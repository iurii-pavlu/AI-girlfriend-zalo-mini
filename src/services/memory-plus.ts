import { Bindings } from '../types';
import { Logger } from '../utils/logger';

export interface RelationshipMemory {
  id?: number;
  user_id: string;
  memory_type: 'personal' | 'preference' | 'event' | 'emotion' | 'milestone';
  content: string;
  importance_score: number; // 1-10
  emotional_tag?: string;
  created_at?: string;
  last_referenced?: string;
  reference_count?: number;
}

export interface UserProfile {
  user_id: string;
  personality_insights: any; // JSON object
  communication_style: string;
  interests: string[]; // JSON array
  relationship_goals: string;
  preferred_topics: string[]; // JSON array
  avoided_topics: string[]; // JSON array
  cultural_background: string;
  updated_at?: string;
}

export interface ConversationContext {
  id?: number;
  session_id: string;
  context_summary: string;
  key_topics: string[]; // JSON array
  emotional_tone: string;
  relationship_stage: 'new' | 'getting_to_know' | 'close' | 'intimate' | 'long_term';
  created_at?: string;
}

export class MemoryPlusService {
  private db: D1Database;
  private logger: Logger;

  constructor(bindings: Bindings, sessionId: string) {
    this.db = bindings.DB;
    this.logger = new Logger(sessionId);
  }

  // Store important memories from conversations
  async storeMemory(memory: RelationshipMemory): Promise<void> {
    if (!this.db) {
      this.logger.warn('Database not available for memory storage');
      return;
    }

    try {
      await this.db.prepare(`
        INSERT INTO relationship_memory 
        (user_id, memory_type, content, importance_score, emotional_tag, created_at, last_referenced)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        memory.user_id,
        memory.memory_type,
        memory.content,
        memory.importance_score,
        memory.emotional_tag || null
      ).run();

      this.logger.info('Memory stored', {
        userId: memory.user_id,
        type: memory.memory_type,
        importance: memory.importance_score
      });

    } catch (error) {
      this.logger.error('Error storing memory', error);
    }
  }

  // Retrieve relevant memories for conversation context
  async getRelevantMemories(userId: string, limit: number = 10): Promise<RelationshipMemory[]> {
    if (!this.db) {
      return [];
    }

    try {
      const memories = await this.db.prepare(`
        SELECT * FROM relationship_memory 
        WHERE user_id = ? 
        ORDER BY importance_score DESC, last_referenced DESC 
        LIMIT ?
      `).bind(userId, limit).all();

      // Update last_referenced for retrieved memories
      const memoryIds = memories.results.map(m => m.id);
      if (memoryIds.length > 0) {
        await this.db.prepare(`
          UPDATE relationship_memory 
          SET last_referenced = datetime('now'), reference_count = reference_count + 1
          WHERE id IN (${memoryIds.map(() => '?').join(',')})
        `).bind(...memoryIds).run();
      }

      return memories.results as RelationshipMemory[];

    } catch (error) {
      this.logger.error('Error retrieving memories', error);
      return [];
    }
  }

  // Extract and store memories from conversation
  async processConversationForMemories(userId: string, userMessage: string, aiResponse: string): Promise<void> {
    try {
      // Simple keyword-based memory extraction (in production, use NLP)
      const memoriesToStore: Partial<RelationshipMemory>[] = [];

      // Personal information detection
      const personalPatterns = [
        /tên tôi là (\w+)/i,
        /tôi làm (\w+)/i,
        /tôi ở ([^,\.]+)/i,
        /tôi thích ([^,\.]+)/i,
        /tôi không thích ([^,\.]+)/i,
        /tuổi tôi là (\d+)/i,
        /tôi sinh năm (\d{4})/i
      ];

      personalPatterns.forEach(pattern => {
        const match = userMessage.match(pattern);
        if (match) {
          memoriesToStore.push({
            user_id: userId,
            memory_type: 'personal',
            content: match[0],
            importance_score: 8
          });
        }
      });

      // Preference detection
      const preferencePatterns = [
        /tôi thích ([^,\.]+)/i,
        /tôi ghét ([^,\.]+)/i,
        /tôi yêu ([^,\.]+)/i,
        /sở thích của tôi là ([^,\.]+)/i
      ];

      preferencePatterns.forEach(pattern => {
        const match = userMessage.match(pattern);
        if (match) {
          memoriesToStore.push({
            user_id: userId,
            memory_type: 'preference',
            content: match[0],
            importance_score: 6
          });
        }
      });

      // Emotional state detection
      const emotionalPatterns = [
        { pattern: /buồn|khóc|tủi thân|stress/i, emotion: 'sad' },
        { pattern: /vui|hạnh phúc|phấn khích|tuyệt vời/i, emotion: 'happy' },
        { pattern: /yêu|thương|nhớ|lãng mạn/i, emotion: 'romantic' },
        { pattern: /giận|tức|bực mình|khó chịu/i, emotion: 'angry' },
        { pattern: /lo lắng|sợ|quan ngại/i, emotion: 'anxious' }
      ];

      emotionalPatterns.forEach(({ pattern, emotion }) => {
        if (pattern.test(userMessage)) {
          memoriesToStore.push({
            user_id: userId,
            memory_type: 'emotion',
            content: userMessage,
            importance_score: 7,
            emotional_tag: emotion
          });
        }
      });

      // Store all extracted memories
      for (const memory of memoriesToStore) {
        await this.storeMemory(memory as RelationshipMemory);
      }

    } catch (error) {
      this.logger.error('Error processing conversation for memories', error);
    }
  }

  // Get or create user profile
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    if (!this.db) {
      return null;
    }

    try {
      let profile = await this.db.prepare(`
        SELECT * FROM user_profile WHERE user_id = ?
      `).bind(userId).first() as UserProfile;

      if (!profile) {
        // Create default profile
        const defaultProfile: UserProfile = {
          user_id: userId,
          personality_insights: {},
          communication_style: 'casual',
          interests: [],
          relationship_goals: 'companionship',
          preferred_topics: ['daily_life', 'feelings', 'hobbies'],
          avoided_topics: [],
          cultural_background: 'vietnamese'
        };

        await this.db.prepare(`
          INSERT INTO user_profile 
          (user_id, personality_insights, communication_style, interests, 
           relationship_goals, preferred_topics, avoided_topics, cultural_background)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          defaultProfile.user_id,
          JSON.stringify(defaultProfile.personality_insights),
          defaultProfile.communication_style,
          JSON.stringify(defaultProfile.interests),
          defaultProfile.relationship_goals,
          JSON.stringify(defaultProfile.preferred_topics),
          JSON.stringify(defaultProfile.avoided_topics),
          defaultProfile.cultural_background
        ).run();

        return defaultProfile;
      }

      // Parse JSON fields
      profile.personality_insights = JSON.parse(profile.personality_insights as any);
      profile.interests = JSON.parse(profile.interests as any);
      profile.preferred_topics = JSON.parse(profile.preferred_topics as any);
      profile.avoided_topics = JSON.parse(profile.avoided_topics as any);

      return profile;

    } catch (error) {
      this.logger.error('Error getting user profile', error);
      return null;
    }
  }

  // Generate enhanced system prompt with memory context
  async generateMemoryEnhancedPrompt(userId: string, basePrompt: string): Promise<string> {
    try {
      const memories = await this.getRelevantMemories(userId, 8);
      const profile = await this.getUserProfile(userId);

      if (memories.length === 0 && !profile) {
        return basePrompt;
      }

      let memoryContext = '\n\nTHÔNG TIN CÁ NHÂN VÀ KÝ ỨC VỚI NGƯỜI DÙNG:\n';

      // Add profile information
      if (profile) {
        memoryContext += `- Phong cách giao tiếp: ${profile.communication_style}\n`;
        if (profile.interests.length > 0) {
          memoryContext += `- Sở thích: ${profile.interests.join(', ')}\n`;
        }
        if (profile.preferred_topics.length > 0) {
          memoryContext += `- Chủ đề yêu thích: ${profile.preferred_topics.join(', ')}\n`;
        }
        memoryContext += `- Mục tiêu mối quan hệ: ${profile.relationship_goals}\n`;
      }

      // Add important memories
      if (memories.length > 0) {
        memoryContext += '\nKÝ ỨC QUAN TRỌNG:\n';
        memories.forEach((memory, index) => {
          memoryContext += `${index + 1}. [${memory.memory_type}] ${memory.content}`;
          if (memory.emotional_tag) {
            memoryContext += ` (cảm xúc: ${memory.emotional_tag})`;
          }
          memoryContext += `\n`;
        });
      }

      memoryContext += '\nHÃY SỬ DỤNG NHỮNG THÔNG TIN NÀY ĐỂ TẠO RA CÂU TRẢ LỜI CÁ NHÂN HÓA VÀ CÓ CHIỀU SÂU HƠN.\n';

      return basePrompt + memoryContext;

    } catch (error) {
      this.logger.error('Error generating memory-enhanced prompt', error);
      return basePrompt;
    }
  }

  // Update relationship stage based on interaction history
  async updateRelationshipStage(sessionId: string, userId: string): Promise<string> {
    if (!this.db) {
      return 'new';
    }

    try {
      // Get message count for this user
      const messageCount = await this.db.prepare(`
        SELECT COUNT(*) as count FROM messages 
        WHERE session_id IN (
          SELECT id FROM sessions WHERE user_ref = ?
        )
      `).bind(userId).first() as { count: number };

      // Get memory count and types
      const memoryStats = await this.db.prepare(`
        SELECT memory_type, COUNT(*) as count 
        FROM relationship_memory 
        WHERE user_id = ? 
        GROUP BY memory_type
      `).bind(userId).all();

      let stage: string = 'new';
      const totalMessages = messageCount?.count || 0;
      const personalMemories = memoryStats.results.find(m => m.memory_type === 'personal')?.count || 0;
      const emotionalMemories = memoryStats.results.find(m => m.memory_type === 'emotion')?.count || 0;

      if (totalMessages > 100 && personalMemories > 5 && emotionalMemories > 3) {
        stage = 'long_term';
      } else if (totalMessages > 50 && personalMemories > 3) {
        stage = 'close';
      } else if (totalMessages > 20 && personalMemories > 1) {
        stage = 'getting_to_know';
      }

      // Store conversation context
      await this.db.prepare(`
        INSERT OR REPLACE INTO conversation_context 
        (session_id, context_summary, emotional_tone, relationship_stage)
        VALUES (?, ?, ?, ?)
      `).bind(
        sessionId,
        `Tổng ${totalMessages} tin nhắn, ${personalMemories} thông tin cá nhân, ${emotionalMemories} ký ức cảm xúc`,
        'neutral',
        stage
      ).run();

      return stage;

    } catch (error) {
      this.logger.error('Error updating relationship stage', error);
      return 'new';
    }
  }
}