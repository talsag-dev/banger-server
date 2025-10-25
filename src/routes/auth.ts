import express from 'express';
import jwt from 'jsonwebtoken';
import { auth, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// Check if user is authenticated
router.get('/me', auth, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  res.json({ 
    user: {
      userId: req.user.userId,
      platform: req.user.platform,
      // Don't send sensitive token data to frontend
      authenticated: true
    }
  });
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  
  res.json({ 
    message: 'Logged out successfully',
    success: true 
  });
});

// Check authentication status
router.get('/status', (req, res) => {
  const token = req.cookies?.auth_token;
  
  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    res.json({ authenticated: true });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

export { router as authRouter };