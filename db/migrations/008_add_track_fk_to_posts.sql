-- Migration: Add track FK to posts table
-- Date: 2025-01-XX
-- Description: Adds foreign key reference to normalized tracks table, keeping old columns for backward compatibility during migration

-- Note: The existing track_id column is VARCHAR(255) containing external track IDs
-- We'll rename it temporarily, add the new UUID FK column, then keep both for migration period

-- Rename old track_id to track_external_id_old (if not already renamed)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'track_id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE posts RENAME COLUMN track_id TO track_external_id_old;
    RAISE NOTICE 'Renamed old track_id column to track_external_id_old';
  END IF;
END $$;

-- Add new track_id FK column (UUID, nullable initially for migration)
ALTER TABLE posts 
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES tracks(id);

-- Add track_provider column (optional, for direct queries)
ALTER TABLE posts 
  ADD COLUMN IF NOT EXISTS track_provider VARCHAR(50);

-- Add index for track_id FK lookups
CREATE INDEX IF NOT EXISTS idx_posts_track_id ON posts(track_id);

-- Add index for track_provider
CREATE INDEX IF NOT EXISTS idx_posts_track_provider ON posts(track_provider);

-- Migration completed: Added track_id FK and track_provider columns to posts table

