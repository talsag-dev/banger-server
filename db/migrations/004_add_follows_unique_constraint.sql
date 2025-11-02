-- Add unique constraint on follows table if it doesn't exist
-- This ensures ON CONFLICT works properly in the followUser query

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'follows'::regclass
        AND contype = 'u'
        AND conname LIKE '%follower%following%'
    ) THEN
        -- Try to add the constraint
        BEGIN
            ALTER TABLE follows
                ADD CONSTRAINT follows_follower_id_following_id_key
                UNIQUE(follower_id, following_id);
            RAISE NOTICE 'Added unique constraint on follows(follower_id, following_id)';
        EXCEPTION WHEN duplicate_table THEN
            RAISE NOTICE 'Unique constraint already exists with different name';
        END;
    ELSE
        RAISE NOTICE 'Unique constraint on follows already exists';
    END IF;
END $$;
