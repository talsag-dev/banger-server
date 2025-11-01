import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authService } from '../services/AuthService';
import { musicIntegrationService } from '../services/MusicIntegrationService';
import { findUserById, getUserMusicIntegrations } from '../database/queries';

export const authController = {
  signup: async (req: Request, res: Response) => {
    try {
      const { email, password, displayName, username } = req.body;
      if (!email || !password || !displayName || !username) {
        return res
          .status(400)
          .json({
            success: false,
            error: 'Email, password, display name, and username are required',
          });
      }
      const { user, token } = await authService.signUpWithEmail(
        email,
        password,
        displayName,
        username
      );
      res.cookie('auth_token', token, authService.generateCookieOptions());
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            authProvider: user.auth_provider,
          },
        },
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Signup failed' });
    }
  },

  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
      }
      const { user, token } = await authService.loginWithEmail(email, password);
      res.cookie('auth_token', token, authService.generateCookieOptions());
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            authProvider: user.auth_provider,
          },
        },
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Login failed' });
    }
  },

  googleAuthUrl: (req: Request, res: Response) => {
    const googleAuthUrl =
      `https://accounts.google.com/oauth2/authorize?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&` +
      `response_type=code&` +
      `scope=openid email profile&` +
      `state=${(req.query.state as string) || ''}`;
    return res.status(200).json({ success: true, data: { authUrl: googleAuthUrl } });
  },

  googleCallback: async (req: Request, res: Response) => {
    try {
      const { userInfo } = req.body;
      if (!userInfo) {
        return res.status(400).json({ success: false, error: 'User info is required' });
      }
      const { user, token } = await authService.authenticateWithGoogle(userInfo);
      res.cookie('auth_token', token, authService.generateCookieOptions());
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            authProvider: user.auth_provider,
          },
        },
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ success: false, error: error?.message || 'Google authentication failed' });
    }
  },

  appleAuthUrl: (req: Request, res: Response) => {
    const appleAuthUrl =
      `https://appleid.apple.com/auth/authorize?` +
      `client_id=${process.env.APPLE_CLIENT_ID}&` +
      `redirect_uri=${process.env.APPLE_REDIRECT_URI}&` +
      `response_type=code&` +
      `scope=name email&` +
      `response_mode=form_post&` +
      `state=${(req.query.state as string) || ''}`;
    return res.status(200).json({ success: true, data: { authUrl: appleAuthUrl } });
  },

  appleCallback: async (req: Request, res: Response) => {
    try {
      const { userInfo } = req.body;
      if (!userInfo) {
        return res.status(400).json({ success: false, error: 'User info is required' });
      }
      const { user, token } = await authService.authenticateWithApple(userInfo);
      res.cookie('auth_token', token, authService.generateCookieOptions());
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            authProvider: user.auth_provider,
          },
        },
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ success: false, error: error?.message || 'Apple authentication failed' });
    }
  },

  forgotPassword: async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }
      const resetToken = await authService.requestPasswordReset(email);
      return res
        .status(200)
        .json({ success: true, data: { message: 'Password reset email sent' } });
    } catch (error: any) {
      return res
        .status(400)
        .json({ success: false, error: error?.message || 'Password reset failed' });
    }
  },

  resetPassword: async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res
          .status(400)
          .json({ success: false, error: 'Token and new password are required' });
      }
      const { user, token: authToken } = await authService.resetPassword(token, password);
      res.cookie('auth_token', authToken, authService.generateCookieOptions());
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            authProvider: user.auth_provider,
          },
        },
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ success: false, error: error?.message || 'Password reset failed' });
    }
  },

  integrationsSpotifyAuthUrl: (req: Request, res: Response) => {
    const authUrl = musicIntegrationService.getSpotifyAuthUrl();
    return res.status(200).json({ success: true, data: { authUrl } });
  },

  integrationsSpotifyConnect: async (req: any, res: Response) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: 'Authorization code is required' });
      }
      const integration = await musicIntegrationService.connectSpotify(req.user!.userId, code);
      return res.status(200).json({
        success: true,
        data: {
          integration: {
            provider: integration.provider,
            isConnected: integration.is_connected,
            displayName: integration.display_name,
            connectedAt: integration.connected_at,
          },
        },
      });
    } catch (error: any) {
      return res
        .status(400)
        .json({ success: false, error: error?.message || 'Failed to connect Spotify' });
    }
  },

  integrationsDisconnect: async (req: any, res: Response) => {
    try {
      const { provider } = req.params;
      await musicIntegrationService.disconnectProvider(req.user!.userId, provider as any);
      return res
        .status(200)
        .json({ success: true, data: { message: `${provider} disconnected successfully` } });
    } catch (error: any) {
      return res
        .status(400)
        .json({ success: false, error: error?.message || 'Failed to disconnect service' });
    }
  },

  integrationsList: async (req: any, res: Response) => {
    try {
      const integrations = await musicIntegrationService.getUserIntegrations(req.user!.userId);
      return res.status(200).json({
        success: true,
        data: {
          integrations: integrations.map((integration) => ({
            provider: integration.provider,
            isConnected: integration.is_connected,
            hasValidToken: integration.has_valid_token,
            displayName: integration.display_name,
            avatar: integration.avatar_url,
            connectedAt: integration.connected_at,
            lastSyncAt: integration.last_sync_at,
          })),
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch music integrations' });
    }
  },

  me: async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }
      const user = await findUserById(req.user.userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const integrations = await getUserMusicIntegrations(user.id);
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            displayName: user.display_name,
            avatar: user.avatar_url,
            bio: user.bio,
            authProvider: user.auth_provider,
            emailVerified: user.email_verified,
            createdAt: user.created_at,
          },
          musicIntegrations: integrations.map((integration) => ({
            provider: integration.provider,
            isConnected: integration.is_connected,
            hasValidToken: integration.has_valid_token,
            displayName: integration.display_name,
            avatar: integration.avatar_url,
            connectedAt: integration.connected_at,
            lastSyncAt: integration.last_sync_at,
          })),
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: 'Failed to fetch user data' });
    }
  },

  logout: (req: Request, res: Response) => {
    const cookieOptions = [
      { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const },
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        domain: 'localhost',
      },
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        domain: '.localhost',
      },
    ];
    cookieOptions.forEach((options) => res.clearCookie('auth_token', options));
    return res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
  },

  status: (req: Request, res: Response) => {
    const token = (req as any).cookies?.auth_token;
    if (!token) return res.status(200).json({ success: true, data: { authenticated: false } });
    try {
      jwt.verify(token, process.env.JWT_SECRET!);
      return res.status(200).json({ success: true, data: { authenticated: true } });
    } catch {
      return res.status(200).json({ success: true, data: { authenticated: false } });
    }
  },
};
