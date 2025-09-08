-- Private Mode System: Privacy and stealth features (Simplified)
-- Migration: 0005_private_mode_system_simple.sql
-- Purpose: Add privacy controls, stealth mode, and discrete usage features

-- User privacy settings and stealth configurations
CREATE TABLE IF NOT EXISTS private_mode_settings (
  user_id TEXT PRIMARY KEY,
  privacy_level TEXT NOT NULL DEFAULT 'standard',
  stealth_enabled INTEGER DEFAULT 0,
  quick_exit_enabled INTEGER DEFAULT 1,
  passcode_protection INTEGER DEFAULT 0,
  passcode_hash TEXT,
  fake_app_mode TEXT DEFAULT 'calculator',
  decoy_last_used DATETIME,
  auto_clear_history INTEGER DEFAULT 0,
  clear_history_minutes INTEGER DEFAULT 30,
  hide_notifications INTEGER DEFAULT 0,
  incognito_mode INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Decoy app configurations and fake screens
CREATE TABLE IF NOT EXISTS decoy_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_type TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_description TEXT,
  app_icon_url TEXT,
  html_template TEXT NOT NULL,
  css_styles TEXT,
  js_functionality TEXT,
  entry_method TEXT,
  entry_trigger TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Privacy audit log for security tracking
CREATE TABLE IF NOT EXISTS privacy_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  risk_level TEXT DEFAULT 'low'
);

-- Temporary stealth sessions for enhanced privacy
CREATE TABLE IF NOT EXISTS stealth_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stealth_level TEXT NOT NULL,
  auto_destruct_minutes INTEGER DEFAULT 60,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  is_active INTEGER DEFAULT 1
);

-- Insert basic decoy app templates (simplified)
INSERT OR IGNORE INTO decoy_apps (app_type, app_name, app_description, html_template, css_styles, js_functionality, entry_method, entry_trigger) VALUES 
('calculator', 'Calculator', 'Simple calculator', 
 '<div class="calc">Calculator Placeholder</div>',
 '.calc { text-align: center; padding: 50px; }',
 'console.log("calculator loaded");',
 'tap_sequence', '123*'),
('notepad', 'Notes', 'Note app', 
 '<div class="notes">Notepad Placeholder</div>',
 '.notes { text-align: center; padding: 50px; }', 
 'console.log("notepad loaded");',
 'tap_sequence', 'new_button_5x');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_private_settings_user ON private_mode_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_user ON privacy_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_time ON privacy_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_stealth_sessions_user ON stealth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_stealth_sessions_active ON stealth_sessions(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_decoy_apps_active ON decoy_apps(is_active, app_type);