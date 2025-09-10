/**
 * Cloudflare Pages Function: Save Call Moments
 * POST /api/moments/save
 * 
 * Saves call transcript, metrics and generates summary for "Moments" feature
 */

interface Env {
  KV?: KVNamespace;
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  ORIGIN_ALLOWED: string;
}

interface CallMetrics {
  duration: number; // seconds
  p50_latency: number; // ms
  p95_latency: number; // ms  
  packet_drops: number;
  reconnections: number;
}

interface MomentRequest {
  callId: string;
  userId: string;
  transcript: string;
  metrics: CallMetrics;
  timestamp?: number;
}

interface MomentSummary {
  id: string;
  userId: string;
  callId: string;
  timestamp: number;
  duration: number;
  summary: string;
  highlights: string[];
  emotion: 'happy' | 'loving' | 'playful' | 'caring' | 'neutral';
  metrics: CallMetrics;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  try {
    // Verify origin
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = env.ORIGIN_ALLOWED?.split(',') || ['http://localhost:3000'];
    
    if (!allowedOrigins.some(allowed => origin.includes(allowed))) {
      return new Response('Forbidden', { status: 403 });
    }

    // Parse request
    const body: MomentRequest = await request.json();
    if (!body.callId || !body.userId || !body.transcript) {
      return new Response('Missing required fields', { status: 400 });
    }

    // Generate summary using simple rules (can be enhanced with LLM later)
    const summary = await generateSummary(body.transcript, env);
    
    const moment: MomentSummary = {
      id: `moment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: body.userId,
      callId: body.callId,
      timestamp: body.timestamp || Date.now(),
      duration: body.metrics.duration,
      summary: summary.text,
      highlights: summary.highlights,
      emotion: summary.emotion,
      metrics: body.metrics,
    };

    // Save to storage
    if (env.KV) {
      const key = `moments:${body.userId}:${moment.timestamp}`;
      await env.KV.put(key, JSON.stringify(moment), {
        expirationTtl: 60 * 60 * 24 * 30, // 30 days
      });
      
      // Also save to user's moments list
      const userMomentsKey = `user_moments:${body.userId}`;
      const existingMoments = await env.KV.get(userMomentsKey);
      const momentsList = existingMoments ? JSON.parse(existingMoments) : [];
      momentsList.unshift({ id: moment.id, timestamp: moment.timestamp });
      
      // Keep only last 50 moments per user
      if (momentsList.length > 50) {
        momentsList.splice(50);
      }
      
      await env.KV.put(userMomentsKey, JSON.stringify(momentsList));
    }

    // Alternative: save to D1 database
    if (env.DB) {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO moments 
        (id, user_id, call_id, timestamp, duration, summary, highlights, emotion, metrics)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        moment.id,
        moment.userId,
        moment.callId,
        moment.timestamp,
        moment.duration,
        moment.summary,
        JSON.stringify(moment.highlights),
        moment.emotion,
        JSON.stringify(moment.metrics)
      ).run();
    }

    return new Response(JSON.stringify({
      success: true,
      moment: {
        id: moment.id,
        summary: moment.summary,
        highlights: moment.highlights,
        emotion: moment.emotion,
        duration: moment.duration,
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Moments save error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};

async function generateSummary(transcript: string, env: Env) {
  // Simple rule-based summary for v1 (can be enhanced with OpenAI/Claude later)
  const words = transcript.toLowerCase().split(/\s+/);
  const wordCount = words.length;
  
  // Detect emotion from keywords
  let emotion: 'happy' | 'loving' | 'playful' | 'caring' | 'neutral' = 'neutral';
  
  if (words.some(w => ['love', 'yêu', 'thương', 'happy', 'vui'].includes(w))) {
    emotion = 'loving';
  } else if (words.some(w => ['laugh', 'funny', 'haha', 'cute', 'đáng yêu'].includes(w))) {
    emotion = 'playful';  
  } else if (words.some(w => ['care', 'worry', 'quan tâm', 'lo lắng'].includes(w))) {
    emotion = 'caring';
  } else if (words.some(w => ['good', 'great', 'awesome', 'tốt', 'tuyệt'].includes(w))) {
    emotion = 'happy';
  }

  // Extract highlights (simple keyword matching)
  const highlights = [];
  if (transcript.includes('yêu') || transcript.includes('love')) {
    highlights.push('💕 Shared loving words');
  }
  if (transcript.includes('laugh') || transcript.includes('cười')) {
    highlights.push('😄 Had some laughs together');
  }
  if (transcript.includes('plan') || transcript.includes('kế hoạch')) {
    highlights.push('📅 Made future plans');
  }
  
  // Default highlights based on duration/engagement
  if (highlights.length === 0) {
    if (wordCount > 100) {
      highlights.push('💬 Had a deep conversation');
    } else {
      highlights.push('🌟 Shared a sweet moment');
    }
  }

  // Generate simple summary
  let summary = '';
  if (wordCount < 50) {
    summary = 'A brief but sweet conversation filled with connection and warmth.';
  } else if (wordCount < 150) {
    summary = 'A lovely chat where you both shared thoughts and feelings, creating a special moment together.';
  } else {
    summary = 'A wonderful, in-depth conversation where you connected on multiple topics and strengthened your bond.';
  }

  // Vietnamese version if transcript contains Vietnamese
  if (transcript.includes('anh') || transcript.includes('em')) {
    if (wordCount < 50) {
      summary = 'Một cuộc trò chuyện ngắn ngủi nhưng ngọt ngào, đầy ấm áp và kết nối.';
    } else if (wordCount < 150) {
      summary = 'Một cuộc chat thú vị nơi cả hai chia sẻ suy nghĩ và cảm xúc, tạo nên khoảnh khắc đặc biệt.';
    } else {
      summary = 'Một cuộc trò chuyện sâu sắc và tuyệt vời, nơi bạn kết nối qua nhiều chủ đề và củng cố tình cảm.';
    }
  }

  return { text: summary, highlights, emotion };
}

// Handle CORS preflight
export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = env.ORIGIN_ALLOWED?.split(',') || ['http://localhost:3000'];
  
  if (!allowedOrigins.some(allowed => origin.includes(allowed))) {
    return new Response('Forbidden', { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
};