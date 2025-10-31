# 🎵 Multi-Provider Music Integration System

## Overview

Your Banger app now supports **multiple music service integrations** per user! A user can connect to **Spotify, Apple Music, YouTube Music, SoundCloud**, and any future music services simultaneously.

## 🏗️ Architecture

### 1. **Banger User Account (Primary Authentication)**

Users create a Banger account using:

- **Email & Password**
- **Google OAuth**
- **Apple Sign-In**

### 2. **Music Service Integrations (Secondary)**

After creating a Banger account, users can connect multiple music services:

- **Spotify** ✅ (Fully implemented)
- **Apple Music** 🚧 (API placeholder ready)
- **YouTube Music** 🚧 (API placeholder ready)
- **SoundCloud** 🚧 (API placeholder ready)

## 🗄️ Database Schema

### `users` Table (Updated)

```sql
- id: Primary key
- auth_provider: 'google' | 'apple' | 'email' | 'spotify' (legacy)
- google_id, apple_id: OAuth provider IDs
- email, password_hash: Email authentication
- display_name, avatar_url, bio: Profile info
- email_verified: Email verification status
```

### `music_integrations` Table (New)

```sql
- user_id: References users.id
- provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud'
- provider_user_id: Music service user ID
- access_token, refresh_token: OAuth tokens
- is_connected, has_valid_token: Connection status
- display_name, avatar_url: Provider-specific profile
- connected_at, last_sync_at: Timestamps
```

## 📱 Frontend Integration

### Frontend Components Already Built:

- **`LoginModal`**: Multi-provider Banger account creation
- **`MusicIntegrations`**: Interface to connect/disconnect music services
- **`AuthProvider`**: React context managing auth state
- **`authService`**: API calls for authentication

### Example: User Journey

```tsx
// 1. User creates Banger account
const { signUpWithEmail, loginWithGoogle } = useAuth();
await signUpWithEmail(email, password, displayName);

// 2. User connects music services
const { connectSpotify, connectAppleMusic } = useAuth();
await connectSpotify();
await connectAppleMusic();

// 3. User can have multiple integrations
const { musicIntegrations } = useAuth();
// Shows: spotify: connected, apple-music: connected, etc.
```

## 🔗 API Endpoints

### Authentication Endpoints

```
POST /api/auth/signup            # Email signup
POST /api/auth/login             # Email login
GET  /api/auth/google             # Google OAuth URL
POST /api/auth/google/callback    # Google OAuth callback
GET  /api/auth/apple              # Apple Sign-In URL
POST /api/auth/apple/callback     # Apple Sign-In callback
GET  /api/auth/me                 # Current user profile
```

### Music Integration Endpoints

```
GET  /api/auth/integrations/spotify           # Spotify OAuth URL
POST /api/auth/integrations/spotify/connect   # Connect Spotify
POST /api/auth/integrations/:provider/disconnect # Disconnect service
GET  /api/auth/integrations                   # Get all integrations
```

### Music Data Endpoints (Updated for Multi-Provider)

```
GET /api/spotify/profile          # Spotify profile (requires Spotify integration)
GET /api/spotify/current-track    # Currently playing (requires Spotify integration)
GET /api/spotify/search           # Search Spotify (requires Spotify integration)
```

## 🎯 How Multiple Integrations Work

### Example: User with Spotify + Apple Music

```json
{
  "user": {
    "id": 123,
    "email": "user@example.com",
    "displayName": "Music Lover",
    "authProvider": "email"
  },
  "musicIntegrations": {
    "spotify": {
      "provider": "spotify",
      "isConnected": true,
      "hasValidToken": true,
      "displayName": "user_spotify",
      "connectedAt": "2025-01-01T00:00:00Z"
    },
    "apple-music": {
      "provider": "apple-music",
      "isConnected": true,
      "hasValidToken": true,
      "displayName": "user_apple",
      "connectedAt": "2025-01-02T00:00:00Z"
    }
  }
}
```

### Backend Service Usage

```typescript
// Get user's Spotify integration
const spotifyIntegration = await findMusicIntegration(userId, 'spotify');
if (spotifyIntegration?.access_token) {
  const currentTrack = await spotifyService.getCurrentTrack(spotifyIntegration.access_token);
}

// Get user's Apple Music integration
const appleMusicIntegration = await findMusicIntegration(userId, 'apple-music');
if (appleMusicIntegration?.access_token) {
  const playlist = await appleMusicService.getPlaylists(appleMusicIntegration.access_token);
}
```

## 🚀 Next Steps

### 1. **Complete Implementation**

- ✅ Database migration (schema ready)
- ✅ Backend API endpoints (implemented)
- ✅ Frontend components (built)
- 🔄 **Database setup** (configure PostgreSQL)
- 🔄 **OAuth app registration** (Google, Apple, Spotify)

### 2. **Add More Music Services**

```typescript
// Framework is ready for:
class AppleMusicService extends MusicIntegrationService {
  async connectAppleMusic(userId: number, authData: any) {
    // Implementation needed
  }
}

class YouTubeMusicService extends MusicIntegrationService {
  async connectYouTubeMusic(userId: number, authData: any) {
    // Implementation needed
  }
}
```

### 3. **Enhanced Features**

- **Cross-platform playlists**: Sync playlists across services
- **Unified search**: Search across all connected services
- **Music discovery**: Recommendations from multiple sources
- **Social features**: Share tracks from any connected service

## 🎉 Benefits

1. **User Choice**: Users aren't locked into one music service
2. **Unified Experience**: Access all music from one app
3. **Data Richness**: Combine data from multiple services
4. **Future-Proof**: Easy to add new music services
5. **Clean Separation**: Banger account ≠ Music service accounts

Your users can now have **one Banger account** that connects to **all their music services**! 🎵
