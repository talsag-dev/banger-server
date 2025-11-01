import { pool } from './connection';
import type {
  User,
  Post,
  MusicIntegration,
  CreateUserData,
  CreatePostData,
  CreateMusicIntegrationData,
} from './types';

// User queries
export const createUser = async (userData: CreateUserData): Promise<User> => {
  const { rows } = await pool.query(
    `INSERT INTO users (auth_provider, google_id, apple_id, spotify_id, email, password_hash, display_name, avatar_url, bio, email_verified) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
     RETURNING *`,
    [
      userData.auth_provider,
      userData.google_id,
      userData.apple_id,
      userData.spotify_id,
      userData.email,
      userData.password_hash,
      userData.display_name,
      userData.avatar_url,
      userData.bio,
      userData.email_verified || false,
    ]
  );
  return rows[0];
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
};

export const findUserByGoogleId = async (googleId: string): Promise<User | null> => {
  const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  return rows[0] || null;
};

export const findUserByAppleId = async (appleId: string): Promise<User | null> => {
  const { rows } = await pool.query('SELECT * FROM users WHERE apple_id = $1', [appleId]);
  return rows[0] || null;
};

export const findUserBySpotifyId = async (spotifyId: string): Promise<User | null> => {
  const { rows } = await pool.query('SELECT * FROM users WHERE spotify_id = $1', [spotifyId]);
  return rows[0] || null;
};

export const findUserById = async (id: number): Promise<User | null> => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
};

export const updateUser = async (
  userId: number,
  userData: {
    email?: string;
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    email_verified?: boolean;
  }
): Promise<User | null> => {
  const { rows } = await pool.query(
    `UPDATE users 
     SET email = COALESCE($2, email), 
         display_name = COALESCE($3, display_name), 
         avatar_url = COALESCE($4, avatar_url),
         bio = COALESCE($5, bio),
         email_verified = COALESCE($6, email_verified),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 
     RETURNING *`,
    [
      userId,
      userData.email,
      userData.display_name,
      userData.avatar_url,
      userData.bio,
      userData.email_verified,
    ]
  );
  return rows[0] || null;
};

export const updateUserPassword = async (
  userId: number,
  passwordHash: string
): Promise<User | null> => {
  const { rows } = await pool.query(
    `UPDATE users 
     SET password_hash = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 
     RETURNING *`,
    [userId, passwordHash]
  );
  return rows[0] || null;
};

export const setResetToken = async (
  userId: number,
  resetToken: string,
  expiresAt: Date
): Promise<void> => {
  await pool.query(
    `UPDATE users 
     SET reset_token = $2, reset_token_expires = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId, resetToken, expiresAt]
  );
};

export const findUserByResetToken = async (resetToken: string): Promise<User | null> => {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
    [resetToken]
  );
  return rows[0] || null;
};

export const clearResetToken = async (userId: number): Promise<void> => {
  await pool.query(
    `UPDATE users 
     SET reset_token = NULL, reset_token_expires = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
};

// Music Integration queries
export const createMusicIntegration = async (
  integrationData: CreateMusicIntegrationData
): Promise<MusicIntegration> => {
  const { rows } = await pool.query(
    `INSERT INTO music_integrations (user_id, provider, provider_user_id, display_name, avatar_url, access_token, refresh_token, token_expires_at) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
     RETURNING *`,
    [
      integrationData.user_id,
      integrationData.provider,
      integrationData.provider_user_id,
      integrationData.display_name,
      integrationData.avatar_url,
      integrationData.access_token,
      integrationData.refresh_token,
      integrationData.token_expires_at,
    ]
  );
  return rows[0];
};

export const findMusicIntegration = async (
  userId: number,
  provider: string
): Promise<MusicIntegration | null> => {
  const { rows } = await pool.query(
    'SELECT * FROM music_integrations WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  return rows[0] || null;
};

export const getUserMusicIntegrations = async (userId: number): Promise<MusicIntegration[]> => {
  const { rows } = await pool.query(
    'SELECT * FROM music_integrations WHERE user_id = $1 ORDER BY connected_at DESC',
    [userId]
  );
  return rows;
};

export const getAllUsersWithSpotifyIntegrations = async (): Promise<number[]> => {
  const { rows } = await pool.query(
    'SELECT DISTINCT user_id FROM music_integrations WHERE provider = $1 AND refresh_token IS NOT NULL AND is_connected = TRUE',
    ['spotify']
  );
  return rows.map((row) => row.user_id);
};

export const updateMusicIntegrationTokens = async (
  userId: number,
  provider: string,
  tokens: {
    access_token?: string;
    refresh_token?: string;
    token_expires_at?: Date;
    has_valid_token?: boolean;
    last_sync_at?: Date;
  }
): Promise<MusicIntegration | null> => {
  const { rows } = await pool.query(
    `UPDATE music_integrations 
     SET access_token = COALESCE($3, access_token),
         refresh_token = COALESCE($4, refresh_token),
         token_expires_at = COALESCE($5, token_expires_at),
         has_valid_token = COALESCE($6, has_valid_token),
         last_sync_at = COALESCE($7, last_sync_at),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND provider = $2
     RETURNING *`,
    [
      userId,
      provider,
      tokens.access_token ?? null,
      tokens.refresh_token ?? null,
      tokens.token_expires_at ?? null,
      tokens.has_valid_token ?? null,
      tokens.last_sync_at ?? null,
    ]
  );
  return rows[0] || null;
};

export const updateMusicIntegration = async (
  userId: number,
  provider: string,
  updates: {
    display_name?: string;
    avatar_url?: string;
    access_token?: string;
    refresh_token?: string;
    token_expires_at?: Date;
    has_valid_token?: boolean;
    last_sync_at?: Date;
  }
): Promise<MusicIntegration | null> => {
  const { rows } = await pool.query(
    `UPDATE music_integrations 
     SET display_name = COALESCE($3, display_name),
         avatar_url = COALESCE($4, avatar_url),
         access_token = COALESCE($5, access_token),
         refresh_token = COALESCE($6, refresh_token),
         token_expires_at = COALESCE($7, token_expires_at),
         has_valid_token = COALESCE($8, has_valid_token),
         last_sync_at = COALESCE($9, last_sync_at),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND provider = $2
     RETURNING *`,
    [
      userId,
      provider,
      updates.display_name ?? null,
      updates.avatar_url ?? null,
      updates.access_token ?? null,
      updates.refresh_token ?? null,
      updates.token_expires_at ?? null,
      updates.has_valid_token ?? null,
      updates.last_sync_at ?? null,
    ]
  );
  return rows[0] || null;
};

export const disconnectMusicIntegration = async (
  userId: number,
  provider: string
): Promise<void> => {
  await pool.query(
    `UPDATE music_integrations 
     SET is_connected = FALSE, 
         has_valid_token = FALSE,
         access_token = NULL,
         refresh_token = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );
};

export const deleteMusicIntegration = async (userId: number, provider: string): Promise<void> => {
  await pool.query('DELETE FROM music_integrations WHERE user_id = $1 AND provider = $2', [
    userId,
    provider,
  ]);
};

// Legacy Spotify support (for backward compatibility)
export const upsertUser = async (userData: {
  spotify_id: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  spotify_access_token?: string;
  spotify_refresh_token?: string;
}): Promise<User> => {
  const { rows } = await pool.query(
    `INSERT INTO users (auth_provider, spotify_id, email, display_name, avatar_url, bio) 
     VALUES ('spotify', $1, $2, $3, $4, $5)
     ON CONFLICT (spotify_id) 
     DO UPDATE SET 
       email = COALESCE(EXCLUDED.email, users.email),
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       bio = COALESCE(EXCLUDED.bio, users.bio),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userData.spotify_id, userData.email, userData.display_name, userData.avatar_url, userData.bio]
  );

  const user = rows[0];

  // Also create/update the Spotify music integration
  if (userData.spotify_access_token) {
    await pool.query(
      `INSERT INTO music_integrations (user_id, provider, provider_user_id, display_name, avatar_url, access_token, refresh_token)
       VALUES ($1, 'spotify', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, music_integrations.display_name),
         avatar_url = COALESCE(EXCLUDED.avatar_url, music_integrations.avatar_url),
         access_token = COALESCE(EXCLUDED.access_token, music_integrations.access_token),
         refresh_token = COALESCE(EXCLUDED.refresh_token, music_integrations.refresh_token),
         has_valid_token = TRUE,
         updated_at = CURRENT_TIMESTAMP`,
      [
        user.id,
        userData.spotify_id,
        userData.display_name,
        userData.avatar_url,
        userData.spotify_access_token,
        userData.spotify_refresh_token,
      ]
    );
  }

  return user;
};

export const updateUserTokens = async (
  spotifyId: string,
  accessToken: string,
  refreshToken: string
): Promise<User | null> => {
  // Update tokens in music_integrations table instead
  const user = await findUserBySpotifyId(spotifyId);
  if (!user) return null;

  await updateMusicIntegration(user.id, 'spotify', {
    access_token: accessToken,
    refresh_token: refreshToken,
    has_valid_token: true,
    last_sync_at: new Date(),
  });

  return user;
};

export const getUserSpotifyTokens = async (
  userId: number
): Promise<{ spotify_access_token: string; spotify_refresh_token: string } | null> => {
  const integration = await findMusicIntegration(userId, 'spotify');
  if (!integration?.access_token || !integration?.refresh_token) {
    return null;
  }

  return {
    spotify_access_token: integration.access_token,
    spotify_refresh_token: integration.refresh_token,
  };
};

// Post queries
export const createPost = async (postData: CreatePostData): Promise<Post> => {
  const { rows } = await pool.query(
    `INSERT INTO posts (user_id, track_id, track_name, artist_name, album_name, track_image, track_preview_url, track_external_url, feeling, caption, is_currently_listening) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
     RETURNING *`,
    [
      postData.user_id,
      postData.track_id,
      postData.track_name,
      postData.artist_name,
      postData.album_name,
      postData.track_image,
      postData.track_preview_url,
      postData.track_external_url,
      postData.feeling,
      postData.caption,
      postData.is_currently_listening || false,
    ]
  );
  return rows[0];
};

export const getPosts = async (limit = 20, offset = 0) => {
  const { rows } = await pool.query(
    `
    SELECT 
      p.*,
      u.display_name,
      u.avatar_url,
      COUNT(DISTINCT r.id) as reaction_count,
      COUNT(DISTINCT c.id) as comment_count,
      ARRAY_AGG(DISTINCT r.reaction_type) FILTER (WHERE r.reaction_type IS NOT NULL) as reaction_types
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN reactions r ON p.id = r.post_id
    LEFT JOIN comments c ON p.id = c.post_id
    GROUP BY p.id, u.display_name, u.avatar_url
    ORDER BY p.created_at DESC
    LIMIT $1 OFFSET $2
  `,
    [limit, offset]
  );
  return rows;
};

export const getUserPosts = async (userId: number, limit = 20, offset = 0) => {
  const { rows } = await pool.query(
    `
    SELECT 
      p.*,
      u.display_name,
      u.avatar_url,
      COUNT(DISTINCT r.id) as reaction_count,
      COUNT(DISTINCT c.id) as comment_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN reactions r ON p.id = r.post_id
    LEFT JOIN comments c ON p.id = c.post_id
    WHERE p.user_id = $1
    GROUP BY p.id, u.display_name, u.avatar_url
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `,
    [userId, limit, offset]
  );
  return rows;
};

// Reaction queries
export const toggleLike = async (userId: number, postId: number) => {
  const { rows: existingLike } = await pool.query(
    'SELECT id FROM reactions WHERE user_id = $1 AND post_id = $2 AND reaction_type = $3',
    [userId, postId, 'like']
  );

  if (existingLike.length > 0) {
    // Unlike
    await pool.query(
      'DELETE FROM reactions WHERE user_id = $1 AND post_id = $2 AND reaction_type = $3',
      [userId, postId, 'like']
    );
    return { liked: false };
  } else {
    // Like
    await pool.query(
      'INSERT INTO reactions (user_id, post_id, reaction_type) VALUES ($1, $2, $3)',
      [userId, postId, 'like']
    );
    return { liked: true };
  }
};
