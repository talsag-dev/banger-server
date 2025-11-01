-- Migration: Convert all remaining IDs from SERIAL/INTEGER to UUID
-- Date: 2025-01-XX
-- Description: Converts all table IDs (posts, reactions, comments, music_integrations, follows) and foreign key references to UUID
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Add temporary UUID columns for primary keys
DO $$ BEGIN
    -- Add id_uuid to posts table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'posts' AND column_name = 'id_uuid'
    ) THEN
        ALTER TABLE posts ADD COLUMN id_uuid UUID DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Added id_uuid column to posts table';
    END IF;

    -- Add id_uuid to music_integrations table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'music_integrations' AND column_name = 'id_uuid'
    ) THEN
        ALTER TABLE music_integrations ADD COLUMN id_uuid UUID DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Added id_uuid column to music_integrations table';
    END IF;

    -- Add id_uuid to reactions table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reactions' AND column_name = 'id_uuid'
    ) THEN
        ALTER TABLE reactions ADD COLUMN id_uuid UUID DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Added id_uuid column to reactions table';
    END IF;

    -- Add id_uuid to comments table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'comments' AND column_name = 'id_uuid'
    ) THEN
        ALTER TABLE comments ADD COLUMN id_uuid UUID DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Added id_uuid column to comments table';
    END IF;

    -- Add id_uuid to follows table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'follows' AND column_name = 'id_uuid'
    ) THEN
        ALTER TABLE follows ADD COLUMN id_uuid UUID DEFAULT uuid_generate_v4();
        RAISE NOTICE 'Added id_uuid column to follows table';
    END IF;

    -- Add post_id_uuid to reactions table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reactions' AND column_name = 'post_id_uuid'
    ) THEN
        ALTER TABLE reactions ADD COLUMN post_id_uuid UUID;
        RAISE NOTICE 'Added post_id_uuid column to reactions table';
    END IF;

    -- Add post_id_uuid to comments table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'comments' AND column_name = 'post_id_uuid'
    ) THEN
        ALTER TABLE comments ADD COLUMN post_id_uuid UUID;
        RAISE NOTICE 'Added post_id_uuid column to comments table';
    END IF;
END $$;

-- Step 2: Generate UUIDs for existing rows if they don't have one
UPDATE posts SET id_uuid = uuid_generate_v4() WHERE id_uuid IS NULL;
UPDATE music_integrations SET id_uuid = uuid_generate_v4() WHERE id_uuid IS NULL;
UPDATE reactions SET id_uuid = uuid_generate_v4() WHERE id_uuid IS NULL;
UPDATE comments SET id_uuid = uuid_generate_v4() WHERE id_uuid IS NULL;
UPDATE follows SET id_uuid = uuid_generate_v4() WHERE id_uuid IS NULL;

-- Step 3: Populate foreign key UUID columns based on integer relationships
DO $$ BEGIN
    -- Update reactions.post_id_uuid if old post_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reactions' AND column_name = 'post_id'
    ) THEN
        UPDATE reactions r
        SET post_id_uuid = p.id_uuid
        FROM posts p
        WHERE r.post_id = p.id
        AND r.post_id_uuid IS NULL;
    END IF;

    -- Update comments.post_id_uuid if old post_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'comments' AND column_name = 'post_id'
    ) THEN
        UPDATE comments c
        SET post_id_uuid = p.id_uuid
        FROM posts p
        WHERE c.post_id = p.id
        AND c.post_id_uuid IS NULL;
    END IF;
END $$;

-- Step 4: Drop foreign key constraints and unique constraints that reference integer columns
DO $$ DECLARE r RECORD;
BEGIN
    -- Drop all foreign key constraints referencing posts.id
    FOR r IN (
        SELECT conname, conrelid::regclass AS table_name
        FROM pg_constraint
        WHERE confrelid = 'posts'::regclass AND contype = 'f'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT IF EXISTS ' || r.conname;
        RAISE NOTICE 'Dropped constraint % from %', r.conname, r.table_name;
    END LOOP;

    -- Drop unique constraints on reactions that might reference post_id (will recreate after column rename)
    -- This handles the UNIQUE(user_id, post_id, reaction_type) constraint
    FOR r IN (
        SELECT conname
        FROM pg_constraint c
        WHERE c.conrelid = 'reactions'::regclass
        AND c.contype = 'u'
        AND EXISTS (
            SELECT 1 FROM pg_attribute a
            WHERE a.attrelid = c.conrelid
            AND a.attnum = ANY(c.conkey)
            AND a.attname = 'post_id'
        )
    ) LOOP
        EXECUTE 'ALTER TABLE reactions DROP CONSTRAINT IF EXISTS ' || r.conname;
        RAISE NOTICE 'Dropped unique constraint % from reactions table', r.conname;
    END LOOP;
END $$;

-- Step 5: Drop old integer columns for foreign keys
ALTER TABLE reactions DROP COLUMN IF EXISTS post_id;
ALTER TABLE comments DROP COLUMN IF EXISTS post_id;

-- Step 6: Convert posts.id to UUID first (since it's referenced by reactions and comments)
DO $$ BEGIN
    -- Drop primary key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'posts_pkey' AND conrelid = 'posts'::regclass
    ) THEN
        ALTER TABLE posts DROP CONSTRAINT posts_pkey;
        RAISE NOTICE 'Dropped primary key constraint on posts table';
    END IF;
END $$;

ALTER TABLE posts DROP COLUMN IF EXISTS id;
ALTER TABLE posts RENAME COLUMN id_uuid TO id;
ALTER TABLE posts ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE posts ADD PRIMARY KEY (id);

-- Step 7: Rename foreign key UUID columns to final names
ALTER TABLE reactions RENAME COLUMN post_id_uuid TO post_id;
ALTER TABLE comments RENAME COLUMN post_id_uuid TO post_id;

-- Step 8: Convert music_integrations.id to UUID
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'music_integrations_pkey' AND conrelid = 'music_integrations'::regclass
    ) THEN
        ALTER TABLE music_integrations DROP CONSTRAINT music_integrations_pkey;
        RAISE NOTICE 'Dropped primary key constraint on music_integrations table';
    END IF;
END $$;

ALTER TABLE music_integrations DROP COLUMN IF EXISTS id;
ALTER TABLE music_integrations RENAME COLUMN id_uuid TO id;
ALTER TABLE music_integrations ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE music_integrations ADD PRIMARY KEY (id);

-- Step 9: Convert reactions.id to UUID
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reactions_pkey' AND conrelid = 'reactions'::regclass
    ) THEN
        ALTER TABLE reactions DROP CONSTRAINT reactions_pkey;
        RAISE NOTICE 'Dropped primary key constraint on reactions table';
    END IF;
END $$;

ALTER TABLE reactions DROP COLUMN IF EXISTS id;
ALTER TABLE reactions RENAME COLUMN id_uuid TO id;
ALTER TABLE reactions ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE reactions ADD PRIMARY KEY (id);

-- Step 10: Convert comments.id to UUID
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'comments_pkey' AND conrelid = 'comments'::regclass
    ) THEN
        ALTER TABLE comments DROP CONSTRAINT comments_pkey;
        RAISE NOTICE 'Dropped primary key constraint on comments table';
    END IF;
END $$;

ALTER TABLE comments DROP COLUMN IF EXISTS id;
ALTER TABLE comments RENAME COLUMN id_uuid TO id;
ALTER TABLE comments ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE comments ADD PRIMARY KEY (id);

-- Step 11: Convert follows.id to UUID
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'follows_pkey' AND conrelid = 'follows'::regclass
    ) THEN
        ALTER TABLE follows DROP CONSTRAINT follows_pkey;
        RAISE NOTICE 'Dropped primary key constraint on follows table';
    END IF;
END $$;

ALTER TABLE follows DROP COLUMN IF EXISTS id;
ALTER TABLE follows RENAME COLUMN id_uuid TO id;
ALTER TABLE follows ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE follows ADD PRIMARY KEY (id);

-- Step 12: Recreate foreign key constraints and unique constraints
ALTER TABLE reactions
    ADD CONSTRAINT reactions_post_id_fkey 
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

ALTER TABLE comments
    ADD CONSTRAINT comments_post_id_fkey 
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

-- Recreate unique constraint on reactions (if it doesn't already exist)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'reactions'::regclass
        AND contype = 'u'
        AND array_length(conkey, 1) = 3
    ) THEN
        ALTER TABLE reactions
            ADD CONSTRAINT reactions_user_id_post_id_reaction_type_key
            UNIQUE(user_id, post_id, reaction_type);
        RAISE NOTICE 'Recreated unique constraint on reactions table';
    END IF;
END $$;

-- Step 13: Update indexes (drop and recreate with UUID columns)
DROP INDEX IF EXISTS idx_reactions_post_id;
DROP INDEX IF EXISTS idx_comments_post_id;

CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

-- Migration completed: All IDs converted to UUID

