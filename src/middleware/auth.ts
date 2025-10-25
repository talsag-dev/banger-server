import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    platform: string;
    spotifyTokens?: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };
  };
}

export const auth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.auth_token;

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'No authentication token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: 'Invalid or expired authentication token' 
    });
  }
};

export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.auth_token;

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.user = decoded;
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};