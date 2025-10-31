import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { SpotifyAuthService } from '../services/SpotifyAuthService';
import { musicIntegrationService } from '../services/MusicIntegrationService';
import { findMusicIntegration, findUserById } from '../database/queries';
import { config } from '../config';

const spotifyAuth = new SpotifyAuthService();

export const spotifyController = {
  status: (req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      data: {
        configured: spotifyAuth.isSpotifyConfigured(),
        message: spotifyAuth.isSpotifyConfigured()
          ? 'Spotify is properly configured'
          : 'Spotify configuration missing. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI environment variables.',
      },
    });
  },

  startAuth: (req: Request, res: Response) => {
    try {
      if (!spotifyAuth.isSpotifyConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Spotify not configured',
          message:
            'Spotify authentication is not available. Please configure SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.',
          code: 'SPOTIFY_NOT_CONFIGURED',
        });
      }

      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in to connect Spotify',
          code: 'AUTH_REQUIRED',
        });
      }

      const state = jwt.sign(
        {
          userId,
          timestamp: Date.now(),
          nonce: Math.random().toString(36),
        },
        config.jwtSecret,
        { expiresIn: '10m' }
      );

      const authUrl = spotifyAuth.getAuthorizationUrl(state);

      return res.status(200).json({
        success: true,
        data: {
          authUrl,
          state,
          message: 'Redirect user to authUrl to begin Spotify authentication',
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to initiate Spotify authentication',
        message: error.message,
        code: 'SPOTIFY_AUTH_START_FAILED',
      });
    }
  },

  callback: async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

      if (error) {
        return res.redirect(`${config.frontendUrl}/auth/error?error=${error}`);
      }

      if (!code || !state) {
        return res.redirect(`${config.frontendUrl}/auth/error?error=missing_params`);
      }

      let userIdFromState: number | null = null;
      try {
        const stateDecoded = jwt.verify(state, config.jwtSecret) as any;
        userIdFromState = stateDecoded.userId ?? null;
      } catch (err) {
        return res.redirect(`${config.frontendUrl}/auth/error?error=invalid_state`);
      }

      // Fallback to cookie if present
      let effectiveUserId: number | null = userIdFromState;
      const token = req.cookies?.auth_token;
      if (!effectiveUserId && token) {
        try {
          const decoded = jwt.verify(token, config.jwtSecret) as any;
          effectiveUserId = decoded.userId;
        } catch {}
      }

      if (!effectiveUserId) {
        return res.redirect(`${config.frontendUrl}/auth/error?error=auth_required`);
      }

      try {
        const userExists = await findUserById(effectiveUserId);
        if (!userExists) {
          return res.redirect(`${config.frontendUrl}/auth/error?error=user_not_found`);
        }

        const integration = await musicIntegrationService.connectSpotify(effectiveUserId, code);

        return res.redirect(`${config.frontendUrl}/auth/success`);
      } catch (authError) {
        return res.redirect(`${config.frontendUrl}/auth/error?error=auth_failed`);
      }
    } catch (e: any) {
      res.redirect(`${config.frontendUrl}/auth/error?error=callback_failed`);
    }
  },

  profile: async (req: any, res: Response) => {
    try {
      const spotifyIntegration = await findMusicIntegration(req.user!.userId, 'spotify');
      if (!spotifyIntegration?.access_token) {
        return res.status(401).json({
          success: false,
          error: 'Spotify not connected',
          message: 'User has not connected their Spotify account',
          code: 'SPOTIFY_NOT_CONNECTED',
        });
      }
      const profile = await spotifyAuth.getUserProfile(spotifyIntegration.access_token);
      return res.status(200).json({
        success: true,
        data: {
          profile: {
            id: profile.id,
            display_name: profile.display_name,
            email: profile.email,
            images: profile.images,
            followers: profile.followers,
            country: profile.country,
            product: profile.product,
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch Spotify profile',
        message: error.message,
        code: 'SPOTIFY_PROFILE_FAILED',
      });
    }
  },

  currentlyPlaying: async (req: any, res: Response) => {
    try {
      const spotifyIntegration = await findMusicIntegration(req.user!.userId, 'spotify');
      if (!spotifyIntegration?.access_token) {
        return res.status(400).json({
          success: false,
          error: 'No Spotify integration found',
          message: 'User has not connected their Spotify account',
          code: 'SPOTIFY_NOT_CONNECTED',
        });
      }
      const currentTrack = await spotifyAuth.getCurrentlyPlaying(spotifyIntegration.access_token);
      return res
        .status(200)
        .json({ success: true, data: { track: currentTrack, isPlaying: !!currentTrack } });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch currently playing track',
        message: error.message,
        code: 'SPOTIFY_CURRENTLY_PLAYING_FAILED',
      });
    }
  },

  search: async (req: any, res: Response) => {
    try {
      const { q, type = 'track', limit = 20 } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing search query',
          message: 'Please provide a search query (q parameter)',
          code: 'MISSING_QUERY',
        });
      }
      const spotifyIntegration = await findMusicIntegration(req.user!.userId, 'spotify');
      if (!spotifyIntegration?.access_token) {
        return res.status(400).json({
          success: false,
          error: 'No Spotify integration found',
          message: 'User has not connected their Spotify account',
          code: 'SPOTIFY_NOT_CONNECTED',
        });
      }
      const results = await spotifyAuth.search(
        q,
        type as string,
        parseInt(limit as string) || 20,
        spotifyIntegration.access_token
      );
      return res.status(200).json({ success: true, data: { results, query: q, type } });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to search Spotify',
        message: error.message,
        code: 'SPOTIFY_SEARCH_FAILED',
      });
    }
  },

  topTracks: async (req: any, res: Response) => {
    try {
      const { time_range = 'medium_term', limit = 20 } = req.query;
      const spotifyIntegration = await findMusicIntegration(req.user!.userId, 'spotify');
      if (!spotifyIntegration?.access_token) {
        return res.status(400).json({
          success: false,
          error: 'No Spotify integration found',
          message: 'User has not connected their Spotify account',
          code: 'SPOTIFY_NOT_CONNECTED',
        });
      }
      const topTracks = await spotifyAuth.getUserTopTracks(
        spotifyIntegration.access_token,
        time_range as string,
        parseInt(limit as string) || 20
      );
      return res
        .status(200)
        .json({ success: true, data: { tracks: topTracks, timeRange: time_range } });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch top tracks',
        message: error.message,
        code: 'SPOTIFY_TOP_TRACKS_FAILED',
      });
    }
  },

  playlists: async (req: any, res: Response) => {
    try {
      const spotifyIntegration = await findMusicIntegration(req.user!.userId, 'spotify');
      if (!spotifyIntegration?.access_token) {
        return res.status(400).json({
          success: false,
          error: 'No Spotify access token',
          message: 'User is not authenticated with Spotify',
          code: 'SPOTIFY_NOT_CONNECTED',
        });
      }
      const response = await fetch('https://api.spotify.com/v1/me/playlists', {
        headers: { Authorization: `Bearer ${spotifyIntegration.access_token}` },
      });
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }
      const playlists = (await response.json()) as any;
      return res.status(200).json({
        success: true,
        data: { playlists: playlists.items || [], total: playlists.total || 0 },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch playlists',
        message: error.message,
        code: 'SPOTIFY_PLAYLISTS_FAILED',
      });
    }
  },
};
