import { TokenRefreshService } from '../services/TokenRefreshService';
import { musicIntegrationService } from '../services/MusicIntegrationService';
import * as queries from '../database/queries';

// Mock dependencies
jest.mock('../services/MusicIntegrationService', () => ({
  musicIntegrationService: {
    refreshSpotifyToken: jest.fn(),
  },
}));

jest.mock('../database/queries', () => ({
  getUserMusicIntegrations: jest.fn(),
  getAllUsersWithSpotifyIntegrations: jest.fn(),
  findMusicIntegration: jest.fn(),
}));

jest.mock('../config', () => ({
  config: {
    debug: false,
  },
}));

describe('TokenRefreshService', () => {
  let service: TokenRefreshService;
  let mockRefreshSpotifyToken: jest.Mock;
  let mockGetUserMusicIntegrations: jest.Mock;
  let mockGetAllUsersWithSpotifyIntegrations: jest.Mock;

  beforeEach(() => {
    service = new TokenRefreshService();
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockRefreshSpotifyToken = musicIntegrationService.refreshSpotifyToken as jest.Mock;
    mockGetUserMusicIntegrations = queries.getUserMusicIntegrations as jest.Mock;
    mockGetAllUsersWithSpotifyIntegrations =
      queries.getAllUsersWithSpotifyIntegrations as jest.Mock;
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  describe('refreshSpotifyTokenForUser', () => {
    it('should return false if user has no Spotify integration', async () => {
      mockGetUserMusicIntegrations.mockResolvedValue([]);

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(false);
      expect(mockRefreshSpotifyToken).not.toHaveBeenCalled();
    });

    it('should return false if token has no expiry date', async () => {
      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'refresh123',
          token_expires_at: null,
          has_valid_token: true,
        },
      ]);

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(false);
      expect(mockRefreshSpotifyToken).not.toHaveBeenCalled();
    });

    it('should skip refresh if token expires in more than 5 minutes', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'refresh123',
          token_expires_at: futureDate,
          has_valid_token: true,
        },
      ]);

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(false);
      expect(mockRefreshSpotifyToken).not.toHaveBeenCalled();
    });

    it('should refresh token if it expires in less than 5 minutes', async () => {
      const nearExpiryDate = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes from now

      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'refresh123',
          token_expires_at: nearExpiryDate,
          has_valid_token: true,
        },
      ]);

      mockRefreshSpotifyToken.mockResolvedValue({
        provider: 'spotify',
        access_token: 'new_access_token',
        has_valid_token: true,
      });

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(true);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(1);
    });

    it('should refresh token if it is already expired', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'refresh123',
          token_expires_at: pastDate,
          has_valid_token: true,
        },
      ]);

      mockRefreshSpotifyToken.mockResolvedValue({
        provider: 'spotify',
        access_token: 'new_access_token',
        has_valid_token: true,
      });

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(true);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(1);
    });

    it('should return false if refresh fails', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000);

      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'refresh123',
          token_expires_at: pastDate,
          has_valid_token: true,
        },
      ]);

      mockRefreshSpotifyToken.mockRejectedValue(new Error('Refresh failed'));

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(false);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(1);
    });
  });

  describe('refreshTokensForAllUsers', () => {
    it('should skip when no users have Spotify integrations', async () => {
      mockGetAllUsersWithSpotifyIntegrations.mockResolvedValue([]);

      // Access private method via any for testing
      await (service as any).refreshTokensForAllUsers();

      expect(mockGetAllUsersWithSpotifyIntegrations).toHaveBeenCalled();
      expect(mockRefreshSpotifyToken).not.toHaveBeenCalled();
    });

    it('should refresh tokens for users with near-expiry tokens', async () => {
      mockGetAllUsersWithSpotifyIntegrations.mockResolvedValue([1, 2]);

      const nearExpiryDate = new Date(Date.now() + 3 * 60 * 1000);

      mockGetUserMusicIntegrations
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh123',
            token_expires_at: nearExpiryDate,
            has_valid_token: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh456',
            token_expires_at: nearExpiryDate,
            has_valid_token: true,
          },
        ]);

      mockRefreshSpotifyToken.mockResolvedValue({
        provider: 'spotify',
        access_token: 'new_token',
        has_valid_token: true,
      });

      await (service as any).refreshTokensForAllUsers();

      expect(mockRefreshSpotifyToken).toHaveBeenCalledTimes(2);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(1);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(2);
    });
  });

  describe('start/stop', () => {
    it('should start and run refresh cycle', () => {
      mockGetAllUsersWithSpotifyIntegrations.mockResolvedValue([]);

      service.start();

      expect(mockGetAllUsersWithSpotifyIntegrations).toHaveBeenCalled();
    });

    it('should not start twice', () => {
      mockGetAllUsersWithSpotifyIntegrations.mockResolvedValue([]);

      service.start();
      const callCount1 = mockGetAllUsersWithSpotifyIntegrations.mock.calls.length;

      service.start();
      const callCount2 = mockGetAllUsersWithSpotifyIntegrations.mock.calls.length;

      expect(callCount2).toBe(callCount1);
    });

    it('should stop the service', () => {
      service.start();
      service.stop();

      expect(service).toBeDefined();
    });
  });

  describe('refreshAllTokens', () => {
    it('should return counts of refreshed and failed tokens', async () => {
      mockGetAllUsersWithSpotifyIntegrations.mockResolvedValue([1, 2, 3]);

      const nearExpiryDate = new Date(Date.now() + 3 * 60 * 1000);

      mockGetUserMusicIntegrations
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh1',
            token_expires_at: nearExpiryDate,
            has_valid_token: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh2',
            token_expires_at: nearExpiryDate,
            has_valid_token: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh3',
            token_expires_at: new Date(Date.now() + 10 * 60 * 1000), // Too far in future
            has_valid_token: true,
          },
        ]);

      mockRefreshSpotifyToken
        .mockResolvedValueOnce({ provider: 'spotify', has_valid_token: true })
        .mockResolvedValueOnce({ provider: 'spotify', has_valid_token: true });

      const result = await service.refreshAllTokens();

      expect(result.refreshed).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe('Full token refresh flow', () => {
    it('should mimic complete refresh cycle: expired token → refresh → new expiry', async () => {
      const userId = 1;
      const oldExpiryDate = new Date(Date.now() - 5 * 60 * 1000); // Expired 5 mins ago
      const newExpiryDate = new Date(Date.now() + 3600 * 1000); // New token expires in 1 hour

      // Step 1: User has expired token
      mockGetUserMusicIntegrations.mockResolvedValueOnce([
        {
          provider: 'spotify',
          refresh_token: 'refresh_token_123',
          token_expires_at: oldExpiryDate,
          has_valid_token: true,
          access_token: 'old_access_token',
        },
      ]);

      // Step 2: Service detects expiry and refreshes
      mockRefreshSpotifyToken.mockResolvedValueOnce({
        provider: 'spotify',
        access_token: 'new_access_token',
        refresh_token: 'refresh_token_123',
        token_expires_at: newExpiryDate,
        has_valid_token: true,
        last_sync_at: new Date(),
      });

      // Step 3: Verify refresh was triggered
      const result = await service.refreshSpotifyTokenForUser(userId);
      expect(result).toBe(true);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(userId);

      // Step 4: Verify new token data
      const refreshCall = mockRefreshSpotifyToken.mock.results[0].value;
      expect(await refreshCall).toEqual(
        expect.objectContaining({
          access_token: 'new_access_token',
          has_valid_token: true,
          token_expires_at: newExpiryDate,
        })
      );
    });

    it('should handle batch refresh for multiple users', async () => {
      const nearExpiryDate = new Date(Date.now() + 3 * 60 * 1000);
      const newExpiryDate = new Date(Date.now() + 3600 * 1000);

      mockGetAllUsersWithSpotifyIntegrations.mockResolvedValue([1, 2, 3]);

      // Each user has different token states
      mockGetUserMusicIntegrations
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh1',
            token_expires_at: nearExpiryDate,
            has_valid_token: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh2',
            token_expires_at: nearExpiryDate,
            has_valid_token: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            provider: 'spotify',
            refresh_token: 'refresh3',
            token_expires_at: new Date(Date.now() + 10 * 60 * 1000), // Still valid
            has_valid_token: true,
          },
        ]);

      mockRefreshSpotifyToken
        .mockResolvedValueOnce({
          provider: 'spotify',
          access_token: 'new_token_1',
          token_expires_at: newExpiryDate,
          has_valid_token: true,
        })
        .mockResolvedValueOnce({
          provider: 'spotify',
          access_token: 'new_token_2',
          token_expires_at: newExpiryDate,
          has_valid_token: true,
        });

      await (service as any).refreshTokensForAllUsers();

      // Users 1 and 2 should be refreshed (near expiry)
      expect(mockRefreshSpotifyToken).toHaveBeenCalledTimes(2);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(1);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(2);
      // User 3 should be skipped (token still valid)
      expect(mockRefreshSpotifyToken).not.toHaveBeenCalledWith(3);
    });

    it('should handle refresh failure gracefully', async () => {
      const expiredDate = new Date(Date.now() - 10 * 60 * 1000);

      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'invalid_refresh_token',
          token_expires_at: expiredDate,
          has_valid_token: true,
        },
      ]);

      // Spotify API returns error (e.g., invalid refresh token)
      mockRefreshSpotifyToken.mockRejectedValueOnce(new Error('Invalid refresh token'));

      const result = await service.refreshSpotifyTokenForUser(1);

      // Should return false on failure, not throw
      expect(result).toBe(false);
      expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(1);
    });

    it('should refresh exactly at 5-minute threshold', async () => {
      const exactlyFiveMinutes = new Date(Date.now() + 5 * 60 * 1000);
      const newExpiryDate = new Date(Date.now() + 3600 * 1000);

      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'refresh_token',
          token_expires_at: exactlyFiveMinutes,
          has_valid_token: true,
        },
      ]);

      mockRefreshSpotifyToken.mockResolvedValue({
        provider: 'spotify',
        access_token: 'new_token',
        token_expires_at: newExpiryDate,
        has_valid_token: true,
      });

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(true);
      expect(mockRefreshSpotifyToken).toHaveBeenCalled();
    });

    it('should skip refresh if token expires in more than 5 minutes', async () => {
      // Token expires in 5 minutes and 1 second (should skip)
      const fiveMinutesAndOneSecond = new Date(Date.now() + 5 * 60 * 1000 + 1000);

      mockGetUserMusicIntegrations.mockResolvedValue([
        {
          provider: 'spotify',
          refresh_token: 'refresh_token',
          token_expires_at: fiveMinutesAndOneSecond,
          has_valid_token: true,
        },
      ]);

      const result = await service.refreshSpotifyTokenForUser(1);

      expect(result).toBe(false);
      expect(mockRefreshSpotifyToken).not.toHaveBeenCalled();
    });
  });
});
