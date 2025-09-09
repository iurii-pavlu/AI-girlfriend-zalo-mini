-- Zalo Mini App Integration Migration
-- Add Zalo-specific fields to users table

-- Add Zalo user information columns
ALTER TABLE users ADD COLUMN zalo_user_id TEXT;
ALTER TABLE users ADD COLUMN zalo_name TEXT;
ALTER TABLE users ADD COLUMN zalo_avatar TEXT;
ALTER TABLE users ADD COLUMN auth_source TEXT DEFAULT 'guest'; -- 'zalo' or 'guest'

-- Create indexes for Zalo user ID lookups
CREATE INDEX IF NOT EXISTS idx_users_zalo_user_id ON users(zalo_user_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_source ON users(auth_source);

-- Create Zalo payment tracking table
CREATE TABLE IF NOT EXISTS zalo_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zalo_user_id TEXT NOT NULL,
  internal_user_id TEXT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE,
  order_code TEXT,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
  payment_method TEXT,
  zalo_transaction_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  
  FOREIGN KEY (internal_user_id) REFERENCES users(id)
);

-- Create indexes for payment tracking
CREATE INDEX IF NOT EXISTS idx_zalo_payments_zalo_user_id ON zalo_payments(zalo_user_id);
CREATE INDEX IF NOT EXISTS idx_zalo_payments_internal_user_id ON zalo_payments(internal_user_id);
CREATE INDEX IF NOT EXISTS idx_zalo_payments_status ON zalo_payments(status);
CREATE INDEX IF NOT EXISTS idx_zalo_payments_created_at ON zalo_payments(created_at);

-- Create Zalo session tracking table
CREATE TABLE IF NOT EXISTS zalo_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL UNIQUE,
  zalo_user_id TEXT NOT NULL,
  internal_user_id TEXT NOT NULL,
  user_agent TEXT,
  referer TEXT,
  is_valid_context BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (internal_user_id) REFERENCES users(id)
);

-- Create indexes for session management
CREATE INDEX IF NOT EXISTS idx_zalo_sessions_session_token ON zalo_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_zalo_sessions_zalo_user_id ON zalo_sessions(zalo_user_id);
CREATE INDEX IF NOT EXISTS idx_zalo_sessions_expires_at ON zalo_sessions(expires_at);

-- Update existing users to mark as guest auth source
UPDATE users SET auth_source = 'guest' WHERE auth_source IS NULL;

-- Create trigger to update zalo_payments updated_at
CREATE TRIGGER IF NOT EXISTS update_zalo_payments_updated_at
  AFTER UPDATE ON zalo_payments
  FOR EACH ROW
  BEGIN
    UPDATE zalo_payments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

-- Create trigger to update zalo_sessions last_active
CREATE TRIGGER IF NOT EXISTS update_zalo_sessions_last_active
  AFTER UPDATE ON zalo_sessions
  FOR EACH ROW
  BEGIN
    UPDATE zalo_sessions SET last_active = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;