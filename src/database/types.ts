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
  id: string; // UUID
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
  // New normalized track reference
  track_id?: string; // UUID FK to tracks table
  track_provider?: string; // Optional: provider for direct queries
  // Deprecated: Old denormalized columns (kept for migration period)
  /** @deprecated Use track_id FK instead */
  track_id_old?: string; // Old external track ID
  /** @deprecated Will be removed after migration */
  track_name?: string;
  /** @deprecated Will be removed after migration */
  artist_name?: string;
  /** @deprecated Will be removed after migration */
  album_name?: string;
  /** @deprecated Will be removed after migration */
  track_image?: string;
  /** @deprecated Will be removed after migration */
  track_preview_url?: string;
  /** @deprecated Will be removed after migration */
  track_external_url?: string;
  /** @deprecated Will be removed after migration */
  track_duration?: number; // in seconds
  username?: string;
  feeling?: string;
  caption?: string;
  is_currently_listening: boolean;
  created_at: Date;
  updated_at: Date;
  reactions?: Reaction[];
}

export interface Reaction {
  id: string; // UUID
  user_id: string; // UUID
  post_id: string; // UUID
  reaction_type: string;
  created_at: Date;
}

export interface Comment {
  id: string; // UUID
  user_id: string; // UUID
  post_id: string; // UUID
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface Follow {
  id: string; // UUID
  follower_id: string; // UUID
  following_id: string; // UUID
  created_at: Date;
}

// Normalized track from any provider
export interface Track {
  id: string; // UUID (local ID)
  external_id: string; // Provider's track ID
  provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';
  name: string;
  artist: string;
  album?: string;
  duration?: number; // in seconds
  image_url?: string;
  preview_url?: string;
  external_url?: string;
  metadata?: Record<string, any>; // Provider-specific fields stored as JSON
  created_at: Date;
  updated_at: Date;
}

// Normalized playlist from any provider
export interface Playlist {
  id: string; // UUID (local ID)
  external_id: string; // Provider's playlist ID
  user_id: string; // UUID
  provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';
  name: string;
  description?: string;
  image_url?: string;
  owner?: string;
  track_count: number;
  external_url?: string;
  snapshot_id?: string; // For change tracking
  last_synced_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// Junction table for playlist tracks (with change tracking)
export interface PlaylistTrack {
  id: string; // UUID
  playlist_id: string; // UUID FK to playlists
  track_id: string; // UUID FK to tracks
  position: number;
  added_at: Date;
  removed_at?: Date; // NULL = active, set = removed
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
  track_id: string; // UUID FK to tracks table (normalized)
  track_provider?: string; // Optional: provider for direct queries
  // Legacy columns (kept for backward compatibility during migration)
  track_id_old?: string; // Old external track ID
  track_name?: string;
  artist_name?: string;
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
  post_id: string; // UUID
  reaction_type: string;
}

export interface CreateCommentData {
  user_id: string; // UUID
  post_id: string; // UUID
  content: string;
}

// Input types for normalized entities
export interface CreateTrackData {
  external_id: string;
  provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';
  name: string;
  artist: string;
  album?: string;
  duration?: number;
  image_url?: string;
  preview_url?: string;
  external_url?: string;
  metadata?: Record<string, any>;
}

export interface UpdateTrackData {
  name?: string;
  artist?: string;
  album?: string;
  duration?: number;
  image_url?: string;
  preview_url?: string;
  external_url?: string;
  metadata?: Record<string, any>;
}

export interface CreatePlaylistData {
  external_id: string;
  user_id: string; // UUID
  provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';
  name: string;
  description?: string;
  image_url?: string;
  owner?: string;
  track_count?: number;
  external_url?: string;
  snapshot_id?: string;
}

export interface UpdatePlaylistData {
  name?: string;
  description?: string;
  image_url?: string;
  owner?: string;
  track_count?: number;
  external_url?: string;
  snapshot_id?: string;
  last_synced_at?: Date;
}

export interface CreatePlaylistTrackData {
  playlist_id: string; // UUID
  track_id: string; // UUID
  position: number;
}
