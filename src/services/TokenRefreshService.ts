import {
  getUserMusicIntegrations,
  getAllUsersWithSpotifyIntegrations,
  getAllUsersWithSoundCloudIntegrations,
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

      // Get all users with Spotify and SoundCloud integrations
      const [spotifyUserIds, soundcloudUserIds] = await Promise.all([
        getAllUsersWithSpotifyIntegrations(),
        getAllUsersWithSoundCloudIntegrations(),
      ]);

      const totalUsers = spotifyUserIds.length + soundcloudUserIds.length;

      if (totalUsers === 0) {
        if (config.debug) {
          console.log('   No users with integrations to refresh');
        }
        return;
      }

      let refreshed = 0;
      let skipped = 0;
      let failed = 0;

      // Process Spotify and SoundCloud in parallel with concurrency limit (max 10 at a time)
      const batchSize = 10;

      // Process Spotify integrations
      for (let i = 0; i < spotifyUserIds.length; i += batchSize) {
        const batch = spotifyUserIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (userId) => {
            const result = await this.refreshSpotifyTokenForUser(userId);
            if (result === true) refreshed++;
            else if (result === false) skipped++;
            else if (result === null) failed++;
          })
        );
      }

      // Process SoundCloud integrations
      for (let i = 0; i < soundcloudUserIds.length; i += batchSize) {
        const batch = soundcloudUserIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (userId) => {
            const result = await this.refreshSoundCloudTokenForUser(userId);
            if (result === true) refreshed++;
            else if (result === false) skipped++;
            else if (result === null) failed++;
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
   * Returns: true if refreshed, false if skipped (token still valid), null if failed
   */
  async refreshSpotifyTokenForUser(userId: string): Promise<boolean | null> {
    try {
      const integrations = await getUserMusicIntegrations(userId);
      const spotifyIntegration = integrations.find((i) => i.provider === 'spotify');

      if (!spotifyIntegration || !spotifyIntegration.refresh_token) {
        if (config.debug) {
          console.log(`   ⏭️  Skipped user ${userId}: No Spotify integration or refresh token`);
        }
        return false; // No Spotify integration or no refresh token
      }

      if (!spotifyIntegration.token_expires_at) {
        if (config.debug) {
          console.log(`   ⏭️  Skipped user ${userId}: No expiry date`);
        }
        return false; // No expiry date
      }

      const expiresAt = new Date(spotifyIntegration.token_expires_at);
      const now = new Date();
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      const fortyFiveMinutes = 45 * 60 * 1000; // 45 minutes in ms

      // Refresh if token expires within 45 minutes OR is already expired
      // Spotify tokens expire after 1 hour. With 30-minute refresh intervals, this ensures
      // tokens are always refreshed before expiry (worst case: token expires in 45 min, refresh
      // service runs in 30 min, refreshes with 15 min buffer)
      if (timeUntilExpiry <= fortyFiveMinutes) {
        if (config.debug) {
          const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);
          console.log(
            `   🔄 Refreshing token for user ${userId} (expires in ${minutesUntilExpiry} minutes)`
          );
        }
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

          return null; // Failed to refresh
        }
      }

      if (config.debug) {
        const minutesUntilExpiry = Math.round(timeUntilExpiry / 60000);
        console.log(
          `   ⏭️  Skipped user ${userId}: Token still valid (expires in ${minutesUntilExpiry} minutes)`
        );
      }
      return false; // Token still valid, no refresh needed
    } catch (error) {
      console.error(`Error refreshing token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Refresh token for a specific user's SoundCloud integration
   * Returns: true if refreshed, false if skipped (token still valid), null if failed
   */
  async refreshSoundCloudTokenForUser(userId: string): Promise<boolean | null> {
    try {
      const integrations = await getUserMusicIntegrations(userId);
      const soundcloudIntegration = integrations.find((i) => i.provider === 'soundcloud');

      if (!soundcloudIntegration || !soundcloudIntegration.refresh_token) {
        return false; // No SoundCloud integration or no refresh token
      }

      if (!soundcloudIntegration.token_expires_at) {
        return false; // No expiry date
      }

      const expiresAt = new Date(soundcloudIntegration.token_expires_at);
      const now = new Date();
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      const fortyFiveMinutes = 45 * 60 * 1000; // 45 minutes in ms

      // Refresh if token expires within 45 minutes OR is already expired
      if (timeUntilExpiry <= fortyFiveMinutes) {
        try {
          const response = await axios.post(
            'https://secure.soundcloud.com/oauth/token',
            new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: soundcloudIntegration.refresh_token,
              client_id: process.env.SOUNDCLOUD_CLIENT_ID || '',
              client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET || '',
            }),
            {
              headers: {
                accept: 'application/json; charset=utf-8',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            }
          );

          const tokenData = response.data as {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
          };

          const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

          await updateMusicIntegrationTokens(userId, 'soundcloud', {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || soundcloudIntegration.refresh_token,
            token_expires_at: tokenExpiresAt,
            has_valid_token: true,
            is_connected: true,
            last_sync_at: new Date(),
          });

          if (config.debug) {
            console.log(`✅ Refreshed SoundCloud token for user ${userId}`);
          }
          return true;
        } catch (error) {
          console.error(`❌ Failed to refresh SoundCloud token for user ${userId}:`, error);

          // Mark token as invalid and disconnected on failure
          try {
            await updateMusicIntegrationTokens(userId, 'soundcloud', {
              has_valid_token: false,
              is_connected: false,
            });
          } catch (updateError) {
            console.error(
              'Failed to update integration status after refresh failure:',
              updateError
            );
          }

          return null; // Failed to refresh
        }
      }

      return false; // Token still valid, no refresh needed
    } catch (error) {
      console.error(`Error refreshing SoundCloud token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Refresh tokens for all users (batch operation)
   * Call this periodically or from a cron job
   */
  async refreshAllTokens(): Promise<{ refreshed: number; failed: number }> {
    const [spotifyUserIds, soundcloudUserIds] = await Promise.all([
      getAllUsersWithSpotifyIntegrations(),
      getAllUsersWithSoundCloudIntegrations(),
    ]);

    let refreshed = 0;
    let failed = 0;

    // Refresh Spotify tokens
    for (const userId of spotifyUserIds) {
      try {
        const result = await this.refreshSpotifyTokenForUser(userId);
        if (result) refreshed++;
        else failed++;
      } catch {
        failed++;
      }
    }

    // Refresh SoundCloud tokens
    for (const userId of soundcloudUserIds) {
      try {
        const result = await this.refreshSoundCloudTokenForUser(userId);
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
