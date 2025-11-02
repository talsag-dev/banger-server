import axios from 'axios';

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: Array<{ url: string; height: number; width: number }>;
  followers: { total: number };
  country: string;
  product: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    release_date: string;
  };
  duration_ms: number;
  external_urls: { spotify: string };
  preview_url: string | null;
  popularity: number;
  explicit: boolean;
}

export interface SpotifySearchResults {
  tracks?: {
    items: SpotifyTrack[];
    total: number;
    limit: number;
    offset: number;
  };
  artists?: {
    items: Array<{
      id: string;
      name: string;
      images: Array<{ url: string; height: number; width: number }>;
      followers: { total: number };
      genres: string[];
    }>;
  };
  albums?: {
    items: Array<{
      id: string;
      name: string;
      artists: Array<{ id: string; name: string }>;
      images: Array<{ url: string; height: number; width: number }>;
      release_date: string;
    }>;
  };
}

export class SpotifyAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly baseUrl = 'https://accounts.spotify.com';
  private readonly apiUrl = 'https://api.spotify.com/v1';
  private readonly isConfigured: boolean;

  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || '';
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';

    // Validate redirect URI security in production
    if (
      this.redirectUri &&
      process.env.NODE_ENV === 'production' &&
      !this.redirectUri.startsWith('https://')
    ) {
      throw new Error('Redirect URI must use HTTPS in production environment');
    }

    this.isConfigured = !!(
      this.clientId &&
      this.clientSecret &&
      this.redirectUri &&
      !this.clientId.includes('your-spotify') &&
      !this.clientSecret.includes('your-spotify')
    );

    console.log(`🎵 Spotify Configuration: ${this.isConfigured ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);

    if (!this.isConfigured) {
      console.warn('⚠️  Spotify configuration not complete. Spotify features will be disabled.');
    }
  }

  private checkConfiguration(): void {
    if (!this.isConfigured) {
      throw new Error(
        'Spotify is not configured. Please set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI in your environment variables.'
      );
    }
  }

  isSpotifyConfigured(): boolean {
    return this.isConfigured;
  }

  getAuthorizationUrl(state: string): string {
    this.checkConfiguration();

    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-read-currently-playing',
      'user-read-playback-state',
      'user-library-read',
      'user-top-read',
      'playlist-read-private',
      'playlist-read-collaborative',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scopes,
      state,
      show_dialog: 'true',
    });

    return `${this.baseUrl}/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<SpotifyTokens> {
    this.checkConfiguration();

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
        }),
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
              'base64'
            )}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error exchanging code for tokens:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<SpotifyTokens> {
    this.checkConfiguration();

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
              'base64'
            )}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error refreshing access token:', error.response?.data || error.message);
      throw new Error('Failed to refresh access token');
    }
  }

  async getUserProfile(accessToken: string): Promise<SpotifyUser> {
    try {
      const response = await axios.get(`${this.apiUrl}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Error fetching user profile:', error.response?.data || error.message);
      throw new Error('Failed to fetch user profile');
    }
  }

  async getCurrentlyPlaying(accessToken: string): Promise<SpotifyTrack | null> {
    try {
      const response = await axios.get(`${this.apiUrl}/me/player/currently-playing`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 204 || !response.data?.item) {
        return null;
      }

      return response.data.item;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Spotify token expired');
      }
      console.error('Error fetching currently playing:', error.response?.data || error.message);
      return null;
    }
  }

  async search(
    query: string,
    type: string,
    limit: number,
    accessToken: string
  ): Promise<SpotifySearchResults> {
    try {
      const response = await axios.get(`${this.apiUrl}/search`, {
        params: {
          q: query,
          type,
          limit: Math.min(limit, 50), // Spotify API limit
          market: 'US', // Add market for better results
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Error searching Spotify:', error.response?.data || error.message);
      throw new Error('Failed to search Spotify');
    }
  }

  async getUserTopTracks(
    accessToken: string,
    timeRange: string = 'medium_term',
    limit: number = 20
  ): Promise<SpotifyTrack[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/me/top/tracks`, {
        params: {
          time_range: timeRange,
          limit: Math.min(limit, 50),
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data.items;
    } catch (error: any) {
      console.error('Error fetching top tracks:', error.response?.data || error.message);
      throw new Error('Failed to fetch top tracks');
    }
  }

  async getTrack(trackId: string, accessToken: string): Promise<SpotifyTrack> {
    try {
      const response = await axios.get(`${this.apiUrl}/tracks/${trackId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Track not found: ${trackId}`);
      }
      if (error.response?.status === 401) {
        throw new Error('Spotify token expired');
      }
      console.error('Error fetching track from Spotify:', error.response?.data || error.message);
      throw new Error('Failed to fetch track from Spotify');
    }
  }
}
