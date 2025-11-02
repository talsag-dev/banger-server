-- Migration: Create normalized playlists table
-- Date: 2025-01-XX
-- Description: Creates playlists table to normalize playlist data from all music providers

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) NOT NULL,
  
  -- User who owns/created this playlist (in our system)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Provider identification
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('spotify', 'apple-music', 'youtube-music', 'soundcloud')),
  
  -- Normalized playlist metadata
  name VARCHAR(500) NOT NULL,
  description TEXT,
  image_url TEXT,
  owner VARCHAR(255), -- Playlist owner name from provider
  track_count INTEGER DEFAULT 0,
  external_url TEXT,
  
  -- For tracking changes (Spotify uses snapshot_id, others can use similar)
  snapshot_id VARCHAR(255), -- Provider-specific change tracking ID
  
  -- Timestamps
  last_synced_at TIMESTAMP, -- Last time we synced from provider
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint: same playlist from same provider for same user = same record
  UNIQUE(user_id, provider, external_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_playlists_user_provider ON playlists(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_playlists_provider_external ON playlists(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_playlists_last_synced ON playlists(last_synced_at);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_playlists_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Migration completed: playlists table created with normalized schema

