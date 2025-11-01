import { getUserMusicIntegrations, getAllUsersWithSpotifyIntegrations } from '../database/queries';
import { musicIntegrationService } from './MusicIntegrationService';
import { config } from '../config';

export class TokenRefreshService {
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes

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

      if (!spotifyIntegration || !spotifyIntegration.refresh_token) {
        return false; // No Spotify integration or no refresh token
      }

      if (!spotifyIntegration.token_expires_at) {
        return false; // No expiry date
      }

      const expiresAt = new Date(spotifyIntegration.token_expires_at);
      const now = new Date();
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      const fiveMinutes = 5 * 60 * 1000; // 5 minutes in ms

      if (timeUntilExpiry <= fiveMinutes) {
        try {
          await musicIntegrationService.refreshSpotifyToken(userId);

          if (config.debug) {
            console.log(`✅ Refreshed Spotify token for user ${userId}`);
          }
          return true;
        } catch (error) {
          console.error(`❌ Failed to refresh Spotify token for user ${userId}:`, error);
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
