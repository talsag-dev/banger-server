import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById, getUserMusicIntegrations } from '../database/queries';
import { authService } from '../services/AuthService';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string; // UUID
    email?: string;
    authProvider: string;
    dbUser?: any; // Database user record
  };
}

export const auth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Try to get token from Authorization header first (for cross-domain support)
    const authHeader = req.headers.authorization;
    let token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    // Fallback to cookie if no Authorization header
    if (!token) {
      token = req.cookies?.auth_token;
    }

    // Always log in production to help diagnose issues
    if (!token) {
      console.log('🔍 Auth middleware - No token found:', {
        hasAuthHeader: !!authHeader,
        hasCookies: !!req.cookies,
        cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
        cookieHeader: req.headers.cookie ? 'Present' : 'Missing',
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']?.substring(0, 50),
      });
    }

    if (config.debug && token) {
      // eslint-disable-next-line no-console
      console.log('Auth middleware - Token found:', {
        source: authHeader ? 'Authorization header' : 'Cookie',
        origin: req.headers.origin,
      });
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authentication token provided',
      });
    }

    // Verify JWT token
    const decoded = authService.verifyJWT(token);

    // Fetch fresh user data from database
    const dbUser = await findUserById(decoded.userId);
    if (!dbUser) {
      return res.status(401).json({
        error: 'User not found',
        message: 'User no longer exists in database',
      });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      authProvider: decoded.authProvider,
      dbUser,
    };

    // Validate integration tokens from JWT
    const jwtIntegrations = decoded.integrations || [];
    let needsJwtRefresh = false;

    // Check if any JWT integration tokens are expired or invalid
    for (const jwtIntegration of jwtIntegrations) {
      if (!jwtIntegration.access_token) {
        continue;
      }

      const isExpired =
        jwtIntegration.token_expires_at && new Date(jwtIntegration.token_expires_at) < new Date();
      const isInvalid = !jwtIntegration.has_valid_token || !jwtIntegration.is_connected;

      // If JWT shows expired/invalid, check database for fresh token
      if (isExpired || isInvalid) {
        const dbIntegrations = await getUserMusicIntegrations(decoded.userId);
        const dbIntegration = dbIntegrations.find((i) => i.provider === jwtIntegration.provider);

        // If database has a valid token, JWT is stale - mark for refresh
        if (
          dbIntegration?.access_token &&
          dbIntegration.has_valid_token &&
          dbIntegration.is_connected
        ) {
          const dbIsExpired =
            dbIntegration.token_expires_at && new Date(dbIntegration.token_expires_at) < new Date();

          if (!dbIsExpired) {
            // Database has valid token, JWT is stale
            needsJwtRefresh = true;
            continue;
          }
        }

        // Database also shows expired/invalid, return error
        return res.status(401).json({
          success: false,
          error: 'Integration token expired',
          message: `Your ${jwtIntegration.provider} token has expired. Please reconnect your ${jwtIntegration.provider} account.`,
          code: 'TOKEN_EXPIRED',
          provider: jwtIntegration.provider,
        });
      }
    }

    // If JWT is stale but database has fresh tokens, regenerate JWT
    if (needsJwtRefresh) {
      const user = await findUserById(decoded.userId);
      if (user) {
        const newToken = await authService.generateJWT(user);
        res.cookie('auth_token', newToken, authService.generateCookieOptions());
      }
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or expired authentication token',
    });
  }
};

export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.auth_token;

    if (token) {
      const decoded = authService.verifyJWT(token);
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        authProvider: decoded.authProvider,
      };
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};
