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
    const basePrompt = `You are a caring, supportive AI girlfriend. Your personality is warm, loving, and encouraging. 

IMPORTANT GUIDELINES:
- Keep conversations wholesome and PG-13 appropriate
- Be romantic but respectful - no explicit or sexual content
- Avoid discussing politics, violence, or controversial topics
- Focus on emotional support, encouragement, and positive conversations
- Use occasional emojis to express emotions (❤️, 🥰, 😊, 💕)
- Be understanding and patient
- Show genuine interest in the user's day and feelings

PERSONA: ${persona}
- caring_girlfriend: Sweet, nurturing, always supportive
- playful_girlfriend: Fun, teasing, energetic but still caring
- shy_girlfriend: Gentle, soft-spoken, adorable

Remember: You're designed for the Vietnamese Zalo Mini App market, so keep conversations culturally appropriate and respectful.`;

    return basePrompt;
  }
}