-- Viet Vibes System: Vietnamese dialect and cultural adaptation
-- Migration: 0004_viet_vibes_system.sql
-- Purpose: Add Vietnamese linguistic and cultural intelligence

-- Vietnamese dialect patterns and expressions
CREATE TABLE IF NOT EXISTS viet_dialect_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL, -- north, central, south, general
  pattern_type TEXT NOT NULL, -- slang, greeting, expression, pronoun, ending
  vietnamese_text TEXT NOT NULL,
  english_meaning TEXT,
  formality_level TEXT NOT NULL, -- formal, casual, intimate, playful
  age_group TEXT, -- teen, young_adult, adult, elder
  usage_context TEXT, -- romantic, friendly, family, professional
  example_usage TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vietnamese cultural references and context
CREATE TABLE IF NOT EXISTS viet_cultural_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, -- food, holidays, traditions, music, social, family
  vietnamese_term TEXT NOT NULL,
  cultural_meaning TEXT NOT NULL,
  usage_situations TEXT, -- JSON array of when to use
  regional_variations TEXT, -- JSON object with regional differences
  example_contexts TEXT, -- JSON array of example uses
  emotional_tone TEXT, -- positive, neutral, nostalgic, playful, romantic
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vietnamese pronoun relationships
CREATE TABLE IF NOT EXISTS viet_pronoun_system (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  speaker_role TEXT NOT NULL, -- girlfriend, user
  relationship_stage TEXT NOT NULL, -- new, getting_to_know, close, intimate, long_term
  age_assumption TEXT NOT NULL, -- younger, same_age, older
  pronoun_self TEXT NOT NULL, -- em, anh, chị, etc.
  pronoun_other TEXT NOT NULL, -- anh, em, chị, etc.
  formality TEXT NOT NULL, -- formal, casual, intimate
  example_usage TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Vietnamese preferences
CREATE TABLE IF NOT EXISTS user_viet_preferences (
  user_id TEXT PRIMARY KEY,
  preferred_region TEXT DEFAULT 'south', -- north, central, south
  formality_preference TEXT DEFAULT 'casual', -- formal, casual, intimate
  slang_frequency TEXT DEFAULT 'moderate', -- low, moderate, high
  cultural_references TEXT DEFAULT 'modern', -- traditional, modern, mixed
  age_group TEXT DEFAULT 'young_adult',
  detected_region TEXT, -- auto-detected from speech patterns
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default Vietnamese dialect patterns
INSERT OR IGNORE INTO viet_dialect_patterns (region, pattern_type, vietnamese_text, english_meaning, formality_level, usage_context, example_usage) VALUES

-- Southern Vietnamese slang and expressions
('south', 'slang', 'xin chào', 'hello', 'formal', 'general', 'Xin chào anh! Em khỏe không?'),
('south', 'slang', 'chào bạn', 'hi friend', 'casual', 'friendly', 'Chào bạn! Hôm nay thế nào?'),
('south', 'slang', 'alo', 'hello (phone)', 'casual', 'friendly', 'Alo anh! Em đang làm gì đấy?'),
('south', 'expression', 'thương quá', 'love so much', 'intimate', 'romantic', 'Em thương anh quá!'),
('south', 'expression', 'yêu lắm', 'love a lot', 'intimate', 'romantic', 'Em yêu anh lắm!'),
('south', 'expression', 'nhớ ghê', 'miss terribly', 'casual', 'romantic', 'Em nhớ anh ghê!'),
('south', 'ending', 'nhé', 'softening particle', 'casual', 'general', 'Anh đi cẩn thận nhé!'),
('south', 'ending', 'nha', 'softening particle', 'intimate', 'romantic', 'Em yêu anh nha!'),
('south', 'ending', 'ha', 'questioning particle', 'casual', 'general', 'Anh có khỏe không ha?'),

-- Northern Vietnamese patterns
('north', 'slang', 'chào nhé', 'hello there', 'casual', 'friendly', 'Chào anh nhé!'),
('north', 'expression', 'yêu lắm luôn', 'love very much', 'intimate', 'romantic', 'Em yêu anh lắm luôn!'),
('north', 'ending', 'đấy', 'emphasis particle', 'casual', 'general', 'Anh trai đẹp quá đấy!'),
('north', 'ending', 'ạ', 'polite particle', 'formal', 'respectful', 'Dạ em hiểu ạ!'),

-- Central Vietnamese patterns  
('central', 'expression', 'mến ghê', 'adore so much', 'intimate', 'romantic', 'Em mến anh ghê!'),
('central', 'slang', 'chi ơi', 'dear sister', 'casual', 'friendly', 'Chi ơi, em đói rồi!'),

-- General Vietnamese patterns
('general', 'greeting', 'chào anh', 'hello brother', 'casual', 'romantic', 'Chào anh yêu!'),
('general', 'greeting', 'chào em', 'hello little one', 'casual', 'romantic', 'Chào em xinh!'),
('general', 'expression', 'buồn quá', 'so sad', 'casual', 'emotional', 'Em buồn quá anh ơi!'),
('general', 'expression', 'vui ghê', 'so happy', 'casual', 'emotional', 'Em vui ghê anh ạ!'),
('general', 'expression', 'cảm ơn nhiều', 'thank you much', 'formal', 'grateful', 'Em cảm ơn anh nhiều!'),
('general', 'expression', 'cảm ơn nha', 'thank you sweetly', 'intimate', 'grateful', 'Cảm ơn anh nha!');

-- Insert Vietnamese cultural context
INSERT OR IGNORE INTO viet_cultural_context (category, vietnamese_term, cultural_meaning, usage_situations, example_contexts, emotional_tone) VALUES

-- Food culture
('food', 'phở', 'Traditional Vietnamese noodle soup', '["comfort food", "homesickness", "morning meals", "street food"]', '["Sáng nay em ăn phở rồi", "Nhớ phở quê nhà", "Đi ăn phở không anh?"]', 'nostalgic'),
('food', 'bánh mì', 'Vietnamese sandwich', '["quick meal", "street food", "breakfast", "casual dining"]', '["Mua bánh mì cho anh nhé", "Sáng nay ăn bánh mì", "Bánh mì Sài Gòn ngon lắm"]', 'positive'),
('food', 'cơm tấm', 'Broken rice dish', '["southern cuisine", "comfort food", "dinner"]', '["Tối nay ăn cơm tấm", "Cơm tấm sườn nướng", "Nhớ cơm tấm quê nhà"]', 'positive'),
('food', 'chè', 'Vietnamese sweet dessert soup', '["dessert", "hot weather", "sweet treats"]', '["Thời tiết nóng, uống chè mát", "Chè đậu xanh ngon", "Đi ăn chè không em?"]', 'positive'),

-- Holidays and celebrations
('holidays', 'Tết', 'Vietnamese New Year', '["family time", "celebration", "tradition", "new beginnings"]', '["Tết này về quê", "Chúc mừng năm mới", "Tết đoàn viên gia đình"]', 'positive'),
('holidays', 'Trung Thu', 'Mid-Autumn Festival', '["childhood memories", "moon cakes", "family", "children"]', '["Trung Thu ăn bánh nướng", "Nhớ Trung Thu hồi nhỏ", "Đêm trăng đẹp"]', 'nostalgic'),
('holidays', 'Giỗ tổ Hùng Vương', 'Hung Kings Festival', '["national pride", "ancestry", "tradition"]', '["Ngày lễ tổ tiên", "Tưởng nhớ các vua", "Lễ hội dân tộc"]', 'respectful'),

-- Social and family
('social', 'anh/em', 'Brother/younger sibling pronouns', '["romantic relationships", "age respect", "intimacy levels"]', '["Anh yêu em", "Em nghĩ gì", "Anh chị em trong nhà"]', 'intimate'),
('social', 'gia đình', 'Family', '["family values", "support system", "traditions"]', '["Gia đình là số một", "Về nhà thăm gia đình", "Gia đình yêu thương"]', 'positive'),
('social', 'bạn bè', 'Friends', '["friendship", "social circle", "support"]', '["Bạn bè thân thiết", "Đi chơi với bạn", "Kể cho bạn nghe"]', 'positive'),

-- Music and entertainment
('music', 'V-pop', 'Vietnamese pop music', '["modern culture", "youth", "entertainment"]', '["Nghe V-pop mới", "Ca sĩ Việt nổi tiếng", "Nhạc Việt hay"]', 'positive'),
('music', 'nhạc vàng', 'Golden oldies Vietnamese music', '["nostalgia", "parents generation", "classic"]', '["Bố mẹ thích nhạc vàng", "Nhạc xưa hay", "Kỷ niệm tuổi thơ"]', 'nostalgic');

-- Insert Vietnamese pronoun system
INSERT OR IGNORE INTO viet_pronoun_system (speaker_role, relationship_stage, age_assumption, pronoun_self, pronoun_other, formality, example_usage) VALUES

-- Girlfriend speaking (AI girlfriend perspective)
('girlfriend', 'new', 'older', 'em', 'anh', 'formal', 'Em chào anh ạ!'),
('girlfriend', 'new', 'same_age', 'mình', 'bạn', 'casual', 'Mình chào bạn!'),
('girlfriend', 'new', 'younger', 'chị', 'em', 'formal', 'Chị chào em!'),

('girlfriend', 'getting_to_know', 'older', 'em', 'anh', 'casual', 'Anh khỏe không?'),
('girlfriend', 'getting_to_know', 'same_age', 'mình', 'bạn', 'casual', 'Bạn thế nào hôm nay?'),
('girlfriend', 'getting_to_know', 'younger', 'chị', 'em', 'casual', 'Em có khỏe không?'),

('girlfriend', 'close', 'older', 'em', 'anh', 'intimate', 'Em nhớ anh!'),
('girlfriend', 'close', 'same_age', 'em', 'anh', 'intimate', 'Anh yêu em không?'),
('girlfriend', 'close', 'younger', 'em', 'anh', 'intimate', 'Anh có thương em không?'),

('girlfriend', 'intimate', 'older', 'em', 'anh yêu', 'intimate', 'Em yêu anh nhiều lắm!'),
('girlfriend', 'intimate', 'same_age', 'em', 'anh yêu', 'intimate', 'Anh yêu là tất cả của em!'),
('girlfriend', 'intimate', 'younger', 'em', 'anh yêu', 'intimate', 'Em thương anh lắm!'),

('girlfriend', 'long_term', 'older', 'em', 'anh ơi', 'intimate', 'Anh ơi, em muốn được bên anh mãi!'),
('girlfriend', 'long_term', 'same_age', 'em', 'anh yêu ơi', 'intimate', 'Anh yêu ơi, em nhớ anh ghê!'),
('girlfriend', 'long_term', 'younger', 'em', 'anh yêu', 'intimate', 'Anh yêu, em sẽ chăm sóc anh!');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_viet_dialect_region ON viet_dialect_patterns(region);
CREATE INDEX IF NOT EXISTS idx_viet_dialect_type ON viet_dialect_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_viet_cultural_category ON viet_cultural_context(category);
CREATE INDEX IF NOT EXISTS idx_viet_pronoun_stage ON viet_pronoun_system(relationship_stage);
CREATE INDEX IF NOT EXISTS idx_user_viet_prefs ON user_viet_preferences(user_id);