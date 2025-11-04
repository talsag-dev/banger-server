-- Create users table with multi-provider authentication support
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    -- Multi-provider authentication
    auth_provider VARCHAR(50),
    -- 'google', 'apple', 'email', 'spotify'
    google_id VARCHAR(255),
    apple_id VARCHAR(255),
    password_hash VARCHAR(255),
    -- for email auth
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    -- User profile
    email VARCHAR(255),
    username VARCHAR(255),
    display_name VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create music_integrations table for separate music service connections
CREATE TABLE IF NOT EXISTS music_integrations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    -- 'spotify', 'apple-music', 'youtube-music', 'soundcloud'
    provider_user_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    is_connected BOOLEAN DEFAULT TRUE,
    has_valid_token BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    track_id VARCHAR(255) NOT NULL,
    track_name VARCHAR(255) NOT NULL,
    artist_name VARCHAR(255) NOT NULL,
    album_name VARCHAR(255),
    track_image TEXT,
    track_preview_url TEXT,
    track_external_url TEXT,
    track_duration INTEGER,
    feeling VARCHAR(50),
    caption TEXT,
    is_currently_listening BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create reactions table
CREATE TABLE IF NOT EXISTS reactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reaction_type VARCHAR(50) NOT NULL,
    -- 'love', 'fire', 'heart_eyes', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id, reaction_type)
);

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create follows table (for user relationships)
CREATE TABLE IF NOT EXISTS follows (
    id SERIAL PRIMARY KEY,
    follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON reactions(post_id);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users(spotify_id);

CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Music integration indexes
CREATE INDEX IF NOT EXISTS idx_music_integrations_user_id ON music_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_music_integrations_provider ON music_integrations(provider);

-- Add constraints (using DO blocks to handle IF NOT EXISTS)
DO $ $ BEGIN -- Add auth_provider constraint if it doesn't exist
IF NOT EXISTS (
    SELECT
        1
    FROM
        pg_constraint
    WHERE
        conname = 'check_auth_provider'
) THEN
ALTER TABLE
    users
ADD
    CONSTRAINT check_auth_provider CHECK (
        auth_provider IN ('google', 'apple', 'email', 'spotify')
    );

END IF;

-- Add music_provider constraint if it doesn't exist
IF NOT EXISTS (
    SELECT
        1
    FROM
        pg_constraint
    WHERE
        conname = 'check_music_provider'
) THEN
ALTER TABLE
    music_integrations
ADD
    CONSTRAINT check_music_provider CHECK (
        provider IN (
            'spotify',
            'apple-music',
            'youtube-music',
            'soundcloud'
        )
    );

END IF;

END $ $;

-- Create a function to update the updated_at timestamp
CREATE
OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $ $ BEGIN NEW.updated_at = CURRENT_TIMESTAMP;

RETURN NEW;

END;

$ $ LANGUAGE 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

CREATE TRIGGER update_users_updated_at BEFORE
UPDATE
    ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_music_integrations_updated_at ON music_integrations;

CREATE TRIGGER update_music_integrations_updated_at BEFORE
UPDATE
    ON music_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data for development
INSERT INTO
    users (
        spotify_id,
        username,
        display_name,
        email,
        bio,
        avatar_url
    )
VALUES
    (
        'sample_user_1',
        'musiclover',
        'Music Lover',
        'music@example.com',
        'Discovering new beats every day 🎵',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face'
    ) ON CONFLICT (spotify_id) DO NOTHING;