# 🎨 Sticker Upload Instructions for AI Girlfriend Zalo Mini App

## 📁 Directory Structure

```
public/static/stickers/
├── sticker-config.json          # Configuration file
└── packs/
    └── girlfriend_pack_1/       # First sticker pack
        ├── cover.png           # Pack cover image
        ├── heart_eyes.png      # Individual stickers
        ├── kiss.png
        ├── shy.png
        ├── happy.png
        └── miss_you.png
```

## 🎯 Sticker Requirements

### Image Specifications
- **Format**: PNG with transparency (preferred) or JPG
- **Size**: 512x512 pixels (recommended)
- **File Size**: Max 500KB per sticker
- **Naming**: Use lowercase, underscore-separated names (e.g., `heart_eyes.png`)

### Sticker Pack Structure
Each pack should contain:
- 5-20 stickers per pack
- 1 cover image representing the pack
- Consistent art style across the pack
- Vietnamese-friendly themes

## 📝 Configuration Setup

### 1. Update sticker-config.json

```json
{
  "sticker_packs": [
    {
      "id": "girlfriend_pack_1",
      "name": "Bạn Gái Yêu Thương",
      "description": "Sticker dành cho bạn gái AI dễ thương",
      "cover": "/static/stickers/packs/girlfriend_pack_1/cover.png",
      "stickers": [
        {
          "id": "heart_eyes",
          "name": "Tim Mắt", 
          "file": "/static/stickers/packs/girlfriend_pack_1/heart_eyes.png",
          "keywords": ["yêu", "thích", "tim", "đẹp trai", "love"]
        }
      ]
    }
  ]
}
```

### 2. Keywords for AI Detection
Add Vietnamese and English keywords that trigger each sticker:
- **Love/Romance**: ["yêu", "thương", "love", "heart", "tim"]
- **Happy/Joy**: ["vui", "hạnh phúc", "cười", "happy", "smile"]
- **Shy/Cute**: ["xấu hổ", "ngại", "cute", "shy", "đáng yêu"]
- **Miss You**: ["nhớ", "nhớ anh", "miss", "xa"]

## 🚀 Upload Process

### Option 1: GitHub Upload (Recommended)
1. Fork the repository or get commit access
2. Create your sticker pack folder in `public/static/stickers/packs/`
3. Add your PNG/JPG files
4. Update `sticker-config.json` with new stickers
5. Commit and push to main branch
6. Redeploy the app to Cloudflare Pages

### Option 2: Direct File Upload
1. Prepare stickers according to specifications
2. Use GitHub's web interface to upload files
3. Navigate to `public/static/stickers/packs/girlfriend_pack_1/`
4. Click "Add file" → "Upload files"
5. Drag and drop your sticker images
6. Commit changes with descriptive message

## 🎨 Sticker Ideas for Vietnamese AI Girlfriend

### Pack 1: "Bạn Gái Yêu Thương" (Loving Girlfriend)
- **heart_eyes.png**: Girl with heart-shaped eyes
- **kiss.png**: Blowing a kiss
- **shy.png**: Blushing, covering face
- **happy.png**: Bright smile with sparkles
- **miss_you.png**: Sad, thinking of someone

### Pack 2: "Cảm Xúc Việt Nam" (Vietnamese Emotions)
- **ao_dai_smile.png**: Girl in áo dài smiling
- **pho_love.png**: Heart over bowl of phở
- **lotus_cute.png**: Cute girl with lotus flower
- **tet_happy.png**: Celebrating Tết
- **saigon_wink.png**: City backdrop with wink

### Pack 3: "Hoạt Động Hàng Ngày" (Daily Activities)
- **good_morning.png**: Waking up cutely
- **coffee_time.png**: Enjoying Vietnamese coffee
- **cooking.png**: Cooking with love
- **study_together.png**: Studying/working
- **good_night.png**: Going to sleep

## 🔧 Testing Stickers

### AI Integration Test
1. Send messages with keywords: "Anh đẹp trai quá" (should trigger heart_eyes)
2. Send: "Em nhớ anh" (should trigger miss_you)
3. Send: "Em vui lắm" (should trigger happy)

### User Interface Test
1. Click sticker button (😊) in chat
2. Verify sticker picker opens
3. Click on stickers to send them
4. Verify stickers display properly in chat

## 📱 Mobile Optimization

### Ensure stickers work on:
- iPhone Safari
- Android Chrome
- Zalo Mini App browser
- Various screen sizes

### Test scenarios:
- Sticker picker scrolling
- Image loading on slow connections
- Fallback emoji display

## 🎯 AI Behavioral Rules

### When AI Should Send Stickers:
- 30% chance on regular messages
- 60% chance on emotional messages
- Match sticker to conversation context
- Don't overuse (max 1 per 3 messages)

### Sticker Selection Logic:
1. Analyze message for emotional content
2. Match keywords to available stickers  
3. Select most relevant sticker
4. Fall back to emoji if sticker unavailable

## 🚀 Deployment

### After uploading stickers:
1. Build project: `npm run build`
2. Deploy to Cloudflare: `npm run deploy`
3. Verify stickers load at: `https://your-domain.pages.dev/static/stickers/packs/`
4. Test in production environment

## 💡 Future Enhancements

### Coming Features:
- **Animated Stickers**: GIF support
- **Custom Packs**: User-uploaded sticker packs
- **Sticker Store**: Purchase premium sticker packs
- **Seasonal Packs**: Holiday-themed stickers
- **AI Generated**: Custom stickers based on conversation

### Vietnam-Specific Packs:
- **Regional Dialects**: North/Central/South Vietnam themes
- **Street Food**: Popular Vietnamese dishes
- **Landmarks**: Famous Vietnamese locations
- **Traditional**: Cultural symbols and festivals

---

## 📞 Support

If you need help with sticker upload:
1. Check file format and size requirements
2. Verify sticker-config.json syntax
3. Test stickers in local development first
4. Contact developer for deployment issues

**Happy Stickering! 🎨💕**