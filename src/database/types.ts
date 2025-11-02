// Database types
export interface User {
  id: string; // UUID
  // Legacy Spotify fields (for backward compatibility)
  spotify_id?: string;
  spotify_access_token?: string;
  spotify_refresh_token?: string;

  // New auth system fields
  auth_provider: 'google' | 'apple' | 'email' | 'spotify';
  google_id?: string;
  apple_id?: string;
  password_hash?: string; // for email auth
  email_verified?: boolean;
  verification_token?: string;
  reset_token?: string;
  reset_token_expires?: Date;

  // User profile fields
  email?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;

  created_at: Date;
  updated_at: Date;
}

export interface MusicIntegration {
  id: number;
  user_id: string; // UUID
  provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';
  provider_user_id: string;
  display_name?: string;
  avatar_url?: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: Date;
  is_connected: boolean;
  has_valid_token: boolean;
  connected_at: Date;
  last_sync_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Post {
  id: string; // UUID
  user_id: string; // UUID
  track_id: string;
  track_name: string;
  username?: string;
  artist_name: string;
  album_name?: string;
  track_image?: string;
  track_preview_url?: string;
  track_external_url?: string;
  track_duration?: number; // in seconds
  feeling?: string;
  caption?: string;
  is_currently_listening: boolean;
  created_at: Date;
  updated_at: Date;
  reactions?: Array<{
    id: string;
    user_id: string;
    reaction_type: string;
    created_at: Date;
  }>;
}

export interface Reaction {
  id: number;
  user_id: string; // UUID
  post_id: number;
  reaction_type: string;
  created_at: Date;
}

export interface Comment {
  id: number;
  user_id: string; // UUID
  post_id: number;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface Follow {
  id: number;
  follower_id: string; // UUID
  following_id: string; // UUID
  created_at: Date;
}

// Input types for creating records
export interface CreateUserData {
  auth_provider: 'google' | 'apple' | 'email' | 'spotify';
  google_id?: string;
  apple_id?: string;
  spotify_id?: string; // for backward compatibility
  email?: string;
  password_hash?: string; // for email auth
  username?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  email_verified?: boolean;
}

export interface CreateMusicIntegrationData {
  user_id: string; // UUID
  provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';
  provider_user_id: string;
  display_name?: string;
  avatar_url?: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: Date;
}

export interface CreatePostData {
  user_id: string; // UUID
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name?: string;
  track_image?: string;
  track_preview_url?: string;
  track_external_url?: string;
  track_duration?: number; // in seconds
  feeling?: string;
  caption?: string;
  is_currently_listening?: boolean;
}

export interface CreateReactionData {
  user_id: string; // UUID
  post_id: number;
  reaction_type: string;
}

export interface CreateCommentData {
  user_id: string; // UUID
  post_id: number;
  content: string;
}
