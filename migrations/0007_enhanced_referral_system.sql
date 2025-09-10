-- Enhanced Referral System Migration
-- Adds features for 3-day rewards, referral limits, and abuse prevention

-- Add new columns to users table for enhanced referral tracking
ALTER TABLE users ADD COLUMN referrals_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referrals_successful INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_reward_days_earned INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_reward_days_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN max_referrals_allowed INTEGER DEFAULT 10;
ALTER TABLE users ADD COLUMN is_referral_eligible BOOLEAN DEFAULT TRUE;

-- Add new columns to referrals table for better tracking
ALTER TABLE referrals ADD COLUMN inviter_reward_days INTEGER DEFAULT 3;
ALTER TABLE referrals ADD COLUMN invitee_reward_days INTEGER DEFAULT 3;
ALTER TABLE referrals ADD COLUMN inviter_rewarded BOOLEAN DEFAULT FALSE;
ALTER TABLE referrals ADD COLUMN invitee_rewarded BOOLEAN DEFAULT FALSE;
ALTER TABLE referrals ADD COLUMN inviter_reward_applied_at DATETIME;
ALTER TABLE referrals ADD COLUMN invitee_reward_applied_at DATETIME;
ALTER TABLE referrals ADD COLUMN status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'invalid'));
ALTER TABLE referrals ADD COLUMN conversion_event TEXT; -- 'signup', 'first_payment', 'message_limit'

-- Create referral rewards tracking table
CREATE TABLE IF NOT EXISTS referral_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  referral_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('inviter', 'invitee')),
  reward_days INTEGER NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  source_event TEXT, -- 'signup', 'payment', 'milestone'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (referral_id) REFERENCES referrals(id),
  UNIQUE(user_id, referral_id, reward_type)
);

-- Create referral analytics table
CREATE TABLE IF NOT EXISTS referral_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  total_referrals INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0,
  total_inviter_rewards INTEGER DEFAULT 0,
  total_invitee_rewards INTEGER DEFAULT 0,
  conversion_rate REAL DEFAULT 0.0,
  average_time_to_conversion INTEGER DEFAULT 0, -- in minutes
  top_referrer_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(date)
);

-- Create referral abuse tracking table
CREATE TABLE IF NOT EXISTS referral_abuse_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  abuse_type TEXT NOT NULL, -- 'max_limit_exceeded', 'suspicious_pattern', 'invalid_referral'
  description TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  action_taken TEXT, -- 'blocked', 'warning', 'manual_review'
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Update existing referrals to new schema (set default 3-day rewards)
UPDATE referrals SET 
  inviter_reward_days = 3,
  invitee_reward_days = 3,
  status = 'completed'
WHERE reward_days > 0;

-- Update existing users referral counts
UPDATE users SET referrals_count = (
  SELECT COUNT(*) FROM referrals WHERE referrer_id = users.id
);

UPDATE users SET referrals_successful = (
  SELECT COUNT(*) FROM referrals WHERE referrer_id = users.id AND claimed = true
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_referrals_count ON users(referrals_count);
CREATE INDEX IF NOT EXISTS idx_users_referrals_successful ON users(referrals_successful);
CREATE INDEX IF NOT EXISTS idx_users_is_referral_eligible ON users(is_referral_eligible);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_conversion_event ON referrals(conversion_event);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_id ON referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_referral_analytics_date ON referral_analytics(date);
CREATE INDEX IF NOT EXISTS idx_referral_abuse_log_user_id ON referral_abuse_log(user_id);

-- Create triggers for automatic referral count updates
CREATE TRIGGER IF NOT EXISTS update_referral_counts_on_insert
  AFTER INSERT ON referrals
  FOR EACH ROW
  BEGIN
    UPDATE users SET 
      referrals_count = referrals_count + 1
    WHERE id = NEW.referrer_id;
  END;

CREATE TRIGGER IF NOT EXISTS update_referral_counts_on_update
  AFTER UPDATE ON referrals
  FOR EACH ROW
  WHEN OLD.claimed = false AND NEW.claimed = true
  BEGIN
    UPDATE users SET 
      referrals_successful = referrals_successful + 1
    WHERE id = NEW.referrer_id;
  END;

-- Create trigger for referral abuse detection
CREATE TRIGGER IF NOT EXISTS detect_referral_abuse
  AFTER INSERT ON referrals
  FOR EACH ROW
  WHEN (SELECT referrals_count FROM users WHERE id = NEW.referrer_id) > 10
  BEGIN
    INSERT INTO referral_abuse_log (user_id, abuse_type, description, action_taken)
    VALUES (
      NEW.referrer_id, 
      'max_limit_exceeded', 
      'User exceeded maximum allowed referrals (10)',
      'blocked'
    );
    
    UPDATE users SET is_referral_eligible = FALSE WHERE id = NEW.referrer_id;
  END;