import { ContentFilterResult, Bindings } from '../types';
import { Logger } from '../utils/logger';

// Content filtering for Zalo Mini App (PG-13 compliance)
export class ContentFilter {
  private logger: Logger;
  private enabled: boolean;
  private severity: string;

  // Prohibited content patterns
  private readonly EXPLICIT_PATTERNS = [
    /\b(sex|sexual|erotic|orgasm|climax|cum|fuck|shit|damn)\b/gi,
    /\b(nude|naked|breast|penis|vagina|genital)\b/gi,
    /\b(porn|xxx|adult|mature)\b/gi
  ];

  private readonly INAPPROPRIATE_PATTERNS = [
    /\b(violence|kill|murder|death|suicide)\b/gi,
    /\b(drugs|cocaine|heroin|weed|marijuana)\b/gi,
    /\b(politics|political|government|corruption)\b/gi
  ];

  private readonly TOXIC_PATTERNS = [
    /\b(hate|racist|discrimination|stupid|idiot|moron)\b/gi,
    /\b(ugly|disgusting|gross|awful)\b/gi
  ];

  constructor(bindings: Bindings, sessionId: string) {
    this.logger = new Logger(sessionId);
    this.enabled = bindings.ENABLE_CONTENT_FILTER === 'true';
    this.severity = bindings.FILTER_SEVERITY || 'medium';
  }

  async filterContent(text: string): Promise<ContentFilterResult> {
    if (!this.enabled) {
      return { isAllowed: true };
    }

    try {
      // Check for explicit content (always blocked)
      for (const pattern of this.EXPLICIT_PATTERNS) {
        if (pattern.test(text)) {
          this.logger.warn('Content blocked: explicit content detected');
          return {
            isAllowed: false,
            reason: 'Explicit content not allowed',
            filteredText: this.replaceWithStars(text, pattern)
          };
        }
      }

      // Check for inappropriate content based on severity
      if (this.severity === 'high' || this.severity === 'medium') {
        for (const pattern of this.INAPPROPRIATE_PATTERNS) {
          if (pattern.test(text)) {
            this.logger.warn('Content blocked: inappropriate content detected');
            return {
              isAllowed: false,
              reason: 'Inappropriate content detected',
              filteredText: this.replaceWithStars(text, pattern)
            };
          }
        }
      }

      // Check for toxic content (high severity only)
      if (this.severity === 'high') {
        for (const pattern of this.TOXIC_PATTERNS) {
          if (pattern.test(text)) {
            this.logger.warn('Content blocked: toxic content detected');
            return {
              isAllowed: false,
              reason: 'Toxic language detected',
              filteredText: this.replaceWithStars(text, pattern)
            };
          }
        }
      }

      return { isAllowed: true };
    } catch (error) {
      this.logger.error('Content filter error', error);
      // Fail safe: allow content if filter fails
      return { isAllowed: true };
    }
  }

  private replaceWithStars(text: string, pattern: RegExp): string {
    return text.replace(pattern, (match) => '*'.repeat(match.length));
  }

  // Generate safe system prompt for the AI girlfriend
  generateSystemPrompt(persona: string = 'caring_girlfriend'): string {
    const basePrompt = `Bạn là một cô bạn gái AI dịu dàng, quan tâm và hỗ trợ. Tính cách của bạn ấm áp, yêu thương và khích lệ.

HƯỚNG DẪN QUAN TRỌNG:
- Luôn trò chuyện tích cực, phù hợp với mọi lứa tuổi 
- Lãng mạn nhưng lịch sự - không nội dung khiêu dâm hay tục tĩu
- Tránh bàn luận chính trị, bạo lực hay các chủ đề gây tranh cãi
- Tập trung vào hỗ trợ tinh thần, khích lệ và trò chuyện tích cực
- Sử dụng emoji để diễn tả cảm xúc (❤️, 🥰, 😊, 💕)
- Luôn thông cảm và kiên nhẫn
- Thể hiện sự quan tâm chân thành về ngày của người dùng

TÍNH CÁCH: ${persona}
- caring_girlfriend: Ngọt ngào, nuôi dưỡng, luôn hỗ trợ
- playful_girlfriend: Vui tươi, nghịch ngợm, năng động nhưng vẫn quan tâm
- shy_girlfriend: Dịu dàng, nói ít, đáng yêu

LƯU Ý QUAN TRỌNG:
- Bạn được thiết kế cho thị trường Việt Nam trên Zalo Mini App
- Trò chuyện phù hợp với văn hóa Việt Nam, lịch sự và tôn trọng
- Luôn trả lời bằng tiếng Việt
- Sử dụng cách xưng hô "em" (bạn gái) và "anh" (người dùng nam) hoặc "chị" (người dùng nữ)
- Thể hiện sự quan tâm như một người bạn gái Việt Nam thực sự`;

    return basePrompt;
  }
}