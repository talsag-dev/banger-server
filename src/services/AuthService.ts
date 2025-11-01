import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserByAppleId,
  updateUser,
  updateUserPassword,
  setResetToken,
  findUserByResetToken,
  clearResetToken,
} from '../database/queries';
import type { User, CreateUserData } from '../database/types';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const SALT_ROUNDS = 12;

export interface AuthResult {
  user: User;
  token: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AppleUserInfo {
  id: string;
  email?: string;
  name?: string;
}

export class AuthService {
  // Email Authentication
  async signUpWithEmail(
    email: string,
    password: string,
    displayName: string,
    username: string
  ): Promise<AuthResult> {
    // Check if user already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const userData: CreateUserData = {
      auth_provider: 'email',
      email,
      password_hash: passwordHash,
      display_name: displayName,
      username,
      email_verified: false, // TODO: Implement email verification
    };

    const user = await createUser(userData);
    const token = this.generateJWT(user);

    return { user, token };
  }

  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    // Find user
    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.password_hash) {
      throw new Error(
        'No password set for this account. Please use social login or reset your password.'
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    const token = this.generateJWT(user);
    return { user, token };
  }

  // OAuth Authentication
  async authenticateWithGoogle(googleUserInfo: GoogleUserInfo): Promise<AuthResult> {
    // Try to find existing user
    let user = await findUserByGoogleId(googleUserInfo.id);

    if (!user) {
      // Check if user exists with same email
      const existingUser = await findUserByEmail(googleUserInfo.email);
      if (existingUser) {
        throw new Error(
          'An account with this email already exists. Please log in with your existing method.'
        );
      }

      // Create new user
      const userData: CreateUserData = {
        auth_provider: 'google',
        google_id: googleUserInfo.id,
        email: googleUserInfo.email,
        display_name: googleUserInfo.name,
        avatar_url: googleUserInfo.picture,
        email_verified: true, // Google emails are verified
      };

      user = await createUser(userData);
    } else {
      // Update user profile with latest info from Google
      await updateUser(user.id, {
        display_name: googleUserInfo.name || user.display_name,
        avatar_url: googleUserInfo.picture || user.avatar_url,
      });

      // Refresh user data
      user = { ...user, display_name: googleUserInfo.name || user.display_name };
    }

    const token = this.generateJWT(user);
    return { user, token };
  }

  async authenticateWithApple(appleUserInfo: AppleUserInfo): Promise<AuthResult> {
    // Try to find existing user
    let user = await findUserByAppleId(appleUserInfo.id);

    if (!user) {
      // Check if user exists with same email (if email provided)
      if (appleUserInfo.email) {
        const existingUser = await findUserByEmail(appleUserInfo.email);
        if (existingUser) {
          throw new Error(
            'An account with this email already exists. Please log in with your existing method.'
          );
        }
      }

      // Create new user
      const userData: CreateUserData = {
        auth_provider: 'apple',
        apple_id: appleUserInfo.id,
        email: appleUserInfo.email,
        display_name: appleUserInfo.name || 'Apple User',
        email_verified: !!appleUserInfo.email, // Apple emails are verified when provided
      };

      user = await createUser(userData);
    } else {
      // Update user profile with latest info from Apple (if provided)
      if (appleUserInfo.name || appleUserInfo.email) {
        await updateUser(user.id, {
          display_name: appleUserInfo.name || user.display_name,
          email: appleUserInfo.email || user.email,
        });

        // Refresh user data
        user = {
          ...user,
          display_name: appleUserInfo.name || user.display_name,
          email: appleUserInfo.email || user.email,
        };
      }
    }

    const token = this.generateJWT(user);
    return { user, token };
  }

  // Password Reset
  async requestPasswordReset(email: string): Promise<string> {
    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error('No user found with this email address');
    }

    if (user.auth_provider !== 'email') {
      throw new Error('Password reset is only available for email accounts');
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await setResetToken(user.id, resetToken, expiresAt);

    return resetToken;
  }

  async resetPassword(resetToken: string, newPassword: string): Promise<AuthResult> {
    const user = await findUserByResetToken(resetToken);
    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password and clear reset token
    await updateUserPassword(user.id, passwordHash);
    await clearResetToken(user.id);

    const token = this.generateJWT(user);
    return { user, token };
  }

  // JWT Token Management
  generateJWT(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
      authProvider: user.auth_provider,
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  verifyJWT(token: string): { userId: string; email?: string; authProvider: string } {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return {
        userId: decoded.userId,
        email: decoded.email,
        authProvider: decoded.authProvider,
      };
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Token Utilities
  generateCookieOptions() {
    // Use secure cookies when HTTPS is forced or in production
    const forceHttps = process.env.USE_HTTPS === 'true';
    const isSecure = process.env.NODE_ENV === 'production' || forceHttps;

    return {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? ('none' as const) : ('lax' as const), // 'none' for HTTPS cross-domain, 'lax' for HTTP
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      // Removed domain restriction to allow cookies to work with both localhost and ngrok
    };
  }
}

export const authService = new AuthService();
