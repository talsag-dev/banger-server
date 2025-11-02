-- Migration: Create playlist_tracks junction table
-- Date: 2025-01-XX
-- Description: Creates junction table to track which tracks are in which playlists, supporting change tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create playlist_tracks table
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  
  -- Position in playlist (for maintaining order)
  position INTEGER NOT NULL,
  
  -- Timestamps for change tracking
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  removed_at TIMESTAMP, -- NULL = still in playlist, set when removed
  
  -- Unique constraint: same track at same position in playlist (when not removed)
  -- Using partial index for this
  CONSTRAINT playlist_tracks_playlist_track_position_unique 
    UNIQUE(playlist_id, track_id, position) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Create partial unique index for active tracks (removed_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_tracks_active_unique 
  ON playlist_tracks(playlist_id, track_id, position) 
  WHERE removed_at IS NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_active ON playlist_tracks(playlist_id, removed_at) WHERE removed_at IS NULL;

-- Migration completed: playlist_tracks junction table created with change tracking support

