# Avatar Enhancement Plan: AI-Generated Retro Portraits

## Overview
Upgrade the avatar system from selecting pre-made legacy NBA player sprites to allowing players to upload a headshot photo, which gets transformed into an NBA Jam Tournament Edition-style pixel art portrait using OpenAI DALL-E 3. Photos stored in Supabase Storage, generated pixel art cached alongside.

## Architecture

```
User uploads photo → Backend receives multipart form
  → Stores original in Supabase Storage (avatars/originals/{user_id}.jpg)
  → Sends to OpenAI DALL-E 3 with pixel art prompt
  → Stores generated pixel art in Supabase Storage (avatars/retro/{user_id}.png)
  → Updates user.avatar_url to Supabase public URL
  → Frontend displays the retro avatar image
```

## Implementation Steps

### Step 1: Backend - Supabase Storage Setup
- Add `supabase` Python SDK to requirements
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to config
- Create a storage bucket `avatars` with public read access
- Folders: `avatars/originals/` and `avatars/retro/`

### Step 2: Backend - OpenAI Integration
- Add `openai` Python SDK to requirements
- Add `OPENAI_API_KEY` to config
- Create service `backend/app/services/avatar_generator.py`:
  - `generate_retro_avatar(image_bytes)` function
  - Uploads original photo to OpenAI
  - Prompt: "Transform this photo into an NBA Jam Tournament Edition style pixel art portrait. 16-bit retro video game style, exaggerated features, basketball jersey, dark background. The portrait should capture the person's key facial features, skin tone, and hair style in pixel art form."
  - Downloads the result and returns the bytes

### Step 3: Backend - Upload Endpoint
- New route `POST /api/players/me/avatar` in player_routes.py
- Accepts multipart file upload (max 5MB, JPEG/PNG only)
- Validates image dimensions and format
- Stores original in Supabase Storage
- Calls avatar generator service
- Stores retro version in Supabase Storage
- Updates `user.avatar_url` to the retro image's public URL
- Returns the new avatar URL

### Step 4: Backend - Add `custom_avatar_url` field
- Add `custom_avatar_url` column to User model (nullable string)
- This stores the AI-generated retro avatar URL
- Keep existing `avatar_url` for legacy player selection as fallback
- Frontend priority: `custom_avatar_url` > legacy pixel sprite

### Step 5: Frontend - Avatar Display Priority
- Update `AvatarBadge` component:
  - If `custom_avatar_url` exists → show `<img>` with retro photo
  - Else if `avatar_url` (legacy player ID) exists → show PixelAvatar sprite
  - Else → show default initial circle
- Apply pixelated CSS filter: `image-rendering: pixelated` for extra retro feel

### Step 6: Frontend - Upload UI
- Add camera/upload button to PlayerProfilePage avatar section
- New `AvatarUpload` component:
  - File input accepting image/jpeg, image/png
  - Preview of selected photo before upload
  - "Generate Retro Avatar" button that calls the API
  - Loading spinner during generation (DALL-E takes ~10-15s)
  - Shows before/after comparison (original → retro)
  - Option to retry generation or pick a different photo
- Keep existing "Choose Legacy Player" option as alternative

### Step 7: Frontend - Avatar Display Everywhere
- Update all avatar display locations to handle both types:
  - Navbar avatar
  - Dashboard welcome card
  - Players list cards
  - NbaJamTeams player cards
  - Player profile page

## Files to Create/Modify

**New files:**
- `backend/app/services/avatar_generator.py` - OpenAI DALL-E integration
- `backend/app/services/supabase_storage.py` - Supabase Storage client
- `frontend/src/components/AvatarUpload.jsx` - Upload UI component

**Modified files:**
- `backend/requirements.txt` - Add openai, supabase SDKs
- `backend/app/config.py` - Add OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
- `backend/app/models/user.py` - Add custom_avatar_url field
- `backend/app/schemas/user.py` - Add custom_avatar_url to schemas
- `backend/app/routes/player_routes.py` - Add avatar upload endpoint
- `frontend/src/api/players.js` - Add uploadAvatar API call
- `frontend/src/components/AvatarPicker.jsx` - Update AvatarBadge for custom avatars
- `frontend/src/pages/PlayerProfilePage.jsx` - Add upload button
- `frontend/src/components/NbaJamTeams.jsx` - Handle custom avatar display

## Environment Variables Needed
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://wxnsyumsbhtnmkoqmbqb.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  (service role key from Supabase dashboard)
```

## Cost Estimate
- DALL-E 3 (1024x1024): ~$0.04 per generation
- Supabase Storage: Free tier includes 1GB (plenty for avatars)
- Expected: ~50 players × $0.04 = ~$2 total for full roster
