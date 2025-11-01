import express from 'express';
import { auth, AuthenticatedRequest } from '../middleware/auth';
import { usersController } from '../controllers/usersController';

const router = express.Router();

// Get user profile (works for any user, including current user)
router.get('/:userId/profile', auth, usersController.getProfile as any);

// Get user playlists from all connected music services
router.get('/:userId/playlists', auth, usersController.getPlaylists as any);

export { router as usersRouter };
