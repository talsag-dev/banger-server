import axios from 'axios';
import crypto from 'crypto';
import {
  createMusicIntegration,
  findMusicIntegration,
  getUserMusicIntegrations,
  updateMusicIntegration,
  disconnectMusicIntegration,
  deleteMusicIntegration,
} from '../database/queries';
import type { MusicIntegration, CreateMusicIntegrationData } from '../database/types';

export type MusicProvider = 'spotify' | 'apple-music' | 'youtube-music' | 'soundcloud';

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string;
  email: string;
  images: Array<{ url: string; height: number; width: number }>;
}

export class MusicIntegrationService {
  // Spotify Integration
  async connectSpotify(userId: number, authCode: string): Promise<MusicIntegration> {
    try {
      // Exchange code for tokens
      const tokenResponse = await this.getSpotifyTokens(authCode);

      // Get user profile
      const userProfile = await this.getSpotifyUserProfile(tokenResponse.access_token);

      // Calculate token expiration
      const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

      // Check if integration already exists
      const existingIntegration = await findMusicIntegration(userId, 'spotify');

      if (existingIntegration) {
        // Update existing integration
        return (await updateMusicIntegration(userId, 'spotify', {
          display_name: userProfile.display_name,
          avatar_url: userProfile.images?.[0]?.url,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token || existingIntegration.refresh_token,
          token_expires_at: tokenExpiresAt,
          has_valid_token: true,
          last_sync_at: new Date(),
        })) as MusicIntegration;
      } else {
        // Create new integration
        const integrationData: CreateMusicIntegrationData = {
          user_id: userId,
          provider: 'spotify',
          provider_user_id: userProfile.id,
          display_name: userProfile.display_name,
          avatar_url: userProfile.images?.[0]?.url,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          token_expires_at: tokenExpiresAt,
        };

        return await createMusicIntegration(integrationData);
      }
    } catch (error) {
      console.error('Error connecting Spotify:', error);
      throw new Error('Failed to connect Spotify account');
    }
  }

  async refreshSpotifyToken(userId: number): Promise<MusicIntegration | null> {
    const integration = await findMusicIntegration(userId, 'spotify');
    if (!integration?.refresh_token) {
      throw new Error('No Spotify refresh token found');
    }

    try {
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: integration.refresh_token,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString('base64')}`,
          },
        }
      );

      const tokenData: SpotifyTokenResponse = response.data;
      const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      return await updateMusicIntegration(userId, 'spotify', {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || integration.refresh_token,
        token_expires_at: tokenExpiresAt,
        has_valid_token: true,
        last_sync_at: new Date(),
      });
    } catch (error) {
      console.error('Error refreshing Spotify token:', error);

      // Mark token as invalid
      await updateMusicIntegration(userId, 'spotify', {
        has_valid_token: false,
      });

      throw new Error('Failed to refresh Spotify token');
    }
  }

  private async getSpotifyTokens(authCode: string): Promise<SpotifyTokenResponse> {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );

    return response.data;
  }

  private async getSpotifyUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
    const response = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }

  // Apple Music Integration (placeholder - requires Apple Music API setup)
  async connectAppleMusic(userId: number, authData: any): Promise<MusicIntegration> {
    throw new Error('Apple Music integration not yet implemented');
  }

  // YouTube Music Integration (placeholder - requires YouTube Music API setup)
  async connectYouTubeMusic(userId: number, authData: any): Promise<MusicIntegration> {
    throw new Error('YouTube Music integration not yet implemented');
  }

  // SoundCloud Integration (placeholder - requires SoundCloud API setup)
  async connectSoundCloud(userId: number, authData: any): Promise<MusicIntegration> {
    throw new Error('SoundCloud integration not yet implemented');
  }

  // Generic Integration Management
  async getUserIntegrations(userId: number): Promise<MusicIntegration[]> {
    return await getUserMusicIntegrations(userId);
  }

  async getIntegration(userId: number, provider: MusicProvider): Promise<MusicIntegration | null> {
    return await findMusicIntegration(userId, provider);
  }

  async disconnectProvider(userId: number, provider: MusicProvider): Promise<void> {
    await disconnectMusicIntegration(userId, provider);
  }

  async removeIntegration(userId: number, provider: MusicProvider): Promise<void> {
    await deleteMusicIntegration(userId, provider);
  }

  // Spotify Authorization URL
  getSpotifyAuthUrl(): string {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-read-currently-playing',
      'user-read-recently-played',
      'user-read-playback-state',
      'playlist-read-private',
      'playlist-read-collaborative',
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      scope: scopes,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      state: crypto.randomBytes(16).toString('hex'), // For security
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  // Apple Music Authorization URL (placeholder)
  getAppleMusicAuthUrl(): string {
    throw new Error('Apple Music authorization not yet implemented');
  }

  // YouTube Music Authorization URL (placeholder)
  getYouTubeMusicAuthUrl(): string {
    throw new Error('YouTube Music authorization not yet implemented');
  }

  // SoundCloud Authorization URL (placeholder)
  getSoundCloudAuthUrl(): string {
    throw new Error('SoundCloud authorization not yet implemented');
  }
}

export const musicIntegrationService = new MusicIntegrationService();
