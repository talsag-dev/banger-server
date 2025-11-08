import { Response } from 'express';
import axios from 'axios';
import { AuthenticatedRequest } from '../middleware/auth';
import { SpotifyAuthService } from '../services/SpotifyAuthService';
import { findMusicIntegration } from '../database/queries';
import { normalizeSoundCloudTrack } from '../database/normalize';
import type { SoundCloudTrackData } from '../database/normalize';

const spotifyAuth = new SpotifyAuthService();

export const searchController = {
  /**
   * Unified search endpoint that searches across all connected music providers
   * Returns results from Spotify and SoundCloud combined
   */
  search: async (req: AuthenticatedRequest, res: Response) => {
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

      const userId = req.user!.userId;
      const searchLimit = parseInt(limit as string) || 20;
      const perProviderLimit = Math.ceil(searchLimit / 2); // Split limit between providers

      // Get integrations for both providers
      const [spotifyIntegration, soundcloudIntegration] = await Promise.all([
        findMusicIntegration(userId, 'spotify'),
        findMusicIntegration(userId, 'soundcloud'),
      ]);

      // Search both providers in parallel
      const searchPromises: Promise<any>[] = [];

      // Spotify search
      if (spotifyIntegration?.access_token && type === 'track') {
        searchPromises.push(
          spotifyAuth
            .search(q, type as string, perProviderLimit, spotifyIntegration.access_token)
            .then((results) => ({
              provider: 'spotify',
              results: results.tracks?.items || [],
            }))
            .catch((error) => {
              console.error('Error searching Spotify:', error.message);
              return { provider: 'spotify', results: [] };
            })
        );
      }

      // SoundCloud search
      if (soundcloudIntegration?.access_token && type === 'track') {
        searchPromises.push(
          axios
            .get('https://api.soundcloud.com/tracks', {
              params: {
                q,
                limit: perProviderLimit,
              },
              headers: {
                Authorization: `Bearer ${soundcloudIntegration.access_token}`,
                accept: 'application/json; charset=utf-8',
              },
            })
            .then((response) => ({
              provider: 'soundcloud',
              results: Array.isArray(response.data) ? response.data : [],
            }))
            .catch((error) => {
              console.error('Error searching SoundCloud:', error.message);
              return { provider: 'soundcloud', results: [] };
            })
        );
      }

      // Check if at least one provider is available
      if (searchPromises.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No music integration found',
          message: 'Please connect at least one music provider (Spotify or SoundCloud) to search',
          code: 'NO_INTEGRATION_CONNECTED',
        });
      }

      // Wait for all searches to complete
      const searchResults = await Promise.all(searchPromises);

      // Normalize and combine results
      const normalizedTracks: any[] = [];

      for (const { provider, results } of searchResults) {
        if (provider === 'spotify') {
          for (const track of results) {
            normalizedTracks.push({
              ...track,
              provider: 'spotify',
            });
          }
        } else if (provider === 'soundcloud') {
          for (const track of results) {
            const normalized = normalizeSoundCloudTrack(track as SoundCloudTrackData);
            // Convert normalized track to Spotify-like format for frontend compatibility
            normalizedTracks.push({
              id: normalized.external_id,
              name: normalized.name,
              artists: [{ id: '', name: normalized.artist }],
              album: {
                id: '',
                name: normalized.album || '',
                images: normalized.image_url
                  ? [{ url: normalized.image_url, height: 500, width: 500 }]
                  : [],
              },
              duration_ms: normalized.duration ? normalized.duration * 1000 : 0,
              external_urls: {
                spotify: normalized.external_url || '',
                soundcloud: normalized.external_url || '',
              },
              preview_url: normalized.preview_url || null,
              provider: 'soundcloud',
            });
          }
        }
      }

      // Limit total results
      const limitedTracks = normalizedTracks.slice(0, searchLimit);

      // Return in Spotify API format for frontend compatibility
      const results = {
        tracks: {
          items: limitedTracks,
          total: limitedTracks.length,
          limit: searchLimit,
          offset: 0,
        },
      };

      return res.status(200).json({ success: true, data: { results, query: q, type } });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to search',
        message: error.message,
        code: 'SEARCH_FAILED',
      });
    }
  },
};
