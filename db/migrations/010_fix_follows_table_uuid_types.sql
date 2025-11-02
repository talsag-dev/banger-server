-- Migration: Fix follows table columns to be UUID type
-- Date: 2025-01-XX
-- Description: Ensures follower_id and following_id columns in follows table are UUID type
-- This fixes type mismatch errors when comparing with UUID parameters

DO $$ 
DECLARE
    follower_id_type TEXT;
    following_id_type TEXT;
BEGIN
    -- Check current data type of follower_id
    SELECT data_type INTO follower_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follows' AND column_name = 'follower_id';

    -- Check current data type of following_id
    SELECT data_type INTO following_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follows' AND column_name = 'following_id';

    RAISE NOTICE 'Current follower_id type: %', COALESCE(follower_id_type, 'NOT FOUND');
    RAISE NOTICE 'Current following_id type: %', COALESCE(following_id_type, 'NOT FOUND');

    -- If follower_id is not UUID, convert it
    IF follower_id_type IS NOT NULL AND follower_id_type != 'uuid' THEN
        RAISE NOTICE 'Converting follower_id from % to UUID', follower_id_type;
        
        -- Drop foreign key constraints temporarily
        ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_follower_id_fkey;
        
        -- Add temporary UUID column
        ALTER TABLE follows ADD COLUMN IF NOT EXISTS follower_id_uuid_temp UUID;
        
        -- Populate temporary column by converting existing values
        -- PostgreSQL can automatically convert VARCHAR to UUID if values are valid UUID format
        UPDATE follows 
        SET follower_id_uuid_temp = follower_id::text::UUID
        WHERE follower_id IS NOT NULL;
        
        -- Drop old column and rename
        ALTER TABLE follows DROP COLUMN IF EXISTS follower_id;
        ALTER TABLE follows RENAME COLUMN follower_id_uuid_temp TO follower_id;
        
        -- Make column NOT NULL if it should be
        ALTER TABLE follows ALTER COLUMN follower_id SET NOT NULL;
        
        -- Recreate foreign key constraint
        ALTER TABLE follows
        ADD CONSTRAINT follows_follower_id_fkey 
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Successfully converted follower_id to UUID';
    ELSIF follower_id_type = 'uuid' THEN
        RAISE NOTICE 'follower_id is already UUID type, skipping conversion';
    END IF;

    -- If following_id is not UUID, convert it
    IF following_id_type IS NOT NULL AND following_id_type != 'uuid' THEN
        RAISE NOTICE 'Converting following_id from % to UUID', following_id_type;
        
        -- Drop foreign key constraints temporarily
        ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_following_id_fkey;
        
        -- Add temporary UUID column
        ALTER TABLE follows ADD COLUMN IF NOT EXISTS following_id_uuid_temp UUID;
        
        -- Populate temporary column by converting existing values
        UPDATE follows 
        SET following_id_uuid_temp = following_id::text::UUID
        WHERE following_id IS NOT NULL;
        
        -- Drop old column and rename
        ALTER TABLE follows DROP COLUMN IF EXISTS following_id;
        ALTER TABLE follows RENAME COLUMN following_id_uuid_temp TO following_id;
        
        -- Make column NOT NULL if it should be
        ALTER TABLE follows ALTER COLUMN following_id SET NOT NULL;
        
        -- Recreate foreign key constraint
        ALTER TABLE follows
        ADD CONSTRAINT follows_following_id_fkey 
        FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Successfully converted following_id to UUID';
    ELSIF following_id_type = 'uuid' THEN
        RAISE NOTICE 'following_id is already UUID type, skipping conversion';
    END IF;

    -- Recreate indexes if they don't exist
    DROP INDEX IF EXISTS idx_follows_follower;
    DROP INDEX IF EXISTS idx_follows_following;
    
    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
    
    RAISE NOTICE 'Migration completed: follows table columns are now UUID type';
END $$;

