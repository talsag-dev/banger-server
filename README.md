# Banger Server

Backend API for the Banger music sharing application with Spotify, Apple Music, and SoundCloud authentication.

## 🚀 Features

- **Spotify OAuth 2.0 Authentication**
- **Secure JWT Token Management**
- **Rate Limiting & Security Headers**
- **TypeScript Support**
- **RESTful API Design**
- **CORS Configuration**

## 🛠 Setup Instructions

### 1. Install Dependencies

```bash
cd /Users/talsagie/Projects/banger-server
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your variables:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secure-jwt-secret-key

# Spotify API Configuration
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:3001/api/spotify/callback
```

### 3. Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://localhost:3001/api/spotify/callback` to Redirect URIs
4. Copy your Client ID and Client Secret to `.env`

### 4. Generate JWT Secret

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Add this to your `.env` file as `JWT_SECRET`.

## 🏃‍♂️ Running the Server

### Development Mode

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

## 📡 API Endpoints

### Authentication

- `GET /api/auth/me` - Get current user info
- `GET /api/auth/status` - Check authentication status  
- `POST /api/auth/logout` - Logout user

### Spotify

- `GET /api/spotify/auth` - Start Spotify OAuth flow
- `GET /api/spotify/callback` - OAuth callback (handled automatically)
- `GET /api/spotify/profile` - Get user's Spotify profile
- `GET /api/spotify/currently-playing` - Get currently playing track
- `GET /api/spotify/search?q=query&type=track&limit=20` - Search Spotify
- `GET /api/spotify/top-tracks?time_range=medium_term&limit=20` - Get user's top tracks

### Health Check

- `GET /health` - Server health status

## 🔐 Authentication Flow

1. Frontend calls `GET /api/spotify/auth` to get authorization URL
2. User is redirected to Spotify for authentication
3. Spotify redirects back to `/api/spotify/callback`
4. Server exchanges code for tokens and sets HTTP-only cookie
5. Frontend can now make authenticated requests

## 📁 Project Structure

```
src/
├── index.ts              # Main server file
├── middleware/           # Custom middleware
│   ├── auth.ts          # Authentication middleware
│   └── errorHandler.ts  # Error handling middleware
├── routes/              # API routes
│   ├── auth.ts         # Authentication routes
│   └── spotify.ts      # Spotify routes
└── services/           # Business logic
    └── SpotifyAuthService.ts  # Spotify API service
```

## 🔒 Security Features

- **Helmet.js** - Security headers
- **Rate Limiting** - Prevent API abuse
- **CORS** - Cross-origin request handling
- **HTTP-only Cookies** - Secure token storage
- **JWT Verification** - Token validation
- **Input Validation** - Request validation

## 🚧 Future Enhancements

- Apple Music integration
- SoundCloud integration  
- Database integration
- User management
- Playlist synchronization
- Social features

## 🐛 Troubleshooting

### Common Issues

1. **"Missing Spotify configuration"**
   - Ensure all Spotify environment variables are set in `.env`

2. **CORS errors**
   - Verify `FRONTEND_URL` matches your frontend URL exactly

3. **JWT errors**
   - Generate a new JWT secret and update `.env`

4. **Spotify callback errors**
   - Verify redirect URI in Spotify app matches `SPOTIFY_REDIRECT_URI`

### Debug Mode

Set `NODE_ENV=development` in `.env` for detailed error messages.

## 📞 Support

If you encounter issues:

1. Check the server logs
2. Verify environment variables
3. Ensure Spotify app configuration is correct
4. Test the health endpoint: `GET /health`