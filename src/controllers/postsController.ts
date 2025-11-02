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
} from '../database/queries';
import { Post } from '../database/types';

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
const transformPost = (dbPost: Post) => ({
  id: dbPost.id.toString(),
  userId: dbPost.user_id.toString(),
  username: dbPost.username || dbPost.user_id.toString(), // Fallback to userId if username is null
  track: {
    id: dbPost.track_id,
    title: dbPost.track_name,
    artist: dbPost.artist_name,
    album: dbPost.album_name || 'Unknown Album',
    albumCover: dbPost.track_image || 'https://via.placeholder.com/300?text=No+Image',
    duration: dbPost.track_duration || 0, // in seconds
    platform: detectPlatform(dbPost.track_external_url),
    externalUrl: dbPost.track_external_url || '',
    previewUrl: dbPost.track_preview_url || undefined,
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
});

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
      return res.status(500).json({ success: false, error: 'Failed to fetch feed' });
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
      const posts = dbPosts.map(transformPost);
      return res.status(200).json({ success: true, data: { posts } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch user posts' });
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
      } = req.body;

      if (!track_id || !track_name || !artist_name) {
        return res
          .status(400)
          .json({ success: false, error: 'Missing required track information' });
      }
      if (!req.user?.dbUser?.id) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const postData = {
        user_id: req.user.dbUser.id,
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
        is_currently_listening: is_currently_listening || false,
      };

      const dbPost = await createPost(postData);
      const post = transformPost(dbPost);
      return res.status(200).json({ success: true, data: { post } });
    } catch (error: any) {
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
