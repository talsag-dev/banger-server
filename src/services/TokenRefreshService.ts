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

export class TokenRefreshService {
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 30 * 60 * 1000; // Run every 30 minutes
  private readonly REFRESH_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes
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

  private readonly getUserIdsFunctions: Record<Provider, () => Promise<string[]>> = {
    spotify: getAllUsersWithSpotifyIntegrations,
    soundcloud: getAllUsersWithSoundCloudIntegrations,
  };

  /**
   * Start the background token refresh service
   */
  start(): void {
    if (this.refreshInterval) {
      return; // Already running
    }

    // Run immediately on start, then every interval
    this.refreshTokensForAllUsers();

    this.refreshInterval = setInterval(() => {
      this.refreshTokensForAllUsers();
    }, this.REFRESH_INTERVAL_MS);

    if (config.debug) {
      console.log('🔄 Token refresh service started');
    }
  }

  /**
   * Stop the background token refresh service
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;

      if (config.debug) {
        console.log('⏹️ Token refresh service stopped');
      }
    }
  }

  /**
   * Refresh tokens for all users with integrations that need refresh
   */
  private async refreshTokensForAllUsers(): Promise<void> {
    try {
      if (config.debug) {
        console.log('🔄 Token refresh cycle started');
      }

      const providers: Provider[] = ['spotify', 'soundcloud'];
      let refreshed = 0;
      let skipped = 0;
      let failed = 0;

      // Process all providers
      for (const provider of providers) {
        const userIds = await this.getUserIdsFunctions[provider]();

        if (userIds.length === 0) continue;

        // Process in batches
        for (let i = 0; i < userIds.length; i += this.BATCH_SIZE) {
          const batch = userIds.slice(i, i + this.BATCH_SIZE);
          await Promise.all(
            batch.map(async (userId) => {
              const result = await this.refreshTokenForUser(userId, provider);
              if (result === true) refreshed++;
              else if (result === false) skipped++;
              else if (result === null) failed++;
            })
          );
        }
      }

      if (config.debug) {
        const total = refreshed + skipped + failed;
        if (total > 0) {
          console.log(
            `   Token refresh complete: ${refreshed} refreshed, ${skipped} skipped, ${failed} failed`
          );
        } else {
          console.log('   No users with integrations to refresh');
        }
      }
    } catch (error) {
      console.error('Error in token refresh service:', error);
    }
  }

  /**
   * Refresh token for a specific user's integration
   * Returns: true if refreshed, false if skipped (token still valid), null if failed
   */
  async refreshTokenForUser(userId: string, provider: Provider): Promise<boolean | null> {
    try {
      const integrations = await getUserMusicIntegrations(userId);
      const integration = integrations.find((i) => i.provider === provider);

      if (!integration || !integration.refresh_token) {
        if (config.debug) {
          console.log(`   ⏭️  Skipped user ${userId}: No ${provider} integration or refresh token`);
        }
        return false;
      }

      const shouldRefresh = this.shouldRefreshToken(integration);
      if (!shouldRefresh) {
        if (config.debug) {
          const expiresAt = integration.token_expires_at
            ? new Date(integration.token_expires_at)
            : null;
          const timeUntilExpiry = expiresAt ? expiresAt.getTime() - new Date().getTime() : Infinity;
          const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);
          console.log(
            `   ⏭️  Skipped user ${userId} (${provider}): Token still valid (expires in ${minutesUntilExpiry} minutes)`
          );
        }
        return false;
      }

      // At this point we know refresh_token exists (checked above)
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
   * Check if token should be refreshed
   */
  private shouldRefreshToken(integration: {
    token_expires_at?: Date | null;
    has_valid_token?: boolean;
    is_connected?: boolean;
  }): boolean {
    const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
    const now = new Date();
    const timeUntilExpiry = expiresAt ? expiresAt.getTime() - now.getTime() : -1;

    return (
      timeUntilExpiry <= this.REFRESH_THRESHOLD_MS ||
      !integration.has_valid_token ||
      !integration.is_connected
    );
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

    if (config.debug) {
      const expiresAt = integration.token_expires_at
        ? new Date(integration.token_expires_at)
        : null;
      if (expiresAt) {
        const timeUntilExpiry = expiresAt.getTime() - new Date().getTime();
        const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);
        console.log(
          `   🔄 Refreshing ${provider} token for user ${userId} (expires in ${minutesUntilExpiry} minutes)`
        );
      } else {
        console.log(
          `   🔄 Refreshing ${provider} token for user ${userId} (no expiry date or marked invalid)`
        );
      }
    }

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

      await updateMusicIntegrationTokens(userId, provider, {
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

      // Mark token as invalid and disconnected on failure
      try {
        await updateMusicIntegrationTokens(userId, provider, {
          has_valid_token: false,
          is_connected: false,
        });
      } catch (updateError) {
        console.error('Failed to update integration status after refresh failure:', updateError);
      }

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
