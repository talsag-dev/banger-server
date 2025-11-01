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
