-- Migration: Migrate existing posts to use normalized tracks table
-- Date: 2025-01-XX
-- Description: Migrates existing posts with denormalized track data to use FK references to normalized tracks table

-- Step 1: Create tracks from existing posts data
-- This will deduplicate tracks (same provider + external_id = same track)
DO $$
DECLARE
  post_record RECORD;
  track_record RECORD;
  new_track_id UUID;
  detected_provider VARCHAR(50);
  track_external_id VARCHAR(255);
  has_old_column BOOLEAN;
BEGIN
  -- Check if track_external_id_old column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'track_external_id_old'
  ) INTO has_old_column;

  IF NOT has_old_column THEN
    RAISE NOTICE 'track_external_id_old column does not exist, skipping data migration (no existing posts to migrate)';
    RETURN;
  END IF;

  -- Loop through all posts that don't have a track_id FK yet
  -- Check for both track_external_id_old (renamed old column) and track_id (if migration partially done)
  FOR post_record IN 
    SELECT id, 
           track_external_id_old as old_track_id,
           track_name, artist_name, album_name, track_image, 
           track_preview_url, track_external_url, track_duration, track_provider,
           track_id as current_track_id_fk
    FROM posts
    WHERE (track_id IS NULL OR track_id NOT IN (SELECT id FROM tracks WHERE id IS NOT NULL))
      AND track_external_id_old IS NOT NULL
  LOOP
    -- Detect provider from track_external_url or use track_provider if available
    IF post_record.track_provider IS NOT NULL THEN
      detected_provider := post_record.track_provider;
    ELSIF post_record.track_external_url LIKE '%spotify%' THEN
      detected_provider := 'spotify';
    ELSIF post_record.track_external_url LIKE '%apple%' OR post_record.track_external_url LIKE '%music.apple%' THEN
      detected_provider := 'apple-music';
    ELSIF post_record.track_external_url LIKE '%youtube%' THEN
      detected_provider := 'youtube-music';
    ELSIF post_record.track_external_url LIKE '%soundcloud%' THEN
      detected_provider := 'soundcloud';
    ELSE
      detected_provider := 'spotify'; -- Default to spotify
    END IF;

    -- Use old track_external_id_old as external_id (it's the provider's track ID)
    track_external_id := post_record.old_track_id;

    -- Check if track already exists in tracks table
    SELECT id INTO new_track_id
    FROM tracks
    WHERE provider = detected_provider AND external_id = track_external_id;

    -- If track doesn't exist, create it
    IF new_track_id IS NULL THEN
      INSERT INTO tracks (
        external_id,
        provider,
        name,
        artist,
        album,
        duration,
        image_url,
        preview_url,
        external_url
      )
      VALUES (
        track_external_id,
        detected_provider,
        post_record.track_name,
        post_record.artist_name,
        post_record.album_name,
        post_record.track_duration,
        post_record.track_image,
        post_record.track_preview_url,
        post_record.track_external_url
      )
      RETURNING id INTO new_track_id;
    END IF;

    -- Update post to reference the normalized track
    UPDATE posts
    SET 
      track_id = new_track_id,
      track_provider = detected_provider
    WHERE id = post_record.id;

    RAISE NOTICE 'Migrated post % to use track %', post_record.id, new_track_id;
  END LOOP;
END $$;

-- Step 2: Verify migration (check for posts without track FK)
DO $$
DECLARE
  unmigrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
  FROM posts
  WHERE track_id IS NULL;

  IF unmigrated_count > 0 THEN
    RAISE WARNING 'There are % posts without track_id FK after migration', unmigrated_count;
  ELSE
    RAISE NOTICE 'Migration completed successfully: All posts have track_id FK';
  END IF;
END $$;

-- Migration completed: Existing posts now reference normalized tracks table

