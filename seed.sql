-- Insert test session
INSERT OR IGNORE INTO sessions (id, user_id, persona) VALUES 
  ('demo-session-1', 'demo-user', 'caring_girlfriend');

-- Insert test messages
INSERT OR IGNORE INTO messages (session_id, content, role, message_type) VALUES 
  ('demo-session-1', 'Hello! How are you today?', 'user', 'text'),
  ('demo-session-1', 'Hi there! I''m doing great, thank you for asking! How has your day been so far? ❤️', 'assistant', 'text');

-- Insert voice settings
INSERT OR IGNORE INTO voice_settings (session_id, voice_id, speaking_rate, language) VALUES
  ('demo-session-1', 'en-US-Neural2-F', 1.0, 'en-US');