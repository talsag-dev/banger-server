// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
const envResult = dotenv.config({ path: '.env' });
console.log(
  '🔧 Environment loading result:',
  envResult.error ? envResult.error.message : 'Success'
);

import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { spotifyRouter } from './routes/spotify';
import { soundcloudRouter } from './routes/soundcloud';
import { searchRouter } from './routes/search';
import { postsRouter } from './routes/posts';
import { usersRouter } from './routes/users';
import { errorHandler } from './middleware/errorHandler';
import { initializeDatabase } from './database/init';
import { config, allowedOrigins } from './config';
import { tokenRefreshService } from './services/TokenRefreshService';

console.log('🔍 Environment variables check:');
console.log(`   NODE_ENV: ${config.nodeEnv}`);
console.log(`   PORT: ${config.port}`);
console.log(`   SPOTIFY_CLIENT_ID length: ${config.spotify.clientId.length}`);
console.log(`   SPOTIFY_CLIENT_SECRET length: ${config.spotify.clientSecret.length}`);
console.log(`   SPOTIFY_REDIRECT_URI: ${config.spotify.redirectUri}`);

const app = express();
const PORT = config.port || 3001;

// Configure trust proxy more securely
if (config.nodeEnv === 'production') {
  // In production, trust specific proxy (adjust as needed for your deployment)
  app.set('trust proxy', 1);
} else {
  // In development, trust ngrok and localhost
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
}

// Security middleware
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // In production, also allow any Render frontend URL
      if (config.nodeEnv === 'production' && origin.includes('onrender.com')) {
        console.log(`✅ Allowing CORS for Render origin: ${origin}`);
        return callback(null, true);
      }

      console.warn(`❌ CORS blocked origin: ${origin}`);
      console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })
);

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
//   message: { error: 'Too many requests from this IP, please try again later.' },
//   standardHeaders: true,
//   legacyHeaders: false,
//   // Explicitly configure how to get the client IP
//   keyGenerator: (req) => {
//     // In development with ngrok, use x-forwarded-for header
//     if (process.env.NODE_ENV !== 'production' && req.headers['x-forwarded-for']) {
//       const forwardedIps = req.headers['x-forwarded-for'] as string;
//       return forwardedIps.split(',')[0].trim();
//     }
//     // Otherwise use the connection IP
//     return req.ip || 'unknown';
//   },
// });
// app.use(limiter);

// Body parsing middleware (allow JSON primitives for clients that send stringified JSON)
app.use(express.json({ limit: '10mb', strict: false }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/soundcloud', soundcloudRouter);
app.use('/api/search', searchRouter);
app.use('/api/posts', postsRouter);
app.use('/api/users', usersRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'banger-server',
    version: '1.0.0',
    ssl: req.secure || req.headers['x-forwarded-proto'] === 'https',
    protocol: req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http',
  });
});

// Debug middleware to log all requests (before redirect)
app.use((req, res, next) => {
  if (req.path.startsWith('/auth/') && !req.path.startsWith('/api/')) {
    console.log(`🔍 Request to frontend route:`, {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      url: req.url,
      host: req.get('host'),
    });
  }
  next();
});

// Redirect frontend routes to frontend URL (for OAuth callbacks that land on backend)
// This handles cases where SoundCloud redirects to the backend URL instead of frontend
// MUST be before the 404 handler
// Use app.all to catch all HTTP methods (GET, POST, etc.)
app.all('/auth/*', (req, res) => {
  const fullUrl = req.originalUrl || req.url;
  const queryString = fullUrl.includes('?') ? fullUrl.substring(fullUrl.indexOf('?')) : '';
  const path = req.path;

  console.log(`🔄 Redirect handler triggered for: ${req.method} ${req.path}`);

  // In production, if FRONTEND_URL is not set, try to infer from request
  let frontendUrl = config.frontendUrl;
  if (config.nodeEnv === 'production' && (!frontendUrl || frontendUrl.includes('localhost'))) {
    // Try to construct frontend URL from backend URL
    // If backend is banger-server.onrender.com, frontend might be banger-j561.onrender.com
    const host = req.get('host') || '';
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';

    if (host.includes('banger-server')) {
      frontendUrl = `${protocol}://${host.replace('banger-server', 'banger-j561')}`;
      console.log(`⚠️ FRONTEND_URL not set, inferred: ${frontendUrl}`);
    } else if (host.includes('onrender.com')) {
      // Generic fallback for Render - use the frontend URL from the error message
      frontendUrl = `https://banger-j561.onrender.com`;
      console.log(`⚠️ FRONTEND_URL not set, using fallback: ${frontendUrl}`);
    }
  }

  const redirectUrl = `${frontendUrl}${path}${queryString}`;
  console.log(`🔄 Redirecting frontend route:`, {
    method: req.method,
    originalUrl: fullUrl,
    path: path,
    queryString: queryString.substring(0, 100), // Limit log size
    redirectTo: redirectUrl,
    frontendUrl: frontendUrl,
    configFrontendUrl: config.frontendUrl,
  });
  return res.redirect(301, redirectUrl);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Start server (HTTP in production, HTTPS in development)
const startServer = async () => {
  try {
    // Initialize database first
    await initializeDatabase();

    // In production, use HTTP (Render handles HTTPS termination)
    // In development, use HTTPS if certificates exist
    if (config.nodeEnv === 'production') {
      http.createServer(app).listen(PORT, () => {
        console.log(`🚀 Banger Server running on HTTP port ${PORT}`);
        console.log(`📱 Frontend URL: ${config.frontendUrl}`);
        console.log(`🎵 Spotify OAuth: ${config.spotify.redirectUri}`);
        console.log(`✅ Server started (HTTPS handled by Render)`);

        // Start token refresh service
        tokenRefreshService.start();
      });
    } else {
      // Development: Try HTTPS, fallback to HTTP if certs don't exist
      const certPath = path.join(__dirname, '../certs/localhost-cert.pem');
      const keyPath = path.join(__dirname, '../certs/localhost-key.pem');

      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        const httpsOptions = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
        https.createServer(httpsOptions, app).listen(PORT, () => {
          console.log(`🚀 Banger Server running on HTTPS port ${PORT}`);
          console.log(`🔒 HTTPS URL: https://localhost:${PORT}`);
          console.log(`📱 Frontend URL: ${config.frontendUrl}`);
          console.log(`🎵 Spotify OAuth: ${config.spotify.redirectUri}`);
          console.log(`✅ HTTPS enabled for development`);

          // Start token refresh service
          tokenRefreshService.start();
        });
      } else {
        console.warn('⚠️  SSL certificates not found, using HTTP for development');
        http.createServer(app).listen(PORT, () => {
          console.log(`🚀 Banger Server running on HTTP port ${PORT}`);
          console.log(`📱 Frontend URL: ${config.frontendUrl}`);
          console.log(`🎵 Spotify OAuth: ${config.spotify.redirectUri}`);

          // Start token refresh service
          tokenRefreshService.start();
        });
      }
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};
startServer();

export default app;
