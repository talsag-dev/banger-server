import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  createPost,
  getPosts,
  getFeedPosts,
  getUserPosts,
  getUserLikedPosts,
  toggleLike,
  updatePost,
  deletePost,
  getPostById,
  createOrUpdateTrack,
  findTrackByProviderId,
  findMusicIntegration,
} from '../database/queries';
import { Post } from '../database/types';
import { normalizeSpotifyTrack } from '../database/normalize';
import { SpotifyAuthService } from '../services/SpotifyAuthService';

// Helper to detect platform from URL
const detectPlatform = (
  url?: string
): 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud' => {
  if (!url) return 'spotify';
  const lower = url.toLowerCase();
  if (lower.includes('spotify')) return 'spotify';
  if (lower.includes('apple') || lower.includes('music.apple')) return 'apple-music';
  if (lower.includes('youtube')) return 'youtube-music';
  if (lower.includes('soundcloud')) return 'soundcloud';
  return 'spotify';
};

// Helper to transform DB post to frontend format
// Supports both normalized tracks (from JOIN) and legacy denormalized data
const transformPost = (dbPost: any) => {
  // Check if we have normalized track data from JOIN (track_name_new, etc.)
  // track_ref_id means we successfully joined with tracks table
  const hasNormalizedTrack = !!dbPost.track_ref_id;

  // Use normalized track data if available, otherwise fall back to old columns
  const trackId = hasNormalizedTrack
    ? dbPost.track_external_id || dbPost.track_id
    : dbPost.track_id;
  const trackName = hasNormalizedTrack
    ? dbPost.track_name_new || dbPost.track_name
    : dbPost.track_name;
  const artistName = hasNormalizedTrack
    ? dbPost.artist_name_new || dbPost.artist_name
    : dbPost.artist_name;
  const albumName = hasNormalizedTrack
    ? dbPost.album_name_new || dbPost.album_name
    : dbPost.album_name;
  const trackImage = hasNormalizedTrack
    ? dbPost.track_image_new || dbPost.track_image
    : dbPost.track_image;
  const trackPreviewUrl = hasNormalizedTrack
    ? dbPost.track_preview_url_new || dbPost.track_preview_url
    : dbPost.track_preview_url;
  const trackExternalUrl = hasNormalizedTrack
    ? dbPost.track_external_url_new || dbPost.track_external_url
    : dbPost.track_external_url;
  const trackDuration = hasNormalizedTrack
    ? dbPost.track_duration_new ?? dbPost.track_duration ?? 0
    : dbPost.track_duration ?? 0;
  const trackProvider = hasNormalizedTrack
    ? dbPost.track_provider_new || dbPost.track_provider || detectPlatform(trackExternalUrl)
    : dbPost.track_provider || detectPlatform(trackExternalUrl);

  return {
    id: dbPost.id.toString(),
    userId: dbPost.user_id.toString(),
    username: dbPost.username || dbPost.user_id.toString(),
    track: {
      id: trackId,
      title: trackName,
      artist: artistName,
      album: albumName || 'Unknown Album',
      albumCover: trackImage || 'https://via.placeholder.com/300?text=No+Image',
      duration: trackDuration || 0,
      platform: trackProvider as 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud',
      externalUrl: trackExternalUrl || '',
      previewUrl: trackPreviewUrl || undefined,
    },
    feeling: dbPost.feeling || undefined,
    caption: dbPost.caption || undefined,
    isCurrentlyListening: dbPost.is_currently_listening,
    timestamp:
      dbPost.created_at instanceof Date
        ? dbPost.created_at.toISOString()
        : new Date(dbPost.created_at).toISOString(),
    reactions: (dbPost.reactions || []).map((r: any) => ({
      id: r.id?.toString() || '',
      userId: r.user_id?.toString() || r.user_id || '',
      type: r.reaction_type || 'like',
      timestamp:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString(),
    })),
    comments: [],
  };
};

export const postsController = {
  // Feed endpoint - returns posts from followed users + own posts (requires auth)
  feed: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const dbPosts = await getFeedPosts(userId, limit, offset);
      const posts = dbPosts.map(transformPost);
      return res.status(200).json({ success: true, data: { posts } });
    } catch (error: any) {
      console.error('Feed error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch feed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },

  // All posts endpoint - returns all posts (no auth required, for public browsing)
  all: async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const dbPosts = await getPosts(limit, offset);
      const posts = dbPosts.map(transformPost);
      return res.status(200).json({ success: true, data: { posts } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch posts' });
    }
  },

  byUser: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;
      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID format' });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const dbPosts = await getUserPosts(userId, limit, offset);

      // Transform posts, catching any transformation errors
      const posts = dbPosts.map((post: any) => {
        try {
          return transformPost(post);
        } catch (transformError: any) {
          console.error('Error transforming post:', transformError, 'Post data:', post);
          // Return a minimal post structure to prevent complete failure
          return {
            id: post.id?.toString() || '',
            userId: post.user_id?.toString() || '',
            username: post.username || 'Unknown',
            track: {
              id: post.track_id || post.track_external_id || '',
              title: post.track_name || 'Unknown Track',
              artist: post.artist_name || 'Unknown Artist',
              album: post.album_name || 'Unknown Album',
              albumCover: post.track_image || 'https://via.placeholder.com/300?text=No+Image',
              duration: post.track_duration || 0,
              platform: 'spotify' as const,
              externalUrl: post.track_external_url || '',
              previewUrl: post.track_preview_url || undefined,
            },
            feeling: post.feeling || undefined,
            caption: post.caption || undefined,
            isCurrentlyListening: post.is_currently_listening || false,
            timestamp: post.created_at
              ? new Date(post.created_at).toISOString()
              : new Date().toISOString(),
            reactions: post.reactions || [],
            comments: [],
          };
        }
      });

      return res.status(200).json({ success: true, data: { posts } });
    } catch (error: any) {
      console.error('Error fetching user posts:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail,
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user posts',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },

  likedByUser: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.params.userId;
      // Validate UUID format (basic check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID format' });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const dbPosts = await getUserLikedPosts(userId, limit, offset);
      const posts = dbPosts.map(transformPost);
      return res.status(200).json({ success: true, data: { posts } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch liked posts' });
    }
  },

  create: async (req: any, res: Response) => {
    try {
      const {
        track_id,
        track_name,
        artist_name,
        album_name,
        track_image,
        track_preview_url,
        track_external_url,
        track_duration,
        feeling,
        caption,
        is_currently_listening,
        provider, // Optional: provider from frontend (defaults to detecting from URL)
      } = req.body;

      if (!track_id || !track_name || !artist_name) {
        return res
          .status(400)
          .json({ success: false, error: 'Missing required track information' });
      }
      if (!req.user?.dbUser?.id) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      // Normalize track data and create/update in tracks table
      const detectedProvider = provider || detectPlatform(track_external_url);

      // Check if track already exists in database
      const existingTrack = await findTrackByProviderId(detectedProvider, track_id);

      let track: any;

      if (existingTrack) {
        // Track exists - use it directly (no need to update unless we want fresh data)
        track = existingTrack;
      } else {
        // Track doesn't exist - fetch full data from Spotify API if available
        let spotifyTrackData = null;
        if (detectedProvider === 'spotify') {
          try {
            const userId = req.user.dbUser.id;
            const spotifyIntegration = await findMusicIntegration(userId, 'spotify');

            if (
              spotifyIntegration?.access_token &&
              spotifyIntegration.has_valid_token &&
              spotifyIntegration.is_connected
            ) {
              const spotifyAuthService = new SpotifyAuthService();
              spotifyTrackData = await spotifyAuthService.getTrack(
                track_id,
                spotifyIntegration.access_token
              );
            }
          } catch (error: any) {
            // If fetching from Spotify fails, fall back to provided data
            console.warn(
              'Failed to fetch track from Spotify API, using provided data:',
              error.message
            );
          }
        }

        // Use fetched track data if available, otherwise construct from provided data
        const normalizedTrackData = normalizeSpotifyTrack(
          spotifyTrackData || {
            id: track_id,
            name: track_name,
            artists: artist_name.split(',').map((name: string) => ({ id: '', name: name.trim() })),
            album: {
              id: '',
              name: album_name || 'Unknown Album',
              images: track_image ? [{ url: track_image, height: 300, width: 300 }] : [],
            },
            duration_ms: track_duration ? track_duration * 1000 : 0,
            external_urls: { spotify: track_external_url || '' },
            preview_url: track_preview_url || null,
          }
        );

        // Insert new track to normalized tracks table
        track = await createOrUpdateTrack(normalizedTrackData);
      }

      // Create post with FK to normalized track
      const postData = {
        user_id: req.user.dbUser.id,
        track_id: track.id, // Use FK to normalized track
        track_provider: detectedProvider,
        // Keep old columns for backward compatibility during migration
        track_name,
        artist_name,
        album_name,
        track_image,
        track_preview_url,
        track_external_url,
        track_duration,
        feeling,
        caption,
        is_currently_listening: is_currently_listening || false,
      };

      const dbPost = await createPost(postData);
      const post = transformPost(dbPost);
      return res.status(200).json({ success: true, data: { post } });
    } catch (error: any) {
      console.error('Error creating post:', error);
      return res.status(500).json({ success: false, error: 'Failed to create post' });
    }
  },

  toggleLike: async (req: any, res: Response) => {
    try {
      const postId = req.params.postId;
      const userId = req.user?.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      // Verify post exists
      const existingPost = await getPostById(postId);
      if (!existingPost) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      const result = await toggleLike(userId, postId);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to toggle like' });
    }
  },

  update: async (req: any, res: Response) => {
    try {
      const postId = req.params.postId;
      const userId = req.user?.dbUser?.id;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { feeling, caption } = req.body;

      // Verify post exists and belongs to user
      const existingPost = await getPostById(postId);
      if (!existingPost) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      if (existingPost.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      const updatedPost = await updatePost(postId, userId, { feeling, caption });
      const post = transformPost(updatedPost);
      return res.status(200).json({ success: true, data: { post } });
    } catch (error: any) {
      if (error.message === 'Post not found or unauthorized') {
        return res.status(404).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: 'Failed to update post' });
    }
  },

  delete: async (req: any, res: Response) => {
    try {
      const postId = req.params.postId;
      const userId = req.user?.dbUser?.id;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      // Verify post exists and belongs to user
      const existingPost = await getPostById(postId);
      if (!existingPost) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      if (existingPost.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      await deletePost(postId, userId);
      return res.status(200).json({ success: true, data: { message: 'Post deleted' } });
    } catch (error: any) {
      if (error.message === 'Post not found or unauthorized') {
        return res.status(404).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: 'Failed to delete post' });
    }
  },
};
