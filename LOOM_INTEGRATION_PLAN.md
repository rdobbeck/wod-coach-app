# Loom Video Messaging Integration Plan

## Status: On Hold (Pending Public App ID)

### What's Implemented
- ✅ Database schema for video messages (`VideoMessage` model in Prisma)
- ✅ LoomRecorder component (`components/loom/LoomRecorder.tsx`)
- ✅ LoomVideoPlayer component (`components/loom/LoomVideoPlayer.tsx`)
- ✅ `/coach/messages` page for sending videos
- ✅ API endpoint `/api/loom/save-video` for saving video metadata
- ✅ Packages installed: `@loomhq/record-sdk`, `@loomhq/loom-embed`

### What's Missing
- ❌ **Loom Public App ID** - Need to get from https://dev.loom.com
- ❌ Environment variable `NEXT_PUBLIC_LOOM_PUBLIC_APP_ID` not configured
- ❌ Testing with real Loom account

### How to Complete Integration

1. **Get Loom Public App ID:**
   - Go to https://dev.loom.com
   - Sign in with Loom account
   - Access Developer Dashboard
   - Find your sandbox application (auto-created)
   - Copy the **Public App ID** (UUID format)

2. **Configure Environment:**
   ```bash
   # Local (.env)
   NEXT_PUBLIC_LOOM_PUBLIC_APP_ID="your-uuid-here"

   # Production (Vercel)
   Add NEXT_PUBLIC_LOOM_PUBLIC_APP_ID in Vercel project settings
   ```

3. **Test Locally:**
   - Navigate to http://localhost:3011/coach/messages
   - Select a client
   - Click "Send Video Message"
   - Record a test video
   - Verify it saves to database and displays

4. **Deploy to Production:**
   - Commit changes
   - Push to GitHub
   - Vercel will auto-deploy
   - Test on production URL

### Technical Details

**Authentication Method:** SDK Standard (Public App ID)
- Uses `publicAppId` parameter in `setupLoom()`
- Suitable for localhost development with sandbox app
- Videos owned by user's Loom account

**Alternative:** SDK Custom (Key-Pair Auth)
- More secure with JWT signing
- Requires backend API endpoint
- Videos owned by app (partner ownership)
- Tokens expire every 30 seconds

### Database Schema

```prisma
model VideoMessage {
  id           String   @id @default(cuid())
  senderId     String   // Coach ID
  receiverId   String   // Client ID
  loomVideoId  String
  loomShareUrl String
  loomEmbedUrl String
  title        String?
  description  String?  @db.Text
  workoutId    String?  // Optional link to workout
  programId    String?  // Optional link to program
  isRead       Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sender   User @relation("SentVideoMessages", ...)
  receiver User @relation("ReceivedVideoMessages", ...)
}
```

### Known Issues
- Loom SDK `isSupported()` function not exported - removed from implementation
- Import errors were causing Internal Server Error - fixed by removing `isSupported` check

### Resources
- Loom Developer Docs: https://dev.loom.com/docs/record-sdk/getting-started
- SDK Standard Guide: https://dev.loom.com/docs/record-sdk/sdk-standard
- Key-Pair Auth Guide: https://dev.loom.com/docs/record-sdk/details/key-pair-authentication/key-pair-auth
