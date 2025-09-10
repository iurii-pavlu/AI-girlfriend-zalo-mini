// I18n Service Unit Tests
import { describe, test, expect, beforeEach } from 'vitest';
import { I18nService } from '../../../src/services/i18n';

describe('I18nService', () => {
  let i18nService;

  beforeEach(() => {
    // Mock localStorage for tests
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };

    // Mock navigator for language detection
    global.navigator = {
      language: 'en-US',
      userLanguage: 'en-US',
    };

    // Mock document for HTML lang attribute
    global.document = {
      documentElement: { lang: 'en' },
    };

    // Mock window for custom events
    global.window = {
      dispatchEvent: vi.fn(),
    };

    i18nService = new I18nService();
  });

  describe('Language Detection', () => {
    test('should detect Vietnamese from browser language', () => {
      global.navigator.language = 'vi-VN';
      
      const detectedLang = i18nService.detectLanguage();
      
      expect(detectedLang).toBe('vi');
    });

    test('should detect English from browser language', () => {
      global.navigator.language = 'en-US';
      
      const detectedLang = i18nService.detectLanguage();
      
      expect(detectedLang).toBe('en');
    });

    test('should fallback to Vietnamese as default', () => {
      global.navigator.language = 'fr-FR';
      
      const detectedLang = i18nService.detectLanguage();
      
      expect(detectedLang).toBe('vi');
    });

    test('should use localStorage preference over browser language', () => {
      global.localStorage.getItem.mockReturnValue('en');
      global.navigator.language = 'vi-VN';
      
      const detectedLang = i18nService.detectLanguage();
      
      expect(detectedLang).toBe('en');
    });

    test('should detect Vietnamese from timezone', () => {
      global.Intl = {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'Asia/Ho_Chi_Minh' })
        })
      };
      global.navigator.language = 'en-US';
      
      const detectedLang = i18nService.detectLanguage();
      
      expect(detectedLang).toBe('vi');
    });
  });

  describe('Language Setting', () => {
    test('should set language and update localStorage', () => {
      i18nService.setLanguage('en');
      
      expect(i18nService.getCurrentLanguage()).toBe('en');
      expect(localStorage.setItem).toHaveBeenCalledWith('ai-girlfriend-language', 'en');
      expect(document.documentElement.lang).toBe('en');
    });

    test('should emit language change event', () => {
      i18nService.setLanguage('vi');
      
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'languageChanged',
          detail: { language: 'vi' }
        })
      );
    });

    test('should fallback to Vietnamese for invalid language', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      i18nService.setLanguage('invalid');
      
      expect(i18nService.getCurrentLanguage()).toBe('vi');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Unsupported language: invalid, falling back to Vietnamese'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Translation', () => {
    beforeEach(() => {
      // Mock translations
      i18nService.translations = {
        en: {
          hello: 'Hello',
          greeting: 'Hello, {name}!',
          nested: {
            message: 'Nested message'
          }
        },
        vi: {
          hello: 'Xin chào',
          greeting: 'Xin chào, {name}!',
          nested: {
            message: 'Tin nhắn lồng'
          }
        }
      };
    });

    test('should translate simple key', () => {
      i18nService.setLanguage('en');
      
      const translation = i18nService.t('hello');
      
      expect(translation).toBe('Hello');
    });

    test('should translate nested key', () => {
      i18nService.setLanguage('vi');
      
      const translation = i18nService.t('nested.message');
      
      expect(translation).toBe('Tin nhắn lồng');
    });

    test('should interpolate parameters', () => {
      i18nService.setLanguage('en');
      
      const translation = i18nService.t('greeting', { name: 'John' });
      
      expect(translation).toBe('Hello, John!');
    });

    test('should fallback to English if Vietnamese translation missing', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      i18nService.setLanguage('vi');
      delete i18nService.translations.vi.hello;
      
      const translation = i18nService.t('hello');
      
      expect(translation).toBe('Hello');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Missing Vietnamese translation for: hello, using English fallback'
      );
      
      consoleSpy.mockRestore();
    });

    test('should return key if translation not found', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      i18nService.setLanguage('en');
      
      const translation = i18nService.t('nonexistent.key');
      
      expect(translation).toBe('nonexistent.key');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Missing translation for key: nonexistent.key'
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle multiple parameter interpolation', () => {
      i18nService.translations.en.multiParam = 'Hello {name}, you have {count} messages';
      i18nService.setLanguage('en');
      
      const translation = i18nService.t('multiParam', { name: 'Alice', count: 5 });
      
      expect(translation).toBe('Hello Alice, you have 5 messages');
    });

    test('should leave unreplaced parameters intact', () => {
      i18nService.setLanguage('en');
      
      const translation = i18nService.t('greeting', { wrongParam: 'value' });
      
      expect(translation).toBe('Hello, {name}!');
    });
  });

  describe('Date and Currency Formatting', () => {
    test('should format date for Vietnamese locale', () => {
      i18nService.setLanguage('vi');
      const date = new Date('2024-01-15T14:30:00Z');
      
      const formatted = i18nService.formatDateTime(date);
      
      expect(formatted).toMatch(/tháng 1/); // Vietnamese month format
    });

    test('should format date for English locale', () => {
      i18nService.setLanguage('en');
      const date = new Date('2024-01-15T14:30:00Z');
      
      const formatted = i18nService.formatDateTime(date);
      
      expect(formatted).toMatch(/January/); // English month format
    });

    test('should format currency for Vietnamese locale', () => {
      i18nService.setLanguage('vi');
      
      const formatted = i18nService.formatCurrency(149000);
      
      expect(formatted).toMatch(/149.000/); // Vietnamese number format
      expect(formatted).toMatch(/₫/); // VND symbol
    });

    test('should format currency for English locale', () => {
      i18nService.setLanguage('en');
      
      const formatted = i18nService.formatCurrency(149000);
      
      expect(formatted).toBe('149,000₫');
    });
  });

  describe('Available Languages', () => {
    test('should return available languages list', () => {
      const languages = i18nService.getAvailableLanguages();
      
      expect(languages).toEqual([
        { code: 'vi', name: 'Tiếng Việt' },
        { code: 'en', name: 'English' }
      ]);
    });
  });

  describe('Text Direction and Timezone', () => {
    test('should return LTR text direction for all supported languages', () => {
      expect(i18nService.getTextDirection()).toBe('ltr');
    });

    test('should return Vietnam timezone for all languages', () => {
      expect(i18nService.getTimezone()).toBe('Asia/Ho_Chi_Minh');
    });
  });

  describe('Translation Data Access', () => {
    test('should return all translations for current language', () => {
      i18nService.translations = {
        en: { test: 'value' },
        vi: { test: 'giá trị' }
      };
      
      i18nService.setLanguage('vi');
      
      const translations = i18nService.getAllTranslations();
      
      expect(translations).toEqual({ test: 'giá trị' });
    });
  });
});