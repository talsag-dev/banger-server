import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById } from '../database/queries';
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
    const token = req.cookies?.auth_token;

    if (config.debug) {
      // eslint-disable-next-line no-console
      console.log('Auth middleware - Headers:', {
        cookie: req.headers.cookie,
        origin: req.headers.origin,
        referer: req.headers.referer,
      });
      // eslint-disable-next-line no-console
      console.log('Auth middleware - Cookies:', req.cookies);
      // eslint-disable-next-line no-console
      console.log('Auth middleware - Token:', token ? 'Present' : 'Missing');
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
    const integrations = decoded.integrations || [];

    for (const integration of integrations) {
      if (!integration.access_token) {
        continue; // Skip integrations without tokens
      }

      // Check if token is expired
      const isExpired =
        integration.token_expires_at && new Date(integration.token_expires_at) < new Date();

      // If token is expired or invalid, throw auth error
      if (isExpired || !integration.has_valid_token || !integration.is_connected) {
        return res.status(401).json({
          success: false,
          error: 'Integration token expired',
          message: `Your ${integration.provider} token has expired. Please reconnect your ${integration.provider} account.`,
          code: 'TOKEN_EXPIRED',
          provider: integration.provider,
        });
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
