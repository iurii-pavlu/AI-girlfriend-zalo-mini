import enTranslations from '../locales/en.json';
import viTranslations from '../locales/vi.json';

export type SupportedLanguage = 'en' | 'vi';
export type TranslationKey = string;

interface Translations {
  [key: string]: any;
}

class I18nService {
  private currentLanguage: SupportedLanguage = 'vi'; // Default to Vietnamese
  private translations: Record<SupportedLanguage, Translations> = {
    en: enTranslations,
    vi: viTranslations
  };

  /**
   * Initialize i18n service with language detection
   */
  public init(): SupportedLanguage {
    // Try to detect language from various sources
    const detectedLang = this.detectLanguage();
    this.setLanguage(detectedLang);
    return detectedLang;
  }

  /**
   * Detect user's preferred language
   */
  private detectLanguage(): SupportedLanguage {
    // Priority order: localStorage -> URL param -> navigator -> default
    
    // 1. Check localStorage first (user preference)
    const storedLang = localStorage.getItem('ai-girlfriend-language');
    if (storedLang && this.isValidLanguage(storedLang)) {
      return storedLang as SupportedLanguage;
    }

    // 2. Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    if (urlLang && this.isValidLanguage(urlLang)) {
      return urlLang as SupportedLanguage;
    }

    // 3. Check browser language
    const browserLang = navigator.language || (navigator as any).userLanguage;
    if (browserLang) {
      // Check for Vietnamese variants
      if (browserLang.startsWith('vi') || browserLang.includes('VN')) {
        return 'vi';
      }
      // Check for English variants
      if (browserLang.startsWith('en')) {
        return 'en';
      }
    }

    // 4. Check user location (Vietnam = Vietnamese default)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone === 'Asia/Ho_Chi_Minh' || timezone === 'Asia/Saigon') {
      return 'vi';
    }

    // 5. Default to Vietnamese for Vietnamese market
    return 'vi';
  }

  /**
   * Check if language code is supported
   */
  private isValidLanguage(lang: string): boolean {
    return ['en', 'vi'].includes(lang);
  }

  /**
   * Set current language
   */
  public setLanguage(language: SupportedLanguage): void {
    if (!this.isValidLanguage(language)) {
      console.warn(`Unsupported language: ${language}, falling back to Vietnamese`);
      language = 'vi';
    }

    this.currentLanguage = language;
    
    // Persist to localStorage
    localStorage.setItem('ai-girlfriend-language', language);
    
    // Update HTML lang attribute
    document.documentElement.lang = language;
    
    // Emit custom event for UI updates
    window.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { language } 
    }));
  }

  /**
   * Get current language
   */
  public getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Translate a key to current language
   */
  public t(key: TranslationKey, params?: Record<string, string | number>): string {
    const translation = this.getNestedTranslation(key, this.currentLanguage);
    
    if (!translation) {
      // Fallback to English if Vietnamese translation missing
      if (this.currentLanguage !== 'en') {
        const fallback = this.getNestedTranslation(key, 'en');
        if (fallback) {
          console.warn(`Missing Vietnamese translation for: ${key}, using English fallback`);
          return this.interpolate(fallback, params);
        }
      }
      
      console.warn(`Missing translation for key: ${key}`);
      return key; // Return the key itself as fallback
    }

    return this.interpolate(translation, params);
  }

  /**
   * Get nested translation by dot notation key
   */
  private getNestedTranslation(key: string, language: SupportedLanguage): string | null {
    const keys = key.split('.');
    let current: any = this.translations[language];

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return null;
      }
    }

    return typeof current === 'string' ? current : null;
  }

  /**
   * Replace parameters in translation strings
   */
  private interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;

    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key]?.toString() ?? match;
    });
  }

  /**
   * Get all translations for current language
   */
  public getAllTranslations(): Translations {
    return this.translations[this.currentLanguage];
  }

  /**
   * Get available languages
   */
  public getAvailableLanguages(): { code: SupportedLanguage; name: string }[] {
    return [
      { code: 'vi', name: 'Tiếng Việt' },
      { code: 'en', name: 'English' }
    ];
  }

  /**
   * Format date/time according to current language
   */
  public formatDateTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
    const locale = this.currentLanguage === 'vi' ? 'vi-VN' : 'en-US';
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    return new Intl.DateTimeFormat(locale, { ...defaultOptions, ...options }).format(date);
  }

  /**
   * Format currency according to current language  
   */
  public formatCurrency(amount: number): string {
    if (this.currentLanguage === 'vi') {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0
      }).format(amount);
    } else {
      // Show VND for English users too since it's a Vietnamese app
      return `${amount.toLocaleString()}₫`;
    }
  }

  /**
   * Get text direction (for future RTL support)
   */
  public getTextDirection(): 'ltr' | 'rtl' {
    return 'ltr'; // Both Vietnamese and English are LTR
  }

  /**
   * Get timezone for current language/region
   */
  public getTimezone(): string {
    return this.currentLanguage === 'vi' ? 'Asia/Ho_Chi_Minh' : 'Asia/Ho_Chi_Minh'; // App is Vietnam-focused
  }
}

// Export singleton instance
export const i18n = new I18nService();

// Export helper function for use in templates
export const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
  return i18n.t(key, params);
};

// Initialize on import
if (typeof window !== 'undefined') {
  i18n.init();
}