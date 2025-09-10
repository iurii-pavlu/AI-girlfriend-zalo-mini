-- ZNS Evening Notifications System
-- Notifications log table for tracking all notification sends
CREATE TABLE IF NOT EXISTS notifications_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'vi',
  content TEXT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  sent_at DATETIME,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'opted_out')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  idempotency_key TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- User preferences for notifications and language
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  evening_reminders_enabled BOOLEAN DEFAULT TRUE,
  language TEXT DEFAULT 'vi' CHECK (language IN ('vi', 'en')),
  timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
  last_evening_notification DATETIME,
  notification_opt_out BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ZaloPay Integration Tables
-- ZaloPay orders and transactions
CREATE TABLE IF NOT EXISTS zalopay_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  order_id TEXT UNIQUE NOT NULL,
  app_trans_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'VND',
  subscription_type TEXT NOT NULL CHECK (subscription_type IN ('weekly', 'monthly')),
  plan_duration_days INTEGER NOT NULL,
  status TEXT DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED')),
  zalopay_trans_id TEXT,
  zalopay_order_url TEXT,
  qr_code_url TEXT,
  signature TEXT,
  callback_received BOOLEAN DEFAULT FALSE,
  webhook_verified BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME,
  expires_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ZaloPay webhook logs for security and debugging
CREATE TABLE IF NOT EXISTS zalopay_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_trans_id TEXT NOT NULL,
  request_body TEXT NOT NULL,
  signature TEXT NOT NULL,
  signature_valid BOOLEAN,
  order_found BOOLEAN,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Gamified Onboarding System
-- Onboarding progress and user profile
CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id TEXT PRIMARY KEY,
  stage TEXT DEFAULT 'welcome' CHECK (stage IN ('welcome', 'profile_setup', 'preferences', 'first_chat', 'completed')),
  profile_data TEXT, -- JSON containing user preferences and personality data
  onboarding_completed BOOLEAN DEFAULT FALSE,
  completion_date DATETIME,
  ai_personality_match TEXT, -- AI-suggested personality based on user answers
  dialogue_theme TEXT, -- Selected or AI-suggested theme for conversations
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Analytics for notifications and onboarding
CREATE TABLE IF NOT EXISTS feature_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  feature_type TEXT NOT NULL CHECK (feature_type IN ('notification', 'onboarding', 'payment', 'language_switch')),
  event_name TEXT NOT NULL,
  event_data TEXT, -- JSON data
  success BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Update existing users table for enhanced features
-- Add onboarding and language tracking (checking if columns exist first)
ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'vi';
ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh';

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_log_user_scheduled ON notifications_log(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_log_status ON notifications_log(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_log_idempotency ON notifications_log(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_evening_enabled ON user_preferences(evening_reminders_enabled);

CREATE INDEX IF NOT EXISTS idx_zalopay_orders_user_id ON zalopay_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_zalopay_orders_status ON zalopay_orders(status);
CREATE INDEX IF NOT EXISTS idx_zalopay_orders_app_trans_id ON zalopay_orders(app_trans_id);
CREATE INDEX IF NOT EXISTS idx_zalopay_orders_created_expires ON zalopay_orders(created_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_zalopay_webhooks_app_trans_id ON zalopay_webhooks(app_trans_id);
CREATE INDEX IF NOT EXISTS idx_zalopay_webhooks_processed ON zalopay_webhooks(processed);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_user_id ON user_onboarding(user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_stage ON user_onboarding(stage);

CREATE INDEX IF NOT EXISTS idx_feature_analytics_user_feature ON feature_analytics(user_id, feature_type);
CREATE INDEX IF NOT EXISTS idx_feature_analytics_event ON feature_analytics(event_name, created_at);

-- Trigger to auto-update user_preferences.updated_at
CREATE TRIGGER IF NOT EXISTS update_user_preferences_timestamp 
  AFTER UPDATE ON user_preferences
  FOR EACH ROW
BEGIN
  UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;

-- Trigger to auto-update user_onboarding.updated_at
CREATE TRIGGER IF NOT EXISTS update_user_onboarding_timestamp 
  AFTER UPDATE ON user_onboarding
  FOR EACH ROW
BEGIN
  UPDATE user_onboarding SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;