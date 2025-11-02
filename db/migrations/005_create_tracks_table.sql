-- Migration: Create normalized tracks table
-- Date: 2025-01-XX
-- Description: Creates tracks table to normalize track data from all music providers (Spotify, Apple Music, YouTube Music, SoundCloud)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tracks table
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('spotify', 'apple-music', 'youtube-music', 'soundcloud')),
  
  -- Normalized track metadata (unified across all providers)
  name VARCHAR(500) NOT NULL,
  artist VARCHAR(500) NOT NULL,
  album VARCHAR(500),
  duration INTEGER, -- in seconds
  image_url TEXT,
  preview_url TEXT,
  external_url TEXT,
  
  -- Additional metadata (provider-specific fields stored as JSON)
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint: same track from same provider = same record
  UNIQUE(provider, external_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tracks_provider_external ON tracks(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_name ON tracks(name);
CREATE INDEX IF NOT EXISTS idx_tracks_updated_at ON tracks(updated_at DESC);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_tracks_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Migration completed: tracks table created with normalized schema

