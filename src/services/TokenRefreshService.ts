import {
  getUserMusicIntegrations,
  getAllUsersWithSpotifyIntegrations,
  getAllUsersWithSoundCloudIntegrations,
  updateMusicIntegrationTokens,
} from '../database/queries';
import axios from 'axios';
import { config } from '../config';

type Provider = 'spotify' | 'soundcloud';

interface TokenRefreshConfig {
  url: string;
  getParams: (refreshToken: string) => URLSearchParams;
  getHeaders: () => Record<string, string>;
}

interface ValidationConfig {
  url: string;
  getParams?: () => Record<string, string>;
  getHeaders: (accessToken: string) => Record<string, string>;
}

interface Integration {
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: Date | null;
  has_valid_token?: boolean;
  is_connected?: boolean;
}

export class TokenRefreshService {
  private refreshInterval: NodeJS.Timeout | null = null;
  private validationInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 30 * 60 * 1000; // Run every 30 minutes
  private readonly VALIDATION_INTERVAL_MS = 5 * 60 * 1000; // Validate tokens every 5 minutes
  private readonly REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
  private readonly BATCH_SIZE = 10;

  private readonly providerConfigs: Record<Provider, TokenRefreshConfig> = {
    spotify: {
      url: 'https://accounts.spotify.com/api/token',
      getParams: (refreshToken) =>
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      getHeaders: () => ({
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      }),
    },
    soundcloud: {
      url: 'https://secure.soundcloud.com/oauth/token',
      getParams: (refreshToken) =>
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.SOUNDCLOUD_CLIENT_ID || '',
          client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET || '',
        }),
      getHeaders: () => ({
        accept: 'application/json; charset=utf-8',
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
    },
  };

  private readonly validationConfigs: Record<Provider, ValidationConfig> = {
    spotify: {
      url: 'https://api.spotify.com/v1/me',
      getHeaders: (accessToken) => ({
        Authorization: `Bearer ${accessToken}`,
      }),
    },
    soundcloud: {
      url: 'https://api.soundcloud.com/me',
      getHeaders: (accessToken) => ({
        Authorization: `Bearer ${accessToken}`,
        accept: 'application/json; charset=utf-8',
      }),
    },
  };

  private readonly getUserIdsFunctions: Record<Provider, () => Promise<string[]>> = {
    spotify: getAllUsersWithSpotifyIntegrations,
    soundcloud: getAllUsersWithSoundCloudIntegrations,
  };

  /**
   * Start the background token refresh and validation services
   */
  start(): void {
    if (this.refreshInterval) {
      return; // Already running
    }

    this.refreshTokensForAllUsers();
    this.refreshInterval = setInterval(() => {
      this.refreshTokensForAllUsers();
    }, this.REFRESH_INTERVAL_MS);

    this.validateTokensForAllUsers();
    this.validationInterval = setInterval(() => {
      this.validateTokensForAllUsers();
    }, this.VALIDATION_INTERVAL_MS);

    if (config.debug) {
      console.log('🔄 Token refresh service started');
      console.log('🔍 Token validation service started (runs every 5 minutes)');
    }
  }

  /**
   * Stop the background token refresh and validation services
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }

    if (config.debug) {
      console.log('⏹️ Token refresh and validation services stopped');
    }
  }

  /**
   * Process all users for a given operation (refresh or validate)
   */
  private async processAllUsers<T>(
    operation: (userId: string, provider: Provider) => Promise<T>,
    operationName: string
  ): Promise<void> {
    try {
      if (config.debug) {
        console.log(`🔄 ${operationName} cycle started`);
      }

      const providers: Provider[] = ['spotify', 'soundcloud'];
      const results: T[] = [];

      for (const provider of providers) {
        const userIds = await this.getUserIdsFunctions[provider]();
        if (userIds.length === 0) continue;

        for (let i = 0; i < userIds.length; i += this.BATCH_SIZE) {
          const batch = userIds.slice(i, i + this.BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map((userId) => operation(userId, provider))
          );
          results.push(...batchResults);
        }
      }
    } catch (error) {
      console.error(`Error in ${operationName} service:`, error);
    }
  }

  /**
   * Refresh tokens for all users
   */
  private async refreshTokensForAllUsers(): Promise<void> {
    let refreshed = 0;
    let skipped = 0;
    let failed = 0;

    await this.processAllUsers(async (userId, provider) => {
      const result = await this.refreshTokenForUser(userId, provider);
      if (result === true) refreshed++;
      else if (result === false) skipped++;
      else if (result === null) failed++;
      return result;
    }, 'Token refresh');

    if (config.debug) {
      const total = refreshed + skipped + failed;
      if (total > 0) {
        console.log(
          `   Token refresh complete: ${refreshed} refreshed, ${skipped} skipped, ${failed} failed`
        );
      }
    }
  }

  /**
   * Validate tokens for all users
   */
  private async validateTokensForAllUsers(): Promise<void> {
    let validated = 0;
    let invalid = 0;
    let refreshed = 0;

    await this.processAllUsers(async (userId, provider) => {
      const result = await this.validateTokenForUser(userId, provider);
      if (result === 'valid') validated++;
      else if (result === 'invalid') invalid++;
      else if (result === 'refreshed') refreshed++;
      return result;
    }, 'Token validation');

    if (config.debug) {
      const total = validated + invalid + refreshed;
      if (total > 0) {
        console.log(
          `   Token validation complete: ${validated} valid, ${invalid} invalid, ${refreshed} refreshed`
        );
      }
    }
  }

  /**
   * Validate token by making a test API call
   */
  private async validateToken(provider: Provider, accessToken: string): Promise<boolean | null> {
    try {
      const validationConfig = this.validationConfigs[provider];
      const requestConfig: {
        headers: Record<string, string>;
        params?: Record<string, string>;
        timeout: number;
      } = {
        headers: validationConfig.getHeaders(accessToken),
        timeout: 5000,
      };

      if (validationConfig.getParams) {
        requestConfig.params = validationConfig.getParams();
      }

      const response = await axios.get(validationConfig.url, requestConfig);
      return response.status === 200;
    } catch (error: any) {
      if (error.response?.status === 401) {
        return false; // Token is invalid
      }
      return null; // Other error, can't determine validity
    }
  }

  /**
   * Check if token should be refreshed based on expiration and status
   */
  private shouldRefreshToken(integration: Integration): boolean {
    const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
    const now = new Date();

    if (!expiresAt) {
      return true; // No expiration date, treat as expired
    }

    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const isExpired = timeUntilExpiry < 0;
    const expiresSoon = timeUntilExpiry <= this.REFRESH_THRESHOLD_MS;
    const isInvalid = !integration.has_valid_token || !integration.is_connected;

    return isExpired || expiresSoon || isInvalid;
  }

  /**
   * Get integration for a user and provider
   */
  private async getIntegration(userId: string, provider: Provider): Promise<Integration | null> {
    const integrations = await getUserMusicIntegrations(userId);
    return integrations.find((i) => i.provider === provider) || null;
  }

  /**
   * Validate a single user's token and refresh if invalid
   */
  private async validateTokenForUser(
    userId: string,
    provider: Provider
  ): Promise<'valid' | 'invalid' | 'refreshed' | 'skipped'> {
    try {
      const integration = await this.getIntegration(userId, provider);

      if (!integration?.access_token || !integration.refresh_token) {
        return 'skipped';
      }

      if (!integration.has_valid_token || !integration.is_connected) {
        return 'skipped'; // Already marked as invalid
      }

      const isValid = await this.validateToken(provider, integration.access_token);

      if (isValid === false) {
        // Token is invalid, mark and refresh
        await this.markTokenAsInvalid(userId, provider);
        const refreshResult = await this.performTokenRefresh(userId, provider, {
          refresh_token: integration.refresh_token,
          token_expires_at: integration.token_expires_at,
        });
        return refreshResult === true ? 'refreshed' : 'invalid';
      }

      return isValid === true ? 'valid' : 'skipped';
    } catch (error) {
      console.error(`Error validating ${provider} token for user ${userId}:`, error);
      return 'skipped';
    }
  }

  /**
   * Mark token as invalid in database
   */
  private async markTokenAsInvalid(userId: string, provider: Provider): Promise<void> {
    await updateMusicIntegrationTokens(userId, provider, {
      has_valid_token: false,
      is_connected: false,
    });
  }

  /**
   * Refresh token for a specific user's integration
   * Returns: true if refreshed, false if skipped, null if failed
   */
  async refreshTokenForUser(userId: string, provider: Provider): Promise<boolean | null> {
    try {
      const integration = await this.getIntegration(userId, provider);

      if (!integration?.refresh_token) {
        if (config.debug) {
          console.log(
            `   ⏭️  Skipped user ${userId} (${provider}): No integration or refresh token`
          );
        }
        return false;
      }

      // Check if refresh is needed based on expiration and status
      if (!this.shouldRefreshToken(integration)) {
        await this.logSkip(userId, provider, 'Token still valid', integration);
        return false;
      }

      // Perform refresh
      if (config.debug) {
        console.log(`   🔄 Attempting to refresh ${provider} token for user ${userId}`);
      }

      return await this.performTokenRefresh(userId, provider, {
        refresh_token: integration.refresh_token,
        token_expires_at: integration.token_expires_at,
      });
    } catch (error) {
      console.error(`Error refreshing ${provider} token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Log skip message with optional expiry info
   */
  private async logSkip(
    userId: string,
    provider: Provider,
    reason: string,
    integration?: Integration | null
  ): Promise<void> {
    if (!config.debug) return;

    if (integration?.token_expires_at) {
      const expiresAt = new Date(integration.token_expires_at);
      const minutesUntilExpiry = Math.round((expiresAt.getTime() - Date.now()) / 60000);
      console.log(
        `   ⏭️  Skipped user ${userId} (${provider}): ${reason} (expires in ${minutesUntilExpiry} minutes)`
      );
    } else {
      console.log(`   ⏭️  Skipped user ${userId} (${provider}): ${reason}`);
    }
  }

  /**
   * Perform the actual token refresh API call
   */
  private async performTokenRefresh(
    userId: string,
    provider: Provider,
    integration: { refresh_token: string; token_expires_at?: Date | null }
  ): Promise<boolean | null> {
    const providerConfig = this.providerConfigs[provider];

    try {
      const response = await axios.post(
        providerConfig.url,
        providerConfig.getParams(integration.refresh_token),
        { headers: providerConfig.getHeaders() }
      );

      const tokenData = response.data as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      const updatedIntegration = await updateMusicIntegrationTokens(userId, provider, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || integration.refresh_token,
        token_expires_at: tokenExpiresAt,
        has_valid_token: true,
        is_connected: true,
        last_sync_at: new Date(),
      });

      if (config.debug) {
        console.log(`✅ Refreshed ${provider} token for user ${userId}`);
      }
      return true;
    } catch (error) {
      console.error(`❌ Failed to refresh ${provider} token for user ${userId}:`, error);
      await this.markTokenAsInvalid(userId, provider);
      return null;
    }
  }

  /**
   * Public methods for backward compatibility
   */
  async refreshSpotifyTokenForUser(userId: string): Promise<boolean | null> {
    return this.refreshTokenForUser(userId, 'spotify');
  }

  async refreshSoundCloudTokenForUser(userId: string): Promise<boolean | null> {
    return this.refreshTokenForUser(userId, 'soundcloud');
  }
}

export const tokenRefreshService = new TokenRefreshService();
