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
import { errorHandler } from './middleware/errorHandler';

console.log('🔍 Environment variables check:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   PORT: ${process.env.PORT}`);
console.log(`   SPOTIFY_CLIENT_ID length: ${(process.env.SPOTIFY_CLIENT_ID || '').length}`);
console.log(`   SPOTIFY_CLIENT_SECRET length: ${(process.env.SPOTIFY_CLIENT_SECRET || '').length}`);
console.log(`   SPOTIFY_REDIRECT_URI: ${process.env.SPOTIFY_REDIRECT_URI}`);

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for ngrok and load balancers
app.set('trust proxy', true);

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
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/spotify', spotifyRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'banger-server',
    version: '1.0.0',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Create HTTPS server for development
const startServer = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development: Use HTTPS with self-signed certificates
    const keyPath = path.join(__dirname, '../certs/localhost-key.pem');
    const certPath = path.join(__dirname, '../certs/localhost-cert.pem');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };

      https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`🚀 Banger Server running on HTTPS port ${PORT}`);
        console.log(`� HTTPS URL: https://localhost:${PORT}`);
        console.log(`�📱 Frontend URL: ${process.env.FRONTEND_URL}`);
        console.log(`🎵 Spotify OAuth: ${process.env.SPOTIFY_REDIRECT_URI}`);
        console.log(`⚠️  Using self-signed certificate for development`);
      });
    } else {
      console.error('❌ SSL certificates not found. Please generate them first:');
      console.error('mkdir -p certs');
      console.error(
        'openssl req -x509 -newkey rsa:4096 -keyout certs/localhost-key.pem -out certs/localhost-cert.pem -days 365 -nodes -subj "/CN=localhost"'
      );
      process.exit(1);
    }
  } else {
    // Production: Use HTTP (assuming SSL termination at load balancer)
    app.listen(PORT, () => {
      console.log(`🚀 Banger Server running on port ${PORT}`);
      console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`🎵 Spotify OAuth: ${process.env.SPOTIFY_REDIRECT_URI}`);
    });
  }
};

startServer();

export default app;
