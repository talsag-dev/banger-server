// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
const envResult = dotenv.config({ path: '.env' });
console.log(
  '🔧 Environment loading result:',
  envResult.error ? envResult.error.message : 'Success'
);

import express from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { spotifyRouter } from './routes/spotify';
import { postsRouter } from './routes/posts';
import { usersRouter } from './routes/users';
import { errorHandler } from './middleware/errorHandler';
import { initializeDatabase } from './database/init';
import { config, allowedOrigins } from './config';

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
    origin: allowedOrigins,
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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/spotify', spotifyRouter);
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

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Create HTTPS server for development
const startServer = async () => {
  try {
    // Initialize database first
    await initializeDatabase();

    // Always use HTTPS for all environments
    try {
      const certPath = path.join(__dirname, '../certs/localhost-cert.pem');
      const keyPath = path.join(__dirname, '../certs/localhost-key.pem');
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`🚀 Banger Server running on HTTPS port ${PORT}`);
        console.log(`🔒 HTTPS URL: https://localhost:${PORT}`);
        console.log(`📱 Frontend URL: ${config.frontendUrl}`);
        console.log(`🎵 Spotify OAuth: ${config.spotify.redirectUri}`);
        console.log(`✅ HTTPS enabled for all environments`);

        // Start token refresh service
        const { tokenRefreshService } = require('./services/TokenRefreshService');
        tokenRefreshService.start();
      });
    } catch (certError) {
      console.error('❌ SSL certificates not found. HTTPS required.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};
startServer();

export default app;
