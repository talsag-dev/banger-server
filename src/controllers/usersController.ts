import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  findUserById,
  updateUser,
  getUserPostCount,
  findMusicIntegration,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowersCount,
  getFollowingCount,
  searchUsers,
  createOrUpdatePlaylist,
  getUserPlaylists,
  findPlaylistByExternalId,
  getPlaylistTracksWithDetails,
  createOrUpdateTrack,
  syncPlaylistTracks,
  findTrackByProviderId,
} from '../database/queries';
import { musicIntegrationService } from '../services/MusicIntegrationService';
import { normalizeSpotifyPlaylist, normalizeSpotifyTrack } from '../database/normalize';
import { SpotifyAuthService } from '../services/SpotifyAuthService';
import axios from 'axios';

interface Playlist {
  id: string;
  name: string;
  description?: string;
  image?: string;
  owner: string;
  provider: 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';
  trackCount: number;
  externalUrl?: string;
}

export const usersController = {
  getProfile: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;
      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID format' });
      }
      const user = await findUserById(userId);

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Get music integrations
      const integrations = await musicIntegrationService.getUserIntegrations(userId);

      // Get post count
      const postsCount = await getUserPostCount(userId);

      // Get followers/following counts
      const followersCount = await getFollowersCount(userId);
      const followingCount = await getFollowingCount(userId);

      // Check if current user is following this profile user
      const currentUserId = req.user?.dbUser?.id;
      let isFollowingUser = false;
      if (currentUserId && currentUserId !== userId) {
        isFollowingUser = await isFollowing(currentUserId, userId);
      }

      // Build connected platforms array
      const connectedPlatforms = [
        {
          type: 'spotify' as const,
          isConnected: integrations.find((i) => i.provider === 'spotify')?.is_connected || false,
          showCurrentlyListening: true,
        },
        {
          type: 'apple-music' as const,
          isConnected:
            integrations.find((i) => i.provider === 'apple-music')?.is_connected || false,
          showCurrentlyListening: true,
        },
        {
          type: 'youtube-music' as const,
          isConnected:
            integrations.find((i) => i.provider === 'youtube-music')?.is_connected || false,
          showCurrentlyListening: true,
        },
        {
          type: 'soundcloud' as const,
          isConnected: integrations.find((i) => i.provider === 'soundcloud')?.is_connected || false,
          showCurrentlyListening: true,
        },
      ];

      const profile = {
        success: true,
        data: {
          user: {
            id: user.id.toString(),
            email: user.email,
            displayName: user.display_name,
            avatar: user.avatar_url,
            authProvider: user.auth_provider,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          },
          id: user.id.toString(),
          username: user.username || user.email?.split('@')[0] || 'user',
          displayName: user.display_name || user.username || 'User',
          bio: user.bio,
          avatar: user.avatar_url,
          followersCount,
          followingCount,
          postsCount,
          isFollowing: isFollowingUser,
          spotifyConnected:
            integrations.find((i) => i.provider === 'spotify')?.is_connected || false,
          appleConnected:
            integrations.find((i) => i.provider === 'apple-music')?.is_connected || false,
          joinedDate: user.created_at.toISOString().split('T')[0],
          connectedPlatforms,
          settings: {
            notifications: {
              email: true,
              push: true,
            },
            profileVisibility: 'public' as const,
          },
        },
      };

      return res.status(200).json(profile);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
    }
  },

  getPlaylists: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;
      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID format' });
      }

      // Check database first for cached playlists
      const cachedPlaylists = await getUserPlaylists(userId);

      // Check if we need to sync (for now, always sync - TODO: implement smart sync logic)
      const shouldSync = true; // TODO: Check last_synced_at and determine if sync needed

      if (shouldSync) {
        // Fetch Spotify playlists from API and normalize/store them
        const spotifyIntegration = await findMusicIntegration(userId, 'spotify');
        if (
          spotifyIntegration?.is_connected &&
          spotifyIntegration.access_token &&
          spotifyIntegration.has_valid_token
        ) {
          try {
            const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/playlists', {
              headers: { Authorization: `Bearer ${spotifyIntegration.access_token}` },
              params: { limit: 50 },
            });

            // Normalize and upsert each playlist to database
            for (const spotifyPlaylist of spotifyResponse.data.items || []) {
              const normalizedPlaylist = normalizeSpotifyPlaylist(spotifyPlaylist, userId);
              await createOrUpdatePlaylist(normalizedPlaylist);
            }
          } catch (error: any) {
            console.error('Error syncing Spotify playlists:', error);
            // Continue with cached data if API fails
          }
        }

        // TODO: Fetch Apple Music playlists when integration is available
        // TODO: Fetch YouTube Music playlists when integration is available
        // TODO: Fetch SoundCloud playlists when integration is available
      }

      // Return playlists from database (now synced)
      const playlists = await getUserPlaylists(userId);

      // Transform to frontend format
      const frontendPlaylists: Playlist[] = playlists.map((p) => ({
        id: p.external_id, // Use external_id for frontend compatibility
        name: p.name,
        description: p.description,
        image: p.image_url,
        owner: p.owner || 'Unknown',
        provider: p.provider,
        trackCount: p.track_count,
        externalUrl: p.external_url,
      }));

      return res.status(200).json({
        success: true,
        data: { playlists: frontendPlaylists },
      });
    } catch (error: any) {
      console.error('Error fetching playlists:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch playlists' });
    }
  },

  getPlaylistTracks: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;
      const playlistId = req.params.playlistId; // This is the external_id (Spotify playlist ID)

      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID format' });
      }

      // Find playlist by external_id and user_id
      const playlist = await findPlaylistByExternalId(playlistId, userId);
      if (!playlist) {
        return res.status(404).json({ success: false, error: 'Playlist not found' });
      }

      // Check if tracks exist in database
      const cachedTracks = await getPlaylistTracksWithDetails(playlist.id);

      // If no cached tracks or we want fresh data, fetch from Spotify API
      let shouldSync = cachedTracks.length === 0;
      
      // Optional: Check if sync is needed based on last_synced_at (for future optimization)
      // For now, we'll sync if no tracks exist

      if (shouldSync && playlist.provider === 'spotify') {
        const spotifyIntegration = await findMusicIntegration(userId, 'spotify');
        if (
          spotifyIntegration?.is_connected &&
          spotifyIntegration.access_token &&
          spotifyIntegration.has_valid_token
        ) {
          try {
            const spotifyAuthService = new SpotifyAuthService();
            // Fetch all tracks from Spotify (handles pagination)
            const spotifyTracks = await spotifyAuthService.getAllPlaylistTracks(
              playlist.external_id,
              spotifyIntegration.access_token
            );

            // Normalize and store each track
            const trackIds: Array<{ track_id: string; position: number }> = [];
            
            for (let i = 0; i < spotifyTracks.length; i++) {
              const spotifyTrack = spotifyTracks[i];
              
              // Check if track already exists
              let track = await findTrackByProviderId('spotify', spotifyTrack.id);
              
              if (!track) {
                // Normalize and create track
                const normalizedTrackData = normalizeSpotifyTrack(spotifyTrack);
                track = await createOrUpdateTrack(normalizedTrackData);
              }

              trackIds.push({
                track_id: track.id,
                position: i,
              });
            }

            // Sync tracks to playlist
            await syncPlaylistTracks(playlist.id, trackIds);

            // Fetch updated tracks with details
            const updatedTracks = await getPlaylistTracksWithDetails(playlist.id);
            cachedTracks.length = 0;
            cachedTracks.push(...updatedTracks);
          } catch (error: any) {
            console.error('Error syncing playlist tracks from Spotify:', error);
            // If we have cached tracks, return them even if sync failed
            if (cachedTracks.length === 0) {
              return res.status(500).json({
                success: false,
                error: 'Failed to fetch playlist tracks',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
              });
            }
          }
        }
      }

      // Transform tracks to frontend format
      const frontendTracks = cachedTracks.map((track) => ({
        id: track.external_id || track.id,
        title: track.name,
        artist: track.artist,
        album: track.album || 'Unknown Album',
        duration: track.duration || 0,
        albumCover: track.image_url || 'https://via.placeholder.com/300?text=No+Image',
        platform: track.provider as 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud',
        externalUrl: track.external_url || '',
        previewUrl: track.preview_url || undefined,
      }));

      // Transform playlist to frontend format
      const frontendPlaylist = {
        id: playlist.external_id,
        name: playlist.name,
        description: playlist.description,
        image: playlist.image_url,
        owner: playlist.owner || 'Unknown',
        provider: playlist.provider,
        trackCount: playlist.track_count,
        externalUrl: playlist.external_url,
      };

      return res.status(200).json({
        success: true,
        data: {
          playlist: frontendPlaylist,
          tracks: frontendTracks,
        },
      });
    } catch (error: any) {
      console.error('Error fetching playlist tracks:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch playlist tracks',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },

  follow: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const followingId = req.params.userId;
      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(followingId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID format' });
      }

      const followerId = req.user?.dbUser?.id;
      if (!followerId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      if (followerId === followingId) {
        return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
      }

      // Check if user exists
      const user = await findUserById(followingId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      await followUser(followerId, followingId);
      const followersCount = await getFollowersCount(followingId);

      return res.status(200).json({
        success: true,
        data: {
          isFollowing: true,
          followersCount,
        },
      });
    } catch (error: any) {
      console.error('Follow error:', error);
      return res.status(500).json({ success: false, error: 'Failed to follow user' });
    }
  },

  unfollow: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const followingId = req.params.userId;
      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(followingId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID format' });
      }

      const followerId = req.user?.dbUser?.id;
      if (!followerId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      await unfollowUser(followerId, followingId);
      const followersCount = await getFollowersCount(followingId);

      return res.status(200).json({
        success: true,
        data: {
          isFollowing: false,
          followersCount,
        },
      });
    } catch (error: any) {
      console.error('Unfollow error:', error);
      return res.status(500).json({ success: false, error: 'Failed to unfollow user' });
    }
  },

  updateProfile: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { username, displayName, bio } = req.body;

      // Only update fields that are provided
      const updateData: {
        username?: string;
        display_name?: string;
        bio?: string;
      } = {};

      if (username !== undefined) {
        if (!username.trim()) {
          return res.status(400).json({ success: false, error: 'Username cannot be empty' });
        }
        updateData.username = username.trim();
      }

      if (displayName !== undefined) {
        updateData.display_name = displayName.trim() || null;
      }

      if (bio !== undefined) {
        updateData.bio = bio.trim() || null;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      const updatedUser = await updateUser(userId, updateData);

      if (!updatedUser) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            displayName: updatedUser.display_name,
            avatar: updatedUser.avatar_url,
            bio: updatedUser.bio,
            authProvider: updatedUser.auth_provider,
          },
        },
      });
    } catch (error: any) {
      console.error('Update profile error:', error);
      return res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
  },

  search: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { q, limit = 20 } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing search query',
        });
      }

      const users = await searchUsers(q, parseInt(limit as string) || 20);

      return res.status(200).json({
        success: true,
        data: {
          users: users.map((user) => ({
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.display_name,
            avatar: user.avatar_url,
            bio: user.bio,
          })),
        },
      });
    } catch (error: any) {
      console.error('Search users error:', error);
      return res.status(500).json({ success: false, error: 'Failed to search users' });
    }
  },
};
