import express from 'express';
import jwt from 'jsonwebtoken';
import { auth, AuthenticatedRequest } from '../middleware/auth';
import { authController } from '../controllers/authController';

const router = express.Router();

// Email Authentication
router.post('/signup', authController.signup as any);

router.post('/login', authController.login as any);

// OAuth Authentication Routes
router.get('/google', authController.googleAuthUrl as any);

router.post('/google/callback', authController.googleCallback as any);

router.get('/apple', authController.appleAuthUrl as any);

router.post('/apple/callback', authController.appleCallback as any);

// Password Reset
router.post('/forgot-password', authController.forgotPassword as any);

router.post('/reset-password', authController.resetPassword as any);

// Music Integration Routes
router.get('/integrations/spotify', authController.integrationsSpotifyAuthUrl as any);

// SoundCloud: return auth URL (frontend will redirect)
router.get(
  '/integrations/soundcloud/connect',
  authController.integrationsSoundCloudAuthUrl as any
);

router.post(
  '/integrations/spotify/connect',
  auth,
  authController.integrationsSpotifyConnect as any
);

router.post(
  '/integrations/soundcloud/connect',
  auth,
  authController.integrationsSoundCloudConnect as any
);

router.post(
  '/integrations/:provider/disconnect',
  auth,
  authController.integrationsDisconnect as any
);

router.get('/integrations', auth, authController.integrationsList as any);

// User Profile Routes
router.get('/me', auth, authController.me as any);

// Logout
router.post('/logout', authController.logout as any);

// Check authentication status
router.get('/status', authController.status as any);

export { router as authRouter };
