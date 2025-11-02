import { pool } from './connection';
import type {
  User,
  Post,
  MusicIntegration,
  CreateUserData,
  CreatePostData,
  CreateMusicIntegrationData,
  Follow,
  Track,
  Playlist,
  PlaylistTrack,
  CreateTrackData,
  UpdateTrackData,
  CreatePlaylistData,
  UpdatePlaylistData,
  CreatePlaylistTrackData,
} from './types';

// User queries
export const createUser = async (userData: CreateUserData): Promise<User> => {
  const { rows } = await pool.query(
    `INSERT INTO users (auth_provider, google_id, apple_id, spotify_id, email, password_hash, username, display_name, avatar_url, bio, email_verified) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
     RETURNING *`,
    [
      userData.auth_provider,
      userData.google_id,
      userData.apple_id,
      userData.spotify_id,
      userData.email,
      userData.password_hash,
      userData.username,
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

export const findUserById = async (id: string): Promise<User | null> => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
};

export const updateUser = async (
  userId: string,
  userData: {
    email?: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    email_verified?: boolean;
  }
): Promise<User | null> => {
  const { rows } = await pool.query(
    `UPDATE users 
     SET email = COALESCE($2, email), 
         username = COALESCE($3, username),
         display_name = COALESCE($4, display_name), 
         avatar_url = COALESCE($5, avatar_url),
         bio = COALESCE($6, bio),
         email_verified = COALESCE($7, email_verified),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 
     RETURNING *`,
    [
      userId,
      userData.email,
      userData.username,
      userData.display_name,
      userData.avatar_url,
      userData.bio,
      userData.email_verified,
    ]
  );
  return rows[0] || null;
};

export const updateUserPassword = async (
  userId: string,
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
  userId: string,
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

export const clearResetToken = async (userId: string): Promise<void> => {
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
  userId: string,
  provider: string
): Promise<MusicIntegration | null> => {
  const { rows } = await pool.query(
    'SELECT * FROM music_integrations WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  return rows[0] || null;
};

export const getUserMusicIntegrations = async (userId: string): Promise<MusicIntegration[]> => {
  const { rows } = await pool.query(
    'SELECT * FROM music_integrations WHERE user_id = $1 ORDER BY connected_at DESC',
    [userId]
  );
  return rows;
};

export const getAllUsersWithSpotifyIntegrations = async (): Promise<string[]> => {
  const { rows } = await pool.query(
    'SELECT DISTINCT user_id FROM music_integrations WHERE provider = $1 AND refresh_token IS NOT NULL AND is_connected = TRUE',
    ['spotify']
  );
  return rows.map((row) => row.user_id);
};

export const updateMusicIntegrationTokens = async (
  userId: string,
  provider: string,
  tokens: {
    access_token?: string;
    refresh_token?: string;
    token_expires_at?: Date;
    has_valid_token?: boolean;
    is_connected?: boolean;
    last_sync_at?: Date;
  }
): Promise<MusicIntegration | null> => {
  const { rows } = await pool.query(
    `UPDATE music_integrations 
     SET access_token = COALESCE($3, access_token),
         refresh_token = COALESCE($4, refresh_token),
         token_expires_at = COALESCE($5, token_expires_at),
         has_valid_token = COALESCE($6, has_valid_token),
         is_connected = COALESCE($7, is_connected),
         last_sync_at = COALESCE($8, last_sync_at),
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
      tokens.is_connected ?? null,
      tokens.last_sync_at ?? null,
    ]
  );
  return rows[0] || null;
};

export const updateMusicIntegration = async (
  userId: string,
  provider: string,
  updates: {
    display_name?: string;
    avatar_url?: string;
    access_token?: string;
    refresh_token?: string;
    token_expires_at?: Date;
    has_valid_token?: boolean;
    is_connected?: boolean;
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
         is_connected = COALESCE($9, is_connected),
         last_sync_at = COALESCE($10, last_sync_at),
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
      updates.is_connected ?? null,
      updates.last_sync_at ?? null,
    ]
  );
  return rows[0] || null;
};

export const disconnectMusicIntegration = async (
  userId: string,
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

export const deleteMusicIntegration = async (userId: string, provider: string): Promise<void> => {
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
  userId: string
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

// Helper function to safely parse metadata (handles both string and object)
const parseMetadata = (metadata: any): Record<string, any> | undefined => {
  if (!metadata) return undefined;
  if (typeof metadata === 'object') return metadata; // Already parsed by PostgreSQL
  if (typeof metadata === 'string') return JSON.parse(metadata);
  return undefined;
};

// Track queries
export const createOrUpdateTrack = async (trackData: CreateTrackData): Promise<Track> => {
  const { rows } = await pool.query(
    `INSERT INTO tracks (external_id, provider, name, artist, album, duration, image_url, preview_url, external_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (provider, external_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       artist = EXCLUDED.artist,
       album = EXCLUDED.album,
       duration = EXCLUDED.duration,
       image_url = EXCLUDED.image_url,
       preview_url = EXCLUDED.preview_url,
       external_url = EXCLUDED.external_url,
       metadata = EXCLUDED.metadata,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      trackData.external_id,
      trackData.provider,
      trackData.name,
      trackData.artist,
      trackData.album || null,
      trackData.duration || null,
      trackData.image_url || null,
      trackData.preview_url || null,
      trackData.external_url || null,
      trackData.metadata ? JSON.stringify(trackData.metadata) : null,
    ]
  );
  const track = rows[0];
  return {
    ...track,
    metadata: parseMetadata(track.metadata),
  } as Track;
};

export const findTrackById = async (id: string): Promise<Track | null> => {
  const { rows } = await pool.query('SELECT * FROM tracks WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const track = rows[0];
  return {
    ...track,
    metadata: parseMetadata(track.metadata),
  } as Track;
};

export const findTrackByProviderId = async (
  provider: string,
  externalId: string
): Promise<Track | null> => {
  const { rows } = await pool.query(
    'SELECT * FROM tracks WHERE provider = $1 AND external_id = $2',
    [provider, externalId]
  );
  if (rows.length === 0) return null;
  const track = rows[0];
  return {
    ...track,
    metadata: parseMetadata(track.metadata),
  } as Track;
};

export const updateTrack = async (id: string, updates: UpdateTrackData): Promise<Track | null> => {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClause.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.artist !== undefined) {
    setClause.push(`artist = $${paramIndex++}`);
    values.push(updates.artist);
  }
  if (updates.album !== undefined) {
    setClause.push(`album = $${paramIndex++}`);
    values.push(updates.album);
  }
  if (updates.duration !== undefined) {
    setClause.push(`duration = $${paramIndex++}`);
    values.push(updates.duration);
  }
  if (updates.image_url !== undefined) {
    setClause.push(`image_url = $${paramIndex++}`);
    values.push(updates.image_url);
  }
  if (updates.preview_url !== undefined) {
    setClause.push(`preview_url = $${paramIndex++}`);
    values.push(updates.preview_url);
  }
  if (updates.external_url !== undefined) {
    setClause.push(`external_url = $${paramIndex++}`);
    values.push(updates.external_url);
  }
  if (updates.metadata !== undefined) {
    setClause.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (setClause.length === 0) {
    return findTrackById(id);
  }

  setClause.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE tracks SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (rows.length === 0) return null;
  const track = rows[0];
  return {
    ...track,
    metadata: parseMetadata(track.metadata),
  } as Track;
};

// Playlist queries
export const createOrUpdatePlaylist = async (
  playlistData: CreatePlaylistData
): Promise<Playlist> => {
  const { rows } = await pool.query(
    `INSERT INTO playlists (external_id, user_id, provider, name, description, image_url, owner, track_count, external_url, snapshot_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, provider, external_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       image_url = EXCLUDED.image_url,
       owner = EXCLUDED.owner,
       track_count = EXCLUDED.track_count,
       external_url = EXCLUDED.external_url,
       snapshot_id = EXCLUDED.snapshot_id,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      playlistData.external_id,
      playlistData.user_id,
      playlistData.provider,
      playlistData.name,
      playlistData.description || null,
      playlistData.image_url || null,
      playlistData.owner || null,
      playlistData.track_count || 0,
      playlistData.external_url || null,
      playlistData.snapshot_id || null,
    ]
  );
  return rows[0] as Playlist;
};

export const findPlaylistById = async (id: string): Promise<Playlist | null> => {
  const { rows } = await pool.query('SELECT * FROM playlists WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  return rows[0] as Playlist;
};

export const getUserPlaylists = async (userId: string, provider?: string): Promise<Playlist[]> => {
  if (provider) {
    const { rows } = await pool.query(
      'SELECT * FROM playlists WHERE user_id = $1 AND provider = $2 ORDER BY name',
      [userId, provider]
    );
    return rows as Playlist[];
  } else {
    const { rows } = await pool.query('SELECT * FROM playlists WHERE user_id = $1 ORDER BY name', [
      userId,
    ]);
    return rows as Playlist[];
  }
};

export const updatePlaylist = async (
  id: string,
  updates: UpdatePlaylistData
): Promise<Playlist | null> => {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClause.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClause.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.image_url !== undefined) {
    setClause.push(`image_url = $${paramIndex++}`);
    values.push(updates.image_url);
  }
  if (updates.owner !== undefined) {
    setClause.push(`owner = $${paramIndex++}`);
    values.push(updates.owner);
  }
  if (updates.track_count !== undefined) {
    setClause.push(`track_count = $${paramIndex++}`);
    values.push(updates.track_count);
  }
  if (updates.external_url !== undefined) {
    setClause.push(`external_url = $${paramIndex++}`);
    values.push(updates.external_url);
  }
  if (updates.snapshot_id !== undefined) {
    setClause.push(`snapshot_id = $${paramIndex++}`);
    values.push(updates.snapshot_id);
  }
  if (updates.last_synced_at !== undefined) {
    setClause.push(`last_synced_at = $${paramIndex++}`);
    values.push(updates.last_synced_at);
  }

  if (setClause.length === 0) {
    return findPlaylistById(id);
  }

  setClause.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE playlists SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (rows.length === 0) return null;
  return rows[0] as Playlist;
};

// Playlist tracks queries
export const syncPlaylistTracks = async (
  playlistId: string,
  trackIds: Array<{ track_id: string; position: number }>
): Promise<void> => {
  // Start transaction to ensure consistency
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mark all existing tracks as removed (soft delete)
    await client.query(
      `UPDATE playlist_tracks SET removed_at = CURRENT_TIMESTAMP WHERE playlist_id = $1 AND removed_at IS NULL`,
      [playlistId]
    );

    // Insert/update new tracks
    for (const { track_id, position } of trackIds) {
      await client.query(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at, removed_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT (playlist_id, track_id, position) 
         DO UPDATE SET removed_at = NULL, added_at = CURRENT_TIMESTAMP`,
        [playlistId, track_id, position]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getPlaylistTracks = async (playlistId: string): Promise<PlaylistTrack[]> => {
  const { rows } = await pool.query(
    `SELECT * FROM playlist_tracks WHERE playlist_id = $1 AND removed_at IS NULL ORDER BY position`,
    [playlistId]
  );
  return rows as PlaylistTrack[];
};

// Post queries
export const createPost = async (postData: CreatePostData) => {
  // Build column list dynamically based on what's provided
  const columns: string[] = ['user_id', 'track_id', 'track_provider'];
  const values: any[] = [postData.user_id, postData.track_id, postData.track_provider || null];

  // Add legacy columns if provided (for backward compatibility during migration)
  if (postData.track_name !== undefined) {
    columns.push('track_name');
    values.push(postData.track_name);
  }
  if (postData.artist_name !== undefined) {
    columns.push('artist_name');
    values.push(postData.artist_name);
  }
  if (postData.album_name !== undefined) {
    columns.push('album_name');
    values.push(postData.album_name);
  }
  if (postData.track_image !== undefined) {
    columns.push('track_image');
    values.push(postData.track_image);
  }
  if (postData.track_preview_url !== undefined) {
    columns.push('track_preview_url');
    values.push(postData.track_preview_url);
  }
  if (postData.track_external_url !== undefined) {
    columns.push('track_external_url');
    values.push(postData.track_external_url);
  }
  if (postData.track_duration !== undefined) {
    columns.push('track_duration');
    values.push(postData.track_duration);
  }

  columns.push('feeling', 'caption', 'is_currently_listening');
  values.push(
    postData.feeling || null,
    postData.caption || null,
    postData.is_currently_listening || false
  );

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO posts (${columns.join(', ')}) 
     VALUES (${placeholders}) 
     RETURNING *`,
    values
  );
  // Fetch username from users table
  const userRows = await pool.query('SELECT username FROM users WHERE id = $1', [postData.user_id]);
  return { ...rows[0], username: userRows.rows[0]?.username || null };
};

export const getPosts = async (limit = 20, offset = 0) => {
  // First get posts without aggregations to avoid GROUP BY complexity
  const { rows } = await pool.query(
    `
    SELECT 
      p.*,
      u.display_name,
      u.username,
      u.avatar_url,
      t.id as track_ref_id,
      t.external_id as track_external_id,
      t.provider as track_provider_new,
      t.name as track_name_new,
      t.artist as artist_name_new,
      t.album as album_name_new,
      t.image_url as track_image_new,
      t.preview_url as track_preview_url_new,
      t.external_url as track_external_url_new,
      t.duration::INTEGER as track_duration_new
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN tracks t ON p.track_id = t.id
    ORDER BY p.created_at DESC
    LIMIT $1 OFFSET $2
  `,
    [limit, offset]
  );

  // Fetch reactions for each post
  for (const post of rows) {
    const reactionRows = await pool.query(
      `SELECT r.id, r.user_id, r.reaction_type, r.created_at
       FROM reactions r
       WHERE r.post_id = $1`,
      [post.id]
    );
    post.reactions = reactionRows.rows.map((r) => ({
      id: r.id.toString(),
      user_id: r.user_id.toString(),
      reaction_type: r.reaction_type,
      created_at: r.created_at,
    }));
  }

  return rows;
};

// Get feed posts (posts from users that the current user follows, plus their own posts)
export const getFeedPosts = async (userId: string, limit = 20, offset = 0) => {
  try {
    // First get posts without aggregations to avoid GROUP BY complexity
    const { rows } = await pool.query(
      `
      SELECT DISTINCT ON (p.id)
        p.*,
        u.display_name,
        u.username,
        u.avatar_url,
        t.id as track_ref_id,
        t.external_id as track_external_id,
        t.provider as track_provider_new,
        t.name as track_name_new,
        t.artist as artist_name_new,
        t.album as album_name_new,
        t.image_url as track_image_new,
        t.preview_url as track_preview_url_new,
        t.external_url as track_external_url_new,
        t.duration as track_duration_new
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN tracks t ON p.track_id = t.id
      LEFT JOIN follows f ON f.follower_id = $1 AND f.following_id = p.user_id
      WHERE p.user_id = $1 OR f.follower_id IS NOT NULL
      ORDER BY p.id, p.created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [userId, limit, offset]
    );

    // Fetch reactions for each post
    for (const post of rows) {
      const reactionRows = await pool.query(
        `SELECT r.id, r.user_id, r.reaction_type, r.created_at
         FROM reactions r
         WHERE r.post_id = $1`,
        [post.id]
      );
      post.reactions = reactionRows.rows.map((r) => ({
        id: r.id.toString(),
        user_id: r.user_id.toString(),
        reaction_type: r.reaction_type,
        created_at: r.created_at,
      }));
    }

    return rows;
  } catch (error: any) {
    console.error('Error in getFeedPosts:', error);
    console.error('Query params:', { userId, limit, offset });
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    throw error;
  }
};

export const getUserPosts = async (userId: string, limit = 20, offset = 0) => {
  // First get posts without aggregations to avoid GROUP BY complexity
  const { rows } = await pool.query(
    `
    SELECT 
      p.*,
      u.display_name,
      u.username,
      u.avatar_url,
      t.id as track_ref_id,
      t.external_id as track_external_id,
      t.provider as track_provider_new,
      t.name as track_name_new,
      t.artist as artist_name_new,
      t.album as album_name_new,
      t.image_url as track_image_new,
      t.preview_url as track_preview_url_new,
      t.external_url as track_external_url_new,
      t.duration::INTEGER as track_duration_new
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN tracks t ON p.track_id = t.id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `,
    [userId, limit, offset]
  );

  // Fetch reactions for each post
  for (const post of rows) {
    const reactionRows = await pool.query(
      `SELECT r.id, r.user_id, r.reaction_type, r.created_at
       FROM reactions r
       WHERE r.post_id = $1`,
      [post.id]
    );
    post.reactions = reactionRows.rows.map((r) => ({
      id: r.id.toString(),
      user_id: r.user_id.toString(),
      reaction_type: r.reaction_type,
      created_at: r.created_at,
    }));
  }

  return rows;
};

export const getUserPostCount = async (userId: string): Promise<number> => {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM posts WHERE user_id = $1', [
    userId,
  ]);
  return parseInt(rows[0].count, 10) || 0;
};

export const getPostById = async (postId: string): Promise<Post | null> => {
  const { rows } = await pool.query(
    `
    SELECT 
      p.*,
      t.id as track_ref_id,
      t.external_id as track_external_id,
      t.provider as track_provider_new,
      t.name as track_name_new,
      t.artist as artist_name_new,
      t.album as album_name_new,
      t.image_url as track_image_new,
      t.preview_url as track_preview_url_new,
      t.external_url as track_external_url_new,
      t.duration::INTEGER as track_duration_new
    FROM posts p
    LEFT JOIN tracks t ON p.track_id = t.id
    WHERE p.id = $1
    `,
    [postId]
  );
  return rows[0] || null;
};

export const updatePost = async (
  postId: string,
  userId: string,
  updates: { feeling?: string; caption?: string }
) => {
  const { feeling, caption } = updates;
  const { rows } = await pool.query(
    `UPDATE posts 
     SET feeling = COALESCE($1, feeling), 
         caption = COALESCE($2, caption),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND user_id = $4
     RETURNING *`,
    [feeling || null, caption || null, postId, userId]
  );
  if (rows.length === 0) {
    throw new Error('Post not found or unauthorized');
  }
  // Fetch username from users table
  const userRows = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
  return { ...rows[0], username: userRows.rows[0]?.username || null };
};

export const deletePost = async (postId: string, userId: string): Promise<void> => {
  const { rows } = await pool.query(
    'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id',
    [postId, userId]
  );
  if (rows.length === 0) {
    throw new Error('Post not found or unauthorized');
  }
};

// Reaction queries
export const toggleLike = async (userId: string, postId: string) => {
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

export const getUserLikedPosts = async (userId: string, limit = 20, offset = 0) => {
  // First get posts without aggregations to avoid GROUP BY complexity
  const { rows } = await pool.query(
    `
    SELECT DISTINCT ON (p.id)
      p.*,
      u.display_name,
      u.username,
      u.avatar_url,
      t.id as track_ref_id,
      t.external_id as track_external_id,
      t.provider as track_provider_new,
      t.name as track_name_new,
      t.artist as artist_name_new,
      t.album as album_name_new,
      t.image_url as track_image_new,
      t.preview_url as track_preview_url_new,
      t.external_url as track_external_url_new,
      t.duration::INTEGER as track_duration_new,
      r.created_at as liked_at
    FROM reactions r
    JOIN posts p ON r.post_id = p.id
    JOIN users u ON p.user_id = u.id
    LEFT JOIN tracks t ON p.track_id = t.id
    WHERE r.user_id = $1 AND r.reaction_type = 'like'
    ORDER BY p.id, r.created_at DESC
    LIMIT $2 OFFSET $3
  `,
    [userId, limit, offset]
  );

  // Fetch reactions for each post
  for (const post of rows) {
    const reactionRows = await pool.query(
      `SELECT r.id, r.user_id, r.reaction_type, r.created_at
       FROM reactions r
       WHERE r.post_id = $1`,
      [post.id]
    );
    post.reactions = reactionRows.rows.map((r) => ({
      id: r.id.toString(),
      user_id: r.user_id.toString(),
      reaction_type: r.reaction_type,
      created_at: r.created_at,
    }));
  }

  return rows;
};

// Follow queries
export const followUser = async (
  followerId: string,
  followingId: string
): Promise<Follow | null> => {
  // Check if already following
  const { rows: existingRows } = await pool.query(
    `SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );

  // If relationship already exists, return it
  if (existingRows.length > 0) {
    return existingRows[0];
  }

  // Insert new follow relationship
  const { rows } = await pool.query(
    `INSERT INTO follows (follower_id, following_id) 
     VALUES ($1, $2) 
     RETURNING *`,
    [followerId, followingId]
  );
  return rows[0] || null;
};

export const unfollowUser = async (followerId: string, followingId: string): Promise<void> => {
  await pool.query(
    `DELETE FROM follows 
     WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
};

export const isFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  const { rows } = await pool.query(
    `SELECT 1 FROM follows 
     WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
  return rows.length > 0;
};

export const getFollowersCount = async (userId: string): Promise<number> => {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM follows WHERE following_id = $1`,
    [userId]
  );
  return parseInt(rows[0].count, 10);
};

export const getFollowingCount = async (userId: string): Promise<number> => {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM follows WHERE follower_id = $1`,
    [userId]
  );
  return parseInt(rows[0].count, 10);
};

export const searchUsers = async (query: string, limit = 20): Promise<User[]> => {
  const searchTerm = `%${query.toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT id, email, username, display_name, avatar_url, bio, created_at
     FROM users
     WHERE 
       LOWER(username) LIKE $1 OR
       LOWER(email) LIKE $1 OR
       LOWER(display_name) LIKE $1
     ORDER BY 
       CASE 
         WHEN LOWER(username) = $2 THEN 1
         WHEN LOWER(username) LIKE $3 THEN 2
         WHEN LOWER(display_name) LIKE $3 THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT $4`,
    [searchTerm, query.toLowerCase(), `${query.toLowerCase()}%`, limit]
  );
  return rows;
};
