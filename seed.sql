-- Insert test session
INSERT OR IGNORE INTO sessions (id, user_id, persona) VALUES 
  ('demo-session-1', 'demo-user', 'caring_girlfriend');

-- Insert test messages
INSERT OR IGNORE INTO messages (session_id, content, role, message_type) VALUES 
  ('demo-session-1', 'Chào em! Hôm nay em thế nào?', 'user', 'text'),
  ('demo-session-1', 'Chào anh! Em khỏe lắm, cảm ơn anh đã hỏi! Hôm nay của anh thế nào rồi? ❤️', 'assistant', 'text');

-- Insert voice settings
INSERT OR IGNORE INTO voice_settings (session_id, voice_id, speaking_rate, language) VALUES
  ('demo-session-1', 'vi-VN-Neural2-A', 1.0, 'vi-VN');