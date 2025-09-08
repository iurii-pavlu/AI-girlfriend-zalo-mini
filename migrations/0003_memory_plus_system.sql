-- Memory Plus: Advanced relationship memory system
CREATE TABLE IF NOT EXISTS relationship_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('personal', 'preference', 'event', 'emotion', 'milestone')),
  content TEXT NOT NULL,
  importance_score INTEGER DEFAULT 5 CHECK (importance_score BETWEEN 1 AND 10),
  emotional_tag TEXT, -- happy, sad, excited, romantic, etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_referenced DATETIME DEFAULT CURRENT_TIMESTAMP,
  reference_count INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Conversation context for deeper understanding
CREATE TABLE IF NOT EXISTS conversation_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  context_summary TEXT NOT NULL,
  key_topics TEXT, -- JSON array of topics discussed
  emotional_tone TEXT, -- overall mood of conversation
  relationship_stage TEXT DEFAULT 'new' CHECK (relationship_stage IN ('new', 'getting_to_know', 'close', 'intimate', 'long_term')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- User preferences and personality insights
CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT PRIMARY KEY,
  personality_insights TEXT, -- JSON object with personality traits
  communication_style TEXT, -- formal, casual, playful, romantic
  interests TEXT, -- JSON array of interests
  relationship_goals TEXT, -- what they want from AI girlfriend
  preferred_topics TEXT, -- JSON array of favorite conversation topics
  avoided_topics TEXT, -- JSON array of topics to avoid
  cultural_background TEXT, -- region, dialect preferences
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for memory retrieval performance
CREATE INDEX IF NOT EXISTS idx_memory_user_importance ON relationship_memory(user_id, importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memory_type_user ON relationship_memory(memory_type, user_id);
CREATE INDEX IF NOT EXISTS idx_memory_emotional_tag ON relationship_memory(emotional_tag, user_id);
CREATE INDEX IF NOT EXISTS idx_context_session ON conversation_context(session_id);
CREATE INDEX IF NOT EXISTS idx_context_stage ON conversation_context(relationship_stage);
CREATE INDEX IF NOT EXISTS idx_profile_updated ON user_profile(updated_at);