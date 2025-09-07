// Simple logger for Cloudflare Workers
export class Logger {
  private sessionId: string;
  
  constructor(sessionId: string = 'anonymous') {
    this.sessionId = sessionId;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${this.sessionId}] ${message}${logData}`;
  }

  info(message: string, data?: any): void {
    console.log(this.formatMessage('info', message, data));
  }

  error(message: string, error?: any): void {
    console.error(this.formatMessage('error', message, error));
  }

  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('warn', message, data));
  }

  debug(message: string, data?: any): void {
    console.debug(this.formatMessage('debug', message, data));
  }
}