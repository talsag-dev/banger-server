-- Remove legacy Spotify columns from users table
-- These are no longer used - all Spotify integration data is stored in music_integrations table

ALTER TABLE users 
  DROP COLUMN IF EXISTS spotify_id,
  DROP COLUMN IF EXISTS spotify_access_token,
  DROP COLUMN IF EXISTS spotify_refresh_token;

