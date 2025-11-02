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
} from '../database/queries';
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
