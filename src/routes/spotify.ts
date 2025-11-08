import express from 'express';
import { auth, AuthenticatedRequest } from '../middleware/auth';
import { spotifyController } from '../controllers/spotifyController';

const router = express.Router();
router.get('/status', spotifyController.status as any);

// Start Spotify OAuth flow (requires authenticated user to bind state to userId)
router.get('/auth', auth, spotifyController.startAuth as any);

// Handle Spotify OAuth callback (complete OAuth flow on backend)
router.get('/callback', spotifyController.callback as any);

// Get Spotify user profile (requires authentication - auth middleware validates integration tokens)
router.get('/profile', auth, spotifyController.profile as any);

// Get user's currently playing track (requires authentication)
router.get('/currently-playing', auth, spotifyController.currentlyPlaying as any);

// Search Spotify tracks (requires authentication)
router.get('/search', auth, spotifyController.search as any);

// Get user's top tracks (requires authentication)
router.get('/top-tracks', auth, spotifyController.topTracks as any);

// Get user's playlists (requires authentication)
router.get('/playlists', auth, spotifyController.playlists as any);

export { router as spotifyRouter };
