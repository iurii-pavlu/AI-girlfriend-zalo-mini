# 🎁 Enhanced Referral System - Integration Guide

## 📋 System Overview

The AI Girlfriend app now has a **complete referral system** with 3-day rewards, abuse prevention, and seamless chatbot integration. Users can invite friends and both parties receive **3 days of Pro access**.

### ✅ **Implemented Features**

#### 🔐 **User Validation & Rewards**
- **Unique Referral Codes**: Each user gets a unique 8-character code (e.g., `GF123ABC`)
- **3-Day Rewards**: Both inviter and invitee get 3 days Pro access (increased from 1 day)
- **Abuse Prevention**: Maximum 10 successful referrals per user
- **Fraud Protection**: Zalo user ID validation prevents fake accounts

#### 💬 **Chatbot Integration**
- **Natural Commands**: Users can type "mời", "invite", "giới thiệu", "thưởng", "rewards"
- **Smart Detection**: System recognizes referral intent in natural conversation
- **Action Buttons**: Interactive buttons for copying links, sharing, checking rewards
- **Vietnamese Responses**: All messages and UI in Vietnamese

#### 📊 **Analytics & Tracking**
- **Real-time Stats**: Conversion rates, successful referrals, reward distribution
- **User Dashboard**: Personal referral statistics via chat commands
- **Admin Analytics**: Daily reporting and trend analysis
- **Abuse Monitoring**: Automatic detection and blocking of suspicious activity

---

## 🔌 **API Endpoints**

### **POST /api/referral/generateReferral**
Generate referral code and sharing message for user.

```javascript
// Request
{
  "userId": "zalo_1234567890"
}

// Response
{
  "success": true,
  "data": {
    "referralCode": "GF123ABC",
    "referralUrl": "https://app.pages.dev/?ref=GF123ABC",
    "shareMessage": "🥰 Tham gia với em trên AI Girlfriend! Sử dụng mã GF123ABC để nhận 3 ngày Pro miễn phí!",
    "stats": {
      "currentReferrals": 3,
      "maxReferrals": 10,
      "canEarnMore": true,
      "bonusDaysAvailable": 9
    }
  },
  "chatbotResponse": {
    "message": "🎁 Mã giới thiệu của anh: GF123ABC\n\n💕 Mời bạn bè tham gia và cả hai sẽ nhận 3 ngày Pro miễn phí!\n\n📊 Thống kê: 3/10 lượt giới thiệu",
    "buttons": [
      { "text": "📋 Sao chép liên kết", "action": "copy_referral_link" },
      { "text": "📤 Chia sẻ qua Zalo", "action": "share_zalo" }
    ]
  }
}
```

### **POST /api/referral/applyReferral** 
Apply referral when new user signs up.

```javascript
// Request
{
  "newUserId": "zalo_9876543210",
  "referralCode": "GF123ABC"
}

// Response
{
  "success": true,
  "data": {
    "rewards": {
      "inviter": { "userId": "zalo_1234567890", "days": 3 },
      "invitee": { "userId": "zalo_9876543210", "days": 3 }
    },
    "message": "Chúc mừng! Bạn và người giới thiệu đều nhận được 3 ngày Pro miễn phí! 🎉"
  },
  "chatbotResponse": {
    "inviter": {
      "message": "🎉 Chúc mừng! Bạn bè của anh đã tham gia thành công!\n\n💎 Anh nhận được 3 ngày Pro miễn phí!",
      "buttons": [
        { "text": "🎁 Kiểm tra phần thưởng", "action": "check_rewards" },
        { "text": "📤 Mời thêm bạn bè", "action": "invite_more" }
      ]
    },
    "invitee": {
      "message": "🌟 Chào mừng đến với AI Girlfriend!\n\n🎁 Anh đã nhận 3 ngày Pro miễn phí từ lời mời của bạn!",
      "buttons": [
        { "text": "💬 Bắt đầu chat", "action": "start_chat" },
        { "text": "📤 Mời bạn bè của mình", "action": "generate_referral" }
      ]
    }
  }
}
```

### **GET /api/referral/rewards/:user_id**
Get user's referral statistics and rewards.

```javascript
// Response
{
  "success": true,
  "data": {
    "stats": {
      "referralCode": "GF123ABC",
      "referralsCount": 5,
      "referralsSuccessful": 4,
      "bonusDaysEarned": 12,
      "bonusDaysUsed": 3,
      "bonusDaysAvailable": 9,
      "maxReferralsAllowed": 10,
      "canEarnMore": true,
      "isEligible": true
    },
    "rewards": [
      {
        "id": 1,
        "rewardType": "inviter",
        "rewardDays": 3,
        "appliedAt": "2025-01-15T10:00:00Z",
        "status": "active",
        "sourceEvent": "signup"
      }
    ]
  },
  "chatbotResponse": {
    "message": "📊 Thống kê giới thiệu của anh:\n\n👥 Đã mời: 5/10 bạn\n✅ Thành công: 4 bạn\n🎁 Ngày thưởng: 9 ngày còn lại\n💎 Tổng nhận được: 12 ngày\n\n🚀 Anh có thể mời thêm 5 bạn nữa!",
    "buttons": [
      { "text": "📤 Mời thêm bạn bè", "action": "generate_referral" },
      { "text": "🎁 Kích hoạt thưởng", "action": "activate_rewards" },
      { "text": "📈 Xem chi tiết", "action": "detailed_stats" }
    ]
  }
}
```

### **GET /api/referral/analytics**
Get referral analytics (admin only).

```javascript
// Response
{
  "success": true,
  "data": {
    "date": "2025-01-15",
    "totalReferrals": 45,
    "successfulReferrals": 32,
    "conversionRate": 71.11,
    "totalRewardsDays": 192,
    "topReferrers": []
  },
  "summary": {
    "performance": {
      "totalReferrals": 45,
      "successfulReferrals": 32,
      "conversionRate": "71.11%",
      "totalRewardsDays": 192
    },
    "insights": "Excellent conversion rate! Referral system is performing well."
  }
}
```

---

## 💬 **Chatbot Integration**

### **Natural Language Commands**
Users can trigger referral functions by typing any of these phrases:

```javascript
// Referral Generation
"mời", "invite", "giới thiệu", "mã giới thiệu", "referral"

// Check Rewards  
"thưởng", "rewards", "phần thưởng"

// Statistics
"thống kê", "stats"
```

### **Example Conversation Flow**

```
👤 User: "mời bạn bè"

🤖 AI: "🎁 Mã giới thiệu của anh: GF123ABC

💕 Mời bạn bè tham gia và cả hai sẽ nhận 3 ngày Pro miễn phí!

🥰 Tham gia với em trên AI Girlfriend! Sử dụng mã GF123ABC để nhận 3 ngày Pro miễn phí! https://app.pages.dev/?ref=GF123ABC

📊 Thống kê: 3/10 lượt giới thiệu"

[📋 Sao chép liên kết] [📤 Chia sẻ qua Zalo]
```

```
👤 User: "thưởng"

🤖 AI: "📊 Thống kê giới thiệu của anh:

👥 Đã mời: 5/10 bạn
✅ Thành công: 4 bạn  
🎁 Ngày thưởng: 9 ngày còn lại
💎 Tổng nhận được: 12 ngày

🚀 Anh có thể mời thêm 5 bạn nữa!"

[📤 Mời thêm bạn bè] [🎁 Kích hoạt thưởng]
```

---

## 🛡️ **Abuse Prevention**

### **Automatic Protection**
- ✅ **Referral Limits**: Max 10 successful referrals per user
- ✅ **Duplicate Prevention**: Each user can only be referred once
- ✅ **Zalo Validation**: Must be real Zalo Mini App user
- ✅ **Pattern Detection**: Suspicious behavior triggers automatic blocking

### **Database Triggers**
```sql
-- Auto-block users exceeding referral limit
CREATE TRIGGER detect_referral_abuse
  AFTER INSERT ON referrals
  FOR EACH ROW
  WHEN (SELECT referrals_count FROM users WHERE id = NEW.referrer_id) > 10
  BEGIN
    UPDATE users SET is_referral_eligible = FALSE WHERE id = NEW.referrer_id;
    INSERT INTO referral_abuse_log (user_id, abuse_type, action_taken)
    VALUES (NEW.referrer_id, 'max_limit_exceeded', 'blocked');
  END;
```

### **Manual Admin Controls**
```javascript
// Block user from referrals
UPDATE users SET is_referral_eligible = FALSE WHERE id = 'zalo_abuser123';

// Reset user referral count (admin action)
UPDATE users SET referrals_count = 0, is_referral_eligible = TRUE WHERE id = 'zalo_user123';
```

---

## 📊 **Database Schema**

### **Enhanced Users Table**
```sql
ALTER TABLE users ADD COLUMN referrals_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referrals_successful INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_reward_days_earned INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_reward_days_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN max_referrals_allowed INTEGER DEFAULT 10;
ALTER TABLE users ADD COLUMN is_referral_eligible BOOLEAN DEFAULT TRUE;
```

### **Enhanced Referrals Table**
```sql
ALTER TABLE referrals ADD COLUMN inviter_reward_days INTEGER DEFAULT 3;
ALTER TABLE referrals ADD COLUMN invitee_reward_days INTEGER DEFAULT 3;
ALTER TABLE referrals ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE referrals ADD COLUMN conversion_event TEXT;
```

### **New Tracking Tables**
```sql
-- Referral rewards tracking
CREATE TABLE referral_rewards (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  referral_id INTEGER NOT NULL,
  reward_type TEXT CHECK (reward_type IN ('inviter', 'invitee')),
  reward_days INTEGER NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  status TEXT DEFAULT 'active'
);

-- Daily analytics
CREATE TABLE referral_analytics (
  id INTEGER PRIMARY KEY,
  date DATE UNIQUE,
  total_referrals INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0,
  conversion_rate REAL DEFAULT 0.0,
  total_inviter_rewards INTEGER DEFAULT 0,
  total_invitee_rewards INTEGER DEFAULT 0
);

-- Abuse monitoring
CREATE TABLE referral_abuse_log (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  abuse_type TEXT NOT NULL,
  description TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  action_taken TEXT,
  resolved BOOLEAN DEFAULT FALSE
);
```

---

## 🚀 **Implementation Steps**

### **1. Apply Database Migration**
```bash
# Apply the enhanced referral migration
npx wrangler d1 migrations apply ai-gf-db --local

# For production
npx wrangler d1 migrations apply ai-gf-db --remote
```

### **2. Update Environment Variables**
```bash
# Set referral configuration
export REFERRAL_BONUS_DAYS=3
export MAX_REFERRALS_PER_USER=10
export ENABLE_REFERRAL_ANALYTICS=true
```

### **3. Deploy Enhanced System**
```bash
# Build with new referral features
npm run build

# Deploy to production
npx wrangler pages deploy dist --project-name project-a1669842
```

### **4. Test Referral Flow**
```bash
# Test referral generation
curl -X POST "https://your-app.pages.dev/api/referral/generateReferral" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: zalo_test123" \
  -d '{"userId": "zalo_test123"}'

# Test referral application  
curl -X POST "https://your-app.pages.dev/api/referral/applyReferral" \
  -H "Content-Type: application/json" \
  -d '{"newUserId": "zalo_test456", "referralCode": "GF123ABC"}'

# Test rewards check
curl "https://your-app.pages.dev/api/referral/rewards/zalo_test123" \
  -H "X-User-Id: zalo_test123"
```

---

## 📈 **Expected Results**

### **User Engagement**
- **Viral Growth**: Each user can bring 10 friends = 10x growth potential
- **Retention**: 3-day Pro access increases engagement and conversion
- **Network Effect**: Friends invite friends, creating organic growth loops

### **Revenue Impact**
- **Free-to-Paid Conversion**: Pro experience during free period drives subscriptions
- **Reduced CAC**: Referrals are cheaper than paid advertising
- **Higher LTV**: Referred users often have higher lifetime value

### **Analytics Tracking**
- **Daily Metrics**: Track referral volume, conversion rates, reward distribution
- **User Behavior**: Monitor which users are top referrers and their patterns
- **ROI Analysis**: Compare referral cost (rewards) vs. user acquisition value

---

## 🔧 **Customization Options**

### **Reward Configuration**
```javascript
// Adjust reward amounts in environment
INVITER_REWARD_DAYS=5      // Increase inviter reward
INVITEE_REWARD_DAYS=2      // Different invitee reward
MAX_REFERRALS=15           // Allow more referrals for VIP users
```

### **Message Templates**
```javascript
// Customize Vietnamese sharing messages
const shareTemplates = [
  "🥰 Tham gia với em trên AI Girlfriend! Mã {code} = 3 ngày Pro free!",
  "💕 Bạn gái AI đang chờ anh! Code {code} nhận ngay 3 ngày miễn phí!",
  "🌸 Chat không giới hạn với AI xinh đẹp! Mã {code} tặng 3 ngày Premium!"
];
```

### **Abuse Prevention Rules**
```javascript
// Custom abuse detection
const abuseRules = {
  maxReferralsPerHour: 3,        // Rate limiting
  maxReferralsPerDay: 5,         // Daily limits  
  suspiciousPatternThreshold: 5,  // Pattern detection
  autoBlockEnabled: true         // Automatic blocking
};
```

---

## ✅ **Production Ready**

The enhanced referral system is **fully implemented and production-ready**:

- ✅ **Complete API endpoints** with Vietnamese responses
- ✅ **Chatbot integration** with natural language processing
- ✅ **Abuse prevention** with automatic monitoring
- ✅ **Analytics tracking** for performance measurement
- ✅ **Database schema** with proper indexing and triggers
- ✅ **Frontend UI** with interactive action buttons

**🎯 Ready for viral growth in the Vietnamese market! 🇻🇳🚀**