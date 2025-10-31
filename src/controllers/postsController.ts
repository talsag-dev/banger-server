import { Request, Response } from 'express';
import { createPost, getPosts, getUserPosts, toggleLike } from '../database/queries';

export const postsController = {
  feed: async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const posts = await getPosts(limit, offset);
      return res.status(200).json({ success: true, data: { posts } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch posts' });
    }
  },

  byUser: async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const posts = await getUserPosts(userId, limit, offset);
      return res.status(200).json({ success: true, data: { posts } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch user posts' });
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
        feeling,
        caption,
        is_currently_listening,
      } = req.body;

      if (!track_id || !track_name || !artist_name) {
        return res.status(400).json({ success: false, error: 'Missing required track information' });
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
        feeling,
        caption,
        is_currently_listening: is_currently_listening || false,
      };

      const post = await createPost(postData);
      return res.status(200).json({ success: true, data: { post } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to create post' });
    }
  },

  toggleLike: async (req: any, res: Response) => {
    try {
      const postId = parseInt(req.params.postId);
      const userId = req.user?.dbUser?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }
      const result = await toggleLike(userId, postId);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to toggle like' });
    }
  },
};


