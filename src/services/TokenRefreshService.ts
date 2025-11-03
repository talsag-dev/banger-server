import {
  getUserMusicIntegrations,
  getAllUsersWithSpotifyIntegrations,
  updateMusicIntegrationTokens,
} from '../database/queries';
import axios from 'axios';
import { config } from '../config';

export class TokenRefreshService {
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 30 * 60 * 1000; // Run every 30 minutes

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

      // Get all users with Spotify integrations
      const userIds = await getAllUsersWithSpotifyIntegrations();
      console.log('userIds', userIds);
      if (userIds.length === 0) {
        if (config.debug) {
          console.log('   No users with Spotify integrations to refresh');
        }
        return;
      }

      let refreshed = 0;
      let skipped = 0;
      let failed = 0;

      // Process in parallel with concurrency limit (max 10 at a time)
      const batchSize = 10;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (userId) => {
            const result = await this.refreshSpotifyTokenForUser(userId);
            if (result === true) refreshed++;
            else if (result === false) skipped++;
          })
        );
      }

      if (config.debug) {
        console.log(
          `   Token refresh complete: ${refreshed} refreshed, ${skipped} skipped, ${failed} failed`
        );
      }
    } catch (error) {
      console.error('Error in token refresh service:', error);
    }
  }

  /**
   * Refresh token for a specific user's Spotify integration
   */
  async refreshSpotifyTokenForUser(userId: string): Promise<boolean> {
    try {
      const integrations = await getUserMusicIntegrations(userId);
      const spotifyIntegration = integrations.find((i) => i.provider === 'spotify');
      console.log('spotifyIntegration', integrations);
      if (!spotifyIntegration || !spotifyIntegration.refresh_token) {
        return false; // No Spotify integration or no refresh token
      }

      if (!spotifyIntegration.token_expires_at) {
        return false; // No expiry date
      }

      const expiresAt = new Date(spotifyIntegration.token_expires_at);
      const now = new Date();
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in ms

      if (timeUntilExpiry <= thirtyMinutes) {
        try {
          const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: spotifyIntegration.refresh_token,
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

          const tokenData = response.data as {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
          };

          const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

          await updateMusicIntegrationTokens(userId, 'spotify', {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || spotifyIntegration.refresh_token,
            token_expires_at: tokenExpiresAt,
            has_valid_token: true,
            is_connected: true,
            last_sync_at: new Date(),
          });

          if (config.debug) {
            console.log(`✅ Refreshed Spotify token for user ${userId}`);
          }
          return true;
        } catch (error) {
          console.error(`❌ Failed to refresh Spotify token for user ${userId}:`, error);

          // Mark token as invalid and disconnected on failure
          try {
            await updateMusicIntegrationTokens(userId, 'spotify', {
              has_valid_token: false,
              is_connected: false,
            });
          } catch (updateError) {
            console.error(
              'Failed to update integration status after refresh failure:',
              updateError
            );
          }

          return false;
        }
      }

      return false; // Token still valid, no refresh needed
    } catch (error) {
      console.error(`Error refreshing token for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Refresh tokens for all users (batch operation)
   * Call this periodically or from a cron job
   */
  async refreshAllTokens(): Promise<{ refreshed: number; failed: number }> {
    const userIds = await getAllUsersWithSpotifyIntegrations();
    let refreshed = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        const result = await this.refreshSpotifyTokenForUser(userId);
        if (result) refreshed++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return { refreshed, failed };
  }
}

export const tokenRefreshService = new TokenRefreshService();
