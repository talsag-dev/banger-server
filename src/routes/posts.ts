import express from 'express';
import { auth, AuthenticatedRequest } from '../middleware/auth';
import { postsController } from '../controllers/postsController';

const router = express.Router();

// Get all posts (feed)
router.get('/', postsController.feed as any);

// Get posts by user
router.get('/user/:userId', auth, postsController.byUser as any);

// Get liked posts by user
router.get('/user/:userId/liked', auth, postsController.likedByUser as any);

// Create a new post
router.post('/', auth, postsController.create as any);

// Toggle like on a post
router.post('/:postId/like', auth, postsController.toggleLike as any);

// Update a post
router.put('/:postId', auth, postsController.update as any);

// Delete a post
router.delete('/:postId', auth, postsController.delete as any);

export { router as postsRouter };
