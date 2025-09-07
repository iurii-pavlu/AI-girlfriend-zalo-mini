-- Chat sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  persona TEXT DEFAULT 'caring_girlfriend',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'voice')),
  audio_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Voice settings table
CREATE TABLE IF NOT EXISTS voice_settings (
  session_id TEXT PRIMARY KEY,
  voice_id TEXT DEFAULT 'en-US-Neural2-F',
  speaking_rate REAL DEFAULT 1.0,
  language TEXT DEFAULT 'en-US',
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Analytics table for usage tracking
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  event_data TEXT, -- JSON data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at);