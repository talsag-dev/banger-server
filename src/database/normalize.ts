import type { CreateTrackData, CreatePlaylistData } from './types';
import type { MusicProvider } from '../services/MusicIntegrationService';

// Spotify track normalization
export interface SpotifyTrackData {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    release_date?: string;
  };
  duration_ms: number;
  external_urls: { spotify: string };
  preview_url?: string | null;
  popularity?: number;
  explicit?: boolean;
}

// Spotify playlist normalization
export interface SpotifyPlaylistData {
  id: string;
  name: string;
  description?: string | null;
  images: Array<{ url: string; height: number; width: number }>;
  owner: {
    display_name?: string;
    id: string;
  };
  tracks: {
    total: number;
  };
  external_urls: { spotify: string };
  snapshot_id?: string;
}

/**
 * Normalize Spotify track data to our unified Track format
 */
export const normalizeSpotifyTrack = (spotifyTrack: SpotifyTrackData): CreateTrackData => {
  const artistNames = spotifyTrack.artists.map((a) => a.name).join(', ');
  const albumImage =
    spotifyTrack.album.images?.find((img) => img.height >= 300)?.url ||
    spotifyTrack.album.images?.[0]?.url;

  return {
    external_id: spotifyTrack.id,
    provider: 'spotify',
    name: spotifyTrack.name,
    artist: artistNames,
    album: spotifyTrack.album.name,
    duration: spotifyTrack.duration_ms ? Math.floor(spotifyTrack.duration_ms / 1000) : undefined,
    image_url: albumImage,
    preview_url: spotifyTrack.preview_url || undefined,
    external_url: spotifyTrack.external_urls.spotify,
    metadata: {
      popularity: spotifyTrack.popularity,
      explicit: spotifyTrack.explicit,
      album_id: spotifyTrack.album.id,
      artist_ids: spotifyTrack.artists.map((a) => a.id),
      release_date: spotifyTrack.album.release_date,
    },
  };
};

/**
 * Normalize Spotify playlist data to our unified Playlist format
 */
export const normalizeSpotifyPlaylist = (
  spotifyPlaylist: SpotifyPlaylistData,
  userId: string
): CreatePlaylistData => {
  const playlistImage =
    spotifyPlaylist.images?.find((img) => img.height >= 300)?.url ||
    spotifyPlaylist.images?.[0]?.url;

  return {
    external_id: spotifyPlaylist.id,
    user_id: userId,
    provider: 'spotify',
    name: spotifyPlaylist.name,
    description: spotifyPlaylist.description || undefined,
    image_url: playlistImage,
    owner: spotifyPlaylist.owner.display_name || spotifyPlaylist.owner.id,
    track_count: spotifyPlaylist.tracks?.total || 0,
    external_url: spotifyPlaylist.external_urls.spotify,
    snapshot_id: spotifyPlaylist.snapshot_id,
  };
};

/**
 * Normalize track from any provider
 * Placeholder for other providers (Apple Music, YouTube Music, SoundCloud)
 */
export const normalizeTrackFromProvider = (
  provider: MusicProvider,
  providerTrackData: any
): CreateTrackData => {
  switch (provider) {
    case 'spotify':
      return normalizeSpotifyTrack(providerTrackData as SpotifyTrackData);
    case 'apple-music':
      // TODO: Implement Apple Music normalization
      throw new Error('Apple Music normalization not yet implemented');
    case 'youtube-music':
      // TODO: Implement YouTube Music normalization
      throw new Error('YouTube Music normalization not yet implemented');
    case 'soundcloud':
      return normalizeSoundCloudTrack(providerTrackData as SoundCloudTrackData);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
};

// SoundCloud track normalization
// Based on SoundCloud API: https://developers.soundcloud.com/docs/api/explorer/
export interface SoundCloudTrackData {
  id: number;
  title: string; // Track title
  user: {
    username: string;
    id: number;
    permalink?: string;
  };
  artwork_url?: string | null; // Track artwork
  duration: number; // Duration in milliseconds
  permalink_url?: string; // SoundCloud track URL
  stream_url?: string | null; // Stream URL (requires authentication)
  created_at?: string; // ISO date string
  genre?: string | null;
  description?: string | null;
  kind?: string; // "track"
  waveform_url?: string | null;
  playback_count?: number;
  favoritings_count?: number;
}

export const normalizeSoundCloudTrack = (soundcloudTrack: SoundCloudTrackData): CreateTrackData => {
  // SoundCloud uses 'large' image size by default, but we can request better quality
  const imageUrl = soundcloudTrack.artwork_url
    ? soundcloudTrack.artwork_url.replace('large', 't500x500')
    : undefined;

  // SoundCloud duration is in milliseconds, convert to seconds
  const durationInSeconds = soundcloudTrack.duration
    ? Math.floor(soundcloudTrack.duration / 1000)
    : undefined;

  return {
    external_id: String(soundcloudTrack.id),
    provider: 'soundcloud',
    name: soundcloudTrack.title,
    artist: soundcloudTrack.user.username,
    album: undefined, // SoundCloud doesn't have albums
    duration: durationInSeconds,
    image_url: imageUrl,
    preview_url: soundcloudTrack.stream_url || undefined,
    external_url: soundcloudTrack.permalink_url,
    metadata: {
      genre: soundcloudTrack.genre,
      description: soundcloudTrack.description,
      created_at: soundcloudTrack.created_at,
    },
  };
};

// SoundCloud playlist normalization
// Based on SoundCloud API: https://developers.soundcloud.com/docs/api/explorer/
// Playlists in SoundCloud API are also called "sets"
export interface SoundCloudPlaylistData {
  id: number;
  title: string; // Playlist name
  description?: string | null;
  artwork_url?: string | null;
  user: {
    username: string;
    id: number;
    permalink?: string;
  };
  track_count?: number; // Number of tracks in playlist
  tracks?: any[]; // Tracks array (may be included in playlist response)
  permalink_url?: string;
  created_at?: string;
  kind?: string; // "playlist" or "set"
}

export const normalizeSoundCloudPlaylist = (
  soundcloudPlaylist: SoundCloudPlaylistData,
  userId: string
): CreatePlaylistData => {
  // SoundCloud uses 'large' image size by default, but we can request it
  const imageUrl = soundcloudPlaylist.artwork_url
    ? soundcloudPlaylist.artwork_url.replace('large', 't500x500')
    : undefined;

  return {
    external_id: String(soundcloudPlaylist.id),
    user_id: userId,
    provider: 'soundcloud',
    name: soundcloudPlaylist.title,
    description: soundcloudPlaylist.description || undefined,
    image_url: imageUrl,
    owner: soundcloudPlaylist.user.username,
    track_count: soundcloudPlaylist.track_count || 0,
    external_url: soundcloudPlaylist.permalink_url,
  };
};

/**
 * Normalize playlist from any provider
 */
export const normalizePlaylistFromProvider = (
  provider: MusicProvider,
  providerPlaylistData: any,
  userId: string
): CreatePlaylistData => {
  switch (provider) {
    case 'spotify':
      return normalizeSpotifyPlaylist(providerPlaylistData as SpotifyPlaylistData, userId);
    case 'apple-music':
      // TODO: Implement Apple Music normalization
      throw new Error('Apple Music normalization not yet implemented');
    case 'youtube-music':
      // TODO: Implement YouTube Music normalization
      throw new Error('YouTube Music normalization not yet implemented');
    case 'soundcloud':
      return normalizeSoundCloudPlaylist(providerPlaylistData as SoundCloudPlaylistData, userId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
};
