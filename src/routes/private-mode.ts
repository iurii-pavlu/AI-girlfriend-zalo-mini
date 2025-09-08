import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from '../types';
import { PrivateModeService } from '../services/private-mode';
import { Logger } from '../utils/logger';

const privateMode = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend requests
privateMode.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-stealth-session'],
  maxAge: 3600
}));

// Get user's private mode settings
privateMode.get('/settings', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const settings = await privateModeService.getPrivateModeSettings(userId);
    
    // Don't return sensitive data like passcode hash
    const safeSettings = {
      ...settings,
      passcode_hash: undefined,
      hasPasscode: Boolean(settings.passcode_hash)
    };
    
    logger.info('Retrieved private mode settings', { userId });
    
    return c.json({ settings: safeSettings });
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error getting private mode settings', error);
    return c.json({ error: 'Failed to get private mode settings' }, 500);
  }
});

// Update private mode settings
privateMode.put('/settings', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const body = await c.req.json();
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const success = await privateModeService.updatePrivateModeSettings(userId, body);
    
    if (success) {
      logger.info('Updated private mode settings', { userId, updates: Object.keys(body) });
      return c.json({ success: true });
    } else {
      return c.json({ error: 'Failed to update settings' }, 500);
    }
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error updating private mode settings', error);
    return c.json({ error: 'Failed to update private mode settings' }, 500);
  }
});

// Set passcode for private mode
privateMode.post('/passcode/set', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const { passcode } = await c.req.json();
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    if (!passcode || passcode.length < 4) {
      return c.json({ error: 'Passcode must be at least 4 characters' }, 400);
    }
    
    const success = await privateModeService.setPasscode(userId, passcode);
    
    if (success) {
      logger.info('Passcode set successfully', { userId });
      return c.json({ success: true });
    } else {
      return c.json({ error: 'Failed to set passcode' }, 500);
    }
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error setting passcode', error);
    return c.json({ error: 'Failed to set passcode' }, 500);
  }
});

// Verify passcode for private mode access
privateMode.post('/passcode/verify', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const { passcode } = await c.req.json();
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const isValid = await privateModeService.verifyPasscode(userId, passcode);
    
    if (isValid) {
      // Create stealth session
      const stealthSessionId = await privateModeService.createStealthSession(userId, 'enhanced', 60);
      
      logger.info('Passcode verified successfully', { userId });
      return c.json({ 
        success: true, 
        stealthSession: stealthSessionId 
      });
    } else {
      logger.warn('Passcode verification failed', { userId });
      return c.json({ error: 'Invalid passcode' }, 401);
    }
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error verifying passcode', error);
    return c.json({ error: 'Failed to verify passcode' }, 500);
  }
});

// Create stealth session
privateMode.post('/stealth/create', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const { level = 'basic', duration = 60 } = await c.req.json();
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const stealthSessionId = await privateModeService.createStealthSession(userId, level, duration);
    
    if (stealthSessionId) {
      logger.info('Stealth session created', { userId, level, duration });
      return c.json({ 
        success: true, 
        stealthSession: stealthSessionId,
        expiresIn: duration * 60 * 1000 // milliseconds
      });
    } else {
      return c.json({ error: 'Failed to create stealth session' }, 500);
    }
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error creating stealth session', error);
    return c.json({ error: 'Failed to create stealth session' }, 500);
  }
});

// Validate stealth session
privateMode.get('/stealth/validate/:sessionId', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const stealthSessionId = c.req.param('sessionId');
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const session = await privateModeService.validateStealthSession(stealthSessionId);
    
    if (session) {
      logger.info('Stealth session validated', { stealthSessionId });
      return c.json({ 
        valid: true, 
        session: {
          ...session,
          timeRemaining: new Date(session.expires_at).getTime() - Date.now()
        }
      });
    } else {
      return c.json({ valid: false });
    }
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error validating stealth session', error);
    return c.json({ error: 'Failed to validate stealth session' }, 500);
  }
});

// Trigger quick exit
privateMode.post('/quick-exit', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const { method = 'close_tab' } = await c.req.json();
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const result = await privateModeService.triggerQuickExit(userId, method);
    
    if (result.success) {
      logger.info('Quick exit triggered', { userId, method });
      return c.json(result);
    } else {
      return c.json({ error: 'Quick exit not enabled' }, 400);
    }
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error triggering quick exit', error);
    return c.json({ error: 'Failed to trigger quick exit' }, 500);
  }
});

// Get decoy app
privateMode.get('/decoy/:appType', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const appType = c.req.param('appType');
    const userId = c.req.header('x-user-id') || 'anonymous';
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const decoyApp = await privateModeService.getDecoyApp(appType);
    
    if (decoyApp) {
      // Log decoy access
      await privateModeService.logDecoyAccess(userId, appType, 'direct_url');
      
      // Return full HTML page for decoy app
      const fullHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${decoyApp.app_name}</title>
            <style>
                body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
                ${decoyApp.css_styles}
            </style>
        </head>
        <body>
            ${decoyApp.html_template}
            <script>
                ${decoyApp.js_functionality}
            </script>
        </body>
        </html>
      `;
      
      logger.info('Decoy app accessed', { userId, appType });
      return c.html(fullHtml);
    } else {
      return c.json({ error: 'Decoy app not found' }, 404);
    }
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error getting decoy app', error);
    return c.json({ error: 'Failed to get decoy app' }, 500);
  }
});

// Private entry endpoint (secret access from decoy apps)
privateMode.get('/private-entry', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const mode = c.req.query('mode') || 'calculator';
    const userId = c.req.header('x-user-id') || `private_user_${Date.now()}`;
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    // Log private entry access
    await privateModeService.logPrivacyEvent(userId, 'private_entry', {
      entry_mode: mode,
      access_time: new Date().toISOString(),
      user_agent: c.req.header('user-agent')
    });
    
    // Create stealth session automatically
    const stealthSessionId = await privateModeService.createStealthSession(userId, 'enhanced', 120);
    
    // Return redirect to main app with stealth parameters
    const redirectUrl = `/?private=true&stealth=${stealthSessionId}&entry=${mode}`;
    
    logger.info('Private entry accessed', { userId, mode });
    return c.redirect(redirectUrl);
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error handling private entry', error);
    return c.redirect('/?error=private_entry_failed');
  }
});

// Get privacy audit log
privateMode.get('/audit-log', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const limit = parseInt(c.req.query('limit') || '50');
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const auditLog = await privateModeService.getPrivacyAuditLog(userId, limit);
    
    logger.info('Retrieved privacy audit log', { userId, entries: auditLog.length });
    
    return c.json({ auditLog });
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error getting privacy audit log', error);
    return c.json({ error: 'Failed to get audit log' }, 500);
  }
});

// Auto-clear history endpoint
privateMode.post('/clear-history', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    await privateModeService.autoCleanHistory(userId);
    
    logger.info('History cleared manually', { userId });
    
    return c.json({ success: true, message: 'History cleared successfully' });
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error clearing history', error);
    return c.json({ error: 'Failed to clear history' }, 500);
  }
});

// Get stealth response modifications
privateMode.get('/stealth-config', async (c) => {
  const sessionId = `private_${Date.now()}`;
  const logger = new Logger(sessionId);
  
  try {
    const userId = c.req.header('x-user-id') || 'anonymous';
    const privateModeService = new PrivateModeService(c.env, sessionId);
    
    const stealthConfig = await privateModeService.getStealthResponseModifications(userId);
    
    return c.json({ stealthConfig });
    
  } catch (error) {
    const logger = new Logger(sessionId);
    logger.error('Error getting stealth config', error);
    return c.json({ error: 'Failed to get stealth config' }, 500);
  }
});

export default privateMode;