-- Migration: Drop track_external_id_old column
-- Date: 2025-11-08
-- Description: Drops the track_external_id_old column as it's no longer needed after migration to normalized tracks table

-- Drop track_external_id_old column (migration artifact, no longer needed)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' 
    AND column_name = 'track_external_id_old'
  ) THEN
    ALTER TABLE posts 
      DROP COLUMN track_external_id_old;
    
    RAISE NOTICE 'Dropped track_external_id_old column (migration artifact no longer needed)';
  ELSE
    RAISE NOTICE 'track_external_id_old column does not exist, skipping';
  END IF;
END $$;

