-- Migration: Fix posts.track_id column to be UUID type
-- Date: 2025-01-XX
-- Description: Ensures track_id column in posts table is UUID type to match tracks.id
-- This fixes type mismatch errors when joining posts with tracks table

DO $$ 
DECLARE
    track_id_type TEXT;
BEGIN
    -- Check current data type of track_id
    SELECT data_type INTO track_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'track_id';

    RAISE NOTICE 'Current posts.track_id type: %', COALESCE(track_id_type, 'NOT FOUND');

    -- If track_id is not UUID, convert it
    IF track_id_type IS NOT NULL AND track_id_type != 'uuid' THEN
        RAISE NOTICE 'Converting posts.track_id from % to UUID', track_id_type;
        
        -- Drop foreign key constraint temporarily if it exists
        ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_track_id_fkey;
        
        -- Add temporary UUID column
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS track_id_uuid_temp UUID;
        
        -- Populate temporary column by matching with tracks table
        -- Match by external_id if tracks exist, otherwise leave NULL
        UPDATE posts p
        SET track_id_uuid_temp = t.id
        FROM tracks t
        WHERE t.external_id::text = p.track_id::text
          AND p.track_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM tracks WHERE external_id::text = p.track_id::text);
        
        -- Drop old VARCHAR column
        ALTER TABLE posts DROP COLUMN IF EXISTS track_id;
        
        -- Rename UUID column to track_id
        ALTER TABLE posts RENAME COLUMN track_id_uuid_temp TO track_id;
        
        -- Recreate foreign key constraint (track_id can be NULL since tracks might not exist yet)
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'posts_track_id_fkey'
        ) THEN
            ALTER TABLE posts
            ADD CONSTRAINT posts_track_id_fkey 
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL;
        END IF;
        
        -- Recreate index
        DROP INDEX IF EXISTS idx_posts_track_id;
        CREATE INDEX IF NOT EXISTS idx_posts_track_id ON posts(track_id);
        
        RAISE NOTICE 'Successfully converted posts.track_id from % to UUID', track_id_type;
    ELSIF track_id_type = 'uuid' THEN
        RAISE NOTICE 'posts.track_id is already UUID type, skipping conversion';
    END IF;

    RAISE NOTICE 'Migration completed: posts.track_id is now UUID type';
END $$;

