import express from 'express';
import { auth, AuthenticatedRequest } from '../middleware/auth';
import { postsController } from '../controllers/postsController';

const router = express.Router();

// Get all posts (feed)
router.get('/', postsController.feed as any);

// Get posts by user
router.get('/user/:userId', postsController.byUser as any);

// Create a new post
router.post('/', auth, postsController.create as any);

// Toggle like on a post
router.post('/:postId/like', auth, postsController.toggleLike as any);

export { router as postsRouter };
