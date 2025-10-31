import dotenv from 'dotenv';

// Load .env as early as possible (index.ts also loads, but safe to call twice)
dotenv.config({ path: '.env' });

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  useHttps: process.env.USE_HTTPS === 'true' || true, // default true for this app
  frontendUrl: process.env.FRONTEND_URL || 'https://localhost:5173',
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || '',
  },
  debug: process.env.DEBUG === 'true',
};

export const allowedOrigins = [
  config.frontendUrl,
  'https://localhost:3001',
];

export const isProduction = config.nodeEnv === 'production';

export const logger = {
  debug: (...args: any[]) => {
    if (config.debug) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  },
  info: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.log(...args);
  },
  error: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.error(...args);
  },
  warn: (...args: any[]) => {
    // eslint-disable-next-line no-console
    console.warn(...args);
  },
};


