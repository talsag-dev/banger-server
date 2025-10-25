import express from 'express';
import jwt from 'jsonwebtoken';
import { SpotifyAuthService } from '../services/SpotifyAuthService';
import { auth, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();
const spotifyAuth = new SpotifyAuthService();

// Check Spotify configuration status
router.get('/status', (req, res) => {
  res.json({
    configured: spotifyAuth.isSpotifyConfigured(),
    message: spotifyAuth.isSpotifyConfigured()
      ? 'Spotify is properly configured'
      : 'Spotify configuration missing. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI environment variables.',
  });
});

// Start Spotify OAuth flow
router.get('/auth', async (req, res) => {
  try {
    if (!spotifyAuth.isSpotifyConfigured()) {
      return res.status(503).json({
        error: 'Spotify not configured',
        message:
          'Spotify authentication is not available. Please configure SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.',
      });
    }

    const state = jwt.sign(
      { timestamp: Date.now(), nonce: Math.random().toString(36) },
      process.env.JWT_SECRET!,
      { expiresIn: '10m' }
    );

    const authUrl = spotifyAuth.getAuthorizationUrl(state);

    res.json({
      authUrl,
      state,
      message: 'Redirect user to authUrl to begin Spotify authentication',
    });
  } catch (error: any) {
    console.error('Error initiating Spotify auth:', error.message);
    res.status(500).json({
      error: 'Failed to initiate Spotify authentication',
      message: error.message,
    });
  }
});

// Handle Spotify OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('Spotify OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=${error}`);
    }

    if (!code || !state) {
      console.error('Missing code or state in callback');
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=missing_params`);
    }

    // Verify state parameter to prevent CSRF attacks
    try {
      jwt.verify(state as string, process.env.JWT_SECRET!);
    } catch {
      console.error('Invalid state parameter');
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=invalid_state`);
    }

    // Exchange authorization code for tokens
    const tokens = await spotifyAuth.exchangeCodeForTokens(code as string);
    const userProfile = await spotifyAuth.getUserProfile(tokens.access_token);

    // Create JWT token with user data and Spotify tokens
    const authToken = jwt.sign(
      {
        userId: userProfile.id,
        platform: 'spotify',
        spotifyTokens: tokens,
        userProfile: {
          id: userProfile.id,
          display_name: userProfile.display_name,
          email: userProfile.email,
          images: userProfile.images,
          country: userProfile.country,
        },
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Set HTTP-only cookie with the token
    res.cookie('auth_token', authToken, {
      httpOnly: true,
      secure: true, // ngrok uses HTTPS
      sameSite: 'none', // Allow cross-site requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect(`${process.env.FRONTEND_URL}/auth/success`);
  } catch (error: any) {
    console.error('Spotify auth callback error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?error=auth_failed`);
  }
});

// Get current user's Spotify profile
router.get('/profile', auth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.spotifyTokens) {
      return res.status(400).json({
        error: 'No Spotify tokens found',
        message: 'User is not authenticated with Spotify',
      });
    }

    const profile = await spotifyAuth.getUserProfile(req.user.spotifyTokens.access_token);
    res.json({
      profile,
      success: true,
    });
  } catch (error: any) {
    if (error.message === 'Spotify token expired') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please re-authenticate with Spotify',
      });
    }

    console.error('Error fetching Spotify profile:', error.message);
    res.status(500).json({
      error: 'Failed to fetch Spotify profile',
      message: error.message,
    });
  }
});

// Get user's currently playing track
router.get('/currently-playing', auth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.spotifyTokens) {
      return res.status(400).json({
        error: 'No Spotify tokens found',
        message: 'User is not authenticated with Spotify',
      });
    }

    const currentTrack = await spotifyAuth.getCurrentlyPlaying(req.user.spotifyTokens.access_token);
    res.json({
      track: currentTrack,
      isPlaying: !!currentTrack,
      success: true,
    });
  } catch (error: any) {
    if (error.message === 'Spotify token expired') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please re-authenticate with Spotify',
      });
    }

    console.error('Error fetching currently playing:', error.message);
    res.status(500).json({
      error: 'Failed to fetch currently playing track',
      message: error.message,
    });
  }
});

// Search Spotify tracks
router.get('/search', auth, async (req: AuthenticatedRequest, res) => {
  try {
    const { q, type = 'track', limit = 20 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: 'Missing search query',
        message: 'Please provide a search query (q parameter)',
      });
    }

    if (!req.user?.spotifyTokens) {
      return res.status(400).json({
        error: 'No Spotify tokens found',
        message: 'User is not authenticated with Spotify',
      });
    }

    const results = await spotifyAuth.search(
      q,
      type as string,
      parseInt(limit as string) || 20,
      req.user.spotifyTokens.access_token
    );

    res.json({
      results,
      query: q,
      type,
      success: true,
    });
  } catch (error: any) {
    if (error.message === 'Spotify token expired') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please re-authenticate with Spotify',
      });
    }

    console.error('Error searching Spotify:', error.message);
    res.status(500).json({
      error: 'Failed to search Spotify',
      message: error.message,
    });
  }
});

// Get user's top tracks
router.get('/top-tracks', auth, async (req: AuthenticatedRequest, res) => {
  try {
    const { time_range = 'medium_term', limit = 20 } = req.query;

    if (!req.user?.spotifyTokens) {
      return res.status(400).json({
        error: 'No Spotify tokens found',
        message: 'User is not authenticated with Spotify',
      });
    }

    const topTracks = await spotifyAuth.getUserTopTracks(
      req.user.spotifyTokens.access_token,
      time_range as string,
      parseInt(limit as string) || 20
    );

    res.json({
      tracks: topTracks,
      timeRange: time_range,
      success: true,
    });
  } catch (error: any) {
    if (error.message === 'Spotify token expired') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please re-authenticate with Spotify',
      });
    }

    console.error('Error fetching top tracks:', error.message);
    res.status(500).json({
      error: 'Failed to fetch top tracks',
      message: error.message,
    });
  }
});

export { router as spotifyRouter };
