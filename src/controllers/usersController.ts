import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { findUserById, getUserPostCount, findMusicIntegration } from '../database/queries';
import { musicIntegrationService } from '../services/MusicIntegrationService';
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
      const userId = parseInt(req.params.userId, 10);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID' });
      }
      const user = await findUserById(userId);

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Get music integrations
      const integrations = await musicIntegrationService.getUserIntegrations(userId);

      // Get post count
      const postsCount = await getUserPostCount(userId);

      // Get followers/following counts (placeholder - implement when follow system exists)
      const followersCount = 0; // TODO: Implement getFollowersCount query
      const followingCount = 0; // TODO: Implement getFollowingCount query

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
          isFollowing: false, // Always false for own profile
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
      const userId = parseInt(req.params.userId, 10);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID' });
      }

      const allPlaylists: Playlist[] = [];

      // Fetch Spotify playlists
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

          const spotifyPlaylists: Playlist[] = (spotifyResponse.data.items || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description || undefined,
            image: p.images?.[0]?.url,
            owner: p.owner?.display_name || p.owner?.id || 'Unknown',
            provider: 'spotify' as const,
            trackCount: p.tracks?.total || 0,
            externalUrl: p.external_urls?.spotify,
          }));

          allPlaylists.push(...spotifyPlaylists);
        } catch (error: any) {
          // Continue with other providers even if Spotify fails
        }
      }

      // TODO: Fetch Apple Music playlists when integration is available
      // TODO: Fetch YouTube Music playlists when integration is available
      // TODO: Fetch SoundCloud playlists when integration is available

      return res.status(200).json({
        success: true,
        data: { playlists: allPlaylists },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch playlists' });
    }
  },
};
