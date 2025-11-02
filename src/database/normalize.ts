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
      // TODO: Implement SoundCloud normalization
      throw new Error('SoundCloud normalization not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
};

/**
 * Normalize playlist from any provider
 * Placeholder for other providers (Apple Music, YouTube Music, SoundCloud)
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
      // TODO: Implement SoundCloud normalization
      throw new Error('SoundCloud normalization not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
};
