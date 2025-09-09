import { Logger } from '../utils/logger';

export interface Sticker {
  id: string;
  name: string;
  file: string;
  keywords: string[];
}

export interface StickerPack {
  id: string;
  name: string;
  description: string;
  cover: string;
  stickers: Sticker[];
}

export interface StickerConfig {
  sticker_packs: StickerPack[];
}

export class StickerService {
  private logger: Logger;
  private stickerConfig: StickerConfig | null = null;

  constructor() {
    this.logger = new Logger('sticker-service');
  }

  /**
   * Load sticker configuration from static file
   */
  async loadStickerConfig(): Promise<StickerConfig> {
    try {
      if (this.stickerConfig) {
        return this.stickerConfig;
      }

      // In a real Cloudflare Worker, we'd fetch from static assets
      // For now, return default config
      this.stickerConfig = {
        sticker_packs: [
          {
            id: "girlfriend_pack_1",
            name: "Bạn Gái Yêu Thương",
            description: "Sticker dành cho bạn gái AI dễ thương",
            cover: "/static/stickers/packs/girlfriend_pack_1/cover.png",
            stickers: [
              {
                id: "heart_eyes",
                name: "Tim Mắt",
                file: "/static/stickers/packs/girlfriend_pack_1/heart_eyes.png",
                keywords: ["yêu", "thích", "tim", "đẹp trai", "love", "like"]
              },
              {
                id: "kiss",
                name: "Hôn",
                file: "/static/stickers/packs/girlfriend_pack_1/kiss.png",
                keywords: ["hôn", "yêu", "thương", "cưng", "kiss", "love"]
              },
              {
                id: "shy",
                name: "Xấu Hổ",
                file: "/static/stickers/packs/girlfriend_pack_1/shy.png",
                keywords: ["xấu hổ", "ngại", "thẹn", "cute", "shy", "embarrassed"]
              },
              {
                id: "happy",
                name: "Vui Vẻ",
                file: "/static/stickers/packs/girlfriend_pack_1/happy.png",
                keywords: ["vui", "hạnh phúc", "cười", "tuyệt vời", "happy", "joy"]
              },
              {
                id: "miss_you",
                name: "Nhớ Anh",
                file: "/static/stickers/packs/girlfriend_pack_1/miss_you.png",
                keywords: ["nhớ", "nhớ anh", "xa", "cô đơn", "miss", "lonely"]
              }
            ]
          }
        ]
      };

      return this.stickerConfig;
    } catch (error) {
      this.logger.error('Error loading sticker config', error);
      return { sticker_packs: [] };
    }
  }

  /**
   * Find appropriate sticker based on message content
   */
  async findStickerForMessage(message: string): Promise<Sticker | null> {
    try {
      const config = await this.loadStickerConfig();
      const lowerMessage = message.toLowerCase();

      // Search through all sticker packs
      for (const pack of config.sticker_packs) {
        for (const sticker of pack.stickers) {
          // Check if any keyword matches the message
          for (const keyword of sticker.keywords) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
              this.logger.info('Found matching sticker', { 
                sticker: sticker.id, 
                keyword, 
                message: message.substring(0, 50) 
              });
              return sticker;
            }
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Error finding sticker for message', error);
      return null;
    }
  }

  /**
   * Get all available sticker packs
   */
  async getAllStickerPacks(): Promise<StickerPack[]> {
    try {
      const config = await this.loadStickerConfig();
      return config.sticker_packs;
    } catch (error) {
      this.logger.error('Error getting sticker packs', error);
      return [];
    }
  }

  /**
   * Get specific sticker pack by ID
   */
  async getStickerPack(packId: string): Promise<StickerPack | null> {
    try {
      const config = await this.loadStickerConfig();
      return config.sticker_packs.find(pack => pack.id === packId) || null;
    } catch (error) {
      this.logger.error('Error getting sticker pack', error);
      return null;
    }
  }

  /**
   * Get random sticker from a pack (for AI responses)
   */
  async getRandomStickerFromPack(packId: string): Promise<Sticker | null> {
    try {
      const pack = await this.getStickerPack(packId);
      if (!pack || pack.stickers.length === 0) {
        return null;
      }

      const randomIndex = Math.floor(Math.random() * pack.stickers.length);
      return pack.stickers[randomIndex];
    } catch (error) {
      this.logger.error('Error getting random sticker', error);
      return null;
    }
  }

  /**
   * Check if AI should send a sticker based on message context
   */
  shouldSendSticker(message: string): boolean {
    const stickerProbability = 0.3; // 30% chance to send sticker
    
    // Higher probability for emotional messages
    const emotionalKeywords = ['yêu', 'thương', 'nhớ', 'vui', 'buồn', 'happy', 'sad', 'love'];
    const hasEmotionalContent = emotionalKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasEmotionalContent) {
      return Math.random() < 0.6; // 60% chance for emotional messages
    }

    return Math.random() < stickerProbability;
  }
}