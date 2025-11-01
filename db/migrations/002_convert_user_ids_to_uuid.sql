-- Migration: Convert user IDs from INTEGER to UUID
-- Date: 2025-01-XX
-- Description: Converts all user.id and foreign key references from INTEGER to UUID
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Add temporary UUID columns
DO $$ BEGIN
IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'users'
        AND column_name = 'id_uuid'
) THEN
    ALTER TABLE
        users
    ADD
        COLUMN id_uuid UUID DEFAULT uuid_generate_v4();

    RAISE NOTICE 'Added id_uuid column to users table';

END IF;

IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'music_integrations'
        AND column_name = 'user_id_uuid'
) THEN
    ALTER TABLE
        music_integrations
    ADD
        COLUMN user_id_uuid UUID;

    RAISE NOTICE 'Added user_id_uuid column to music_integrations table';

END IF;

IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'posts'
        AND column_name = 'user_id_uuid'
) THEN
    ALTER TABLE
        posts
    ADD
        COLUMN user_id_uuid UUID;

    RAISE NOTICE 'Added user_id_uuid column to posts table';

END IF;

IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'reactions'
        AND column_name = 'user_id_uuid'
) THEN
    ALTER TABLE
        reactions
    ADD
        COLUMN user_id_uuid UUID;

    RAISE NOTICE 'Added user_id_uuid column to reactions table';

END IF;

IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'comments'
        AND column_name = 'user_id_uuid'
) THEN
    ALTER TABLE
        comments
    ADD
        COLUMN user_id_uuid UUID;

    RAISE NOTICE 'Added user_id_uuid column to comments table';

END IF;

IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'follows'
        AND column_name = 'follower_id_uuid'
) THEN
    ALTER TABLE
        follows
    ADD
        COLUMN follower_id_uuid UUID;

    ALTER TABLE
        follows
    ADD
        COLUMN following_id_uuid UUID;

    RAISE NOTICE 'Added follower_id_uuid and following_id_uuid columns to follows table';

END IF;

END $$;

-- Step 2: Generate UUIDs for existing users if they don't have one
UPDATE
    users
SET
    id_uuid = uuid_generate_v4()
WHERE
    id_uuid IS NULL;

-- Step 3: Populate foreign key UUID columns based on integer relationships
-- Only update if old integer columns still exist
DO $$ BEGIN
    -- Update music_integrations if old user_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'music_integrations' AND column_name = 'user_id'
    ) THEN
        UPDATE
            music_integrations mi
        SET
            user_id_uuid = u.id_uuid
        FROM
            users u
        WHERE
            mi.user_id = u.id
            AND mi.user_id_uuid IS NULL;
    END IF;

    -- Update posts if old user_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'posts' AND column_name = 'user_id'
    ) THEN
        UPDATE
            posts p
        SET
            user_id_uuid = u.id_uuid
        FROM
            users u
        WHERE
            p.user_id = u.id
            AND p.user_id_uuid IS NULL;
    END IF;

    -- Update reactions if old user_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reactions' AND column_name = 'user_id'
    ) THEN
        UPDATE
            reactions r
        SET
            user_id_uuid = u.id_uuid
        FROM
            users u
        WHERE
            r.user_id = u.id
            AND r.user_id_uuid IS NULL;
    END IF;

    -- Update comments if old user_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'comments' AND column_name = 'user_id'
    ) THEN
        UPDATE
            comments c
        SET
            user_id_uuid = u.id_uuid
        FROM
            users u
        WHERE
            c.user_id = u.id
            AND c.user_id_uuid IS NULL;
    END IF;

    -- Update follows if old follower_id and following_id columns exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'follows' AND column_name = 'follower_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'follows' AND column_name = 'following_id'
    ) THEN
        UPDATE
            follows f
        SET
            follower_id_uuid = u1.id_uuid,
            following_id_uuid = u2.id_uuid
        FROM
            users u1,
            users u2
        WHERE
            f.follower_id = u1.id
            AND f.following_id = u2.id
            AND (f.follower_id_uuid IS NULL OR f.following_id_uuid IS NULL);
    END IF;
END $$;

-- Step 4: Drop foreign key constraints
DO $$ DECLARE r RECORD;

BEGIN
    -- Drop all foreign key constraints referencing users.id
    FOR r IN (
        SELECT
            conname,
            conrelid::regclass AS table_name
        FROM
            pg_constraint
        WHERE
            confrelid = 'users'::regclass
            AND contype = 'f'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT IF EXISTS ' || r.conname;

        RAISE NOTICE 'Dropped constraint % from %', r.conname, r.table_name;

    END LOOP;

END $$;

-- Step 5: Drop old columns
ALTER TABLE
    music_integrations DROP COLUMN IF EXISTS user_id;

ALTER TABLE
    posts DROP COLUMN IF EXISTS user_id;

ALTER TABLE
    reactions DROP COLUMN IF EXISTS user_id;

ALTER TABLE
    comments DROP COLUMN IF EXISTS user_id;

ALTER TABLE
    follows DROP COLUMN IF EXISTS follower_id;

ALTER TABLE
    follows DROP COLUMN IF EXISTS following_id;

-- Step 6: Drop primary key constraint and old id column, then rename UUID column
DO $$ BEGIN
    -- Drop primary key constraint if it exists
    IF EXISTS (
        SELECT
            1
        FROM
            pg_constraint
        WHERE
            conname = 'users_pkey'
            AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE
            users DROP CONSTRAINT users_pkey;

        RAISE NOTICE 'Dropped primary key constraint on users table';

    END IF;

END $$;

ALTER TABLE
    users DROP COLUMN IF EXISTS id;

ALTER TABLE
    users RENAME COLUMN id_uuid TO id;

ALTER TABLE
    users
ALTER COLUMN
    id
SET
    DEFAULT uuid_generate_v4();

ALTER TABLE
    users
ADD
    PRIMARY KEY (id);

ALTER TABLE
    music_integrations RENAME COLUMN user_id_uuid TO user_id;

ALTER TABLE
    posts RENAME COLUMN user_id_uuid TO user_id;

ALTER TABLE
    reactions RENAME COLUMN user_id_uuid TO user_id;

ALTER TABLE
    comments RENAME COLUMN user_id_uuid TO user_id;

ALTER TABLE
    follows RENAME COLUMN follower_id_uuid TO follower_id;

ALTER TABLE
    follows RENAME COLUMN following_id_uuid TO following_id;

-- Step 7: Recreate foreign key constraints
ALTER TABLE
    music_integrations
ADD
    CONSTRAINT music_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE
    posts
ADD
    CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE
    reactions
ADD
    CONSTRAINT reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE
    comments
ADD
    CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE
    follows
ADD
    CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE
    follows
ADD
    CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE;

-- Step 8: Update indexes
DROP INDEX IF EXISTS idx_posts_user_id;

DROP INDEX IF EXISTS idx_music_integrations_user_id;

DROP INDEX IF EXISTS idx_follows_follower;

DROP INDEX IF EXISTS idx_follows_following;

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);

CREATE INDEX IF NOT EXISTS idx_music_integrations_user_id ON music_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- Migration completed: All user IDs converted to UUID