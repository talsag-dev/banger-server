import type { Request, Response } from 'express';
import { config } from '../config';

export const soundcloudController = {
  callback: async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query as {
        code?: string;
        state?: string;
        error?: string;
      };

      if (error) {
        return res.redirect(
          `${config.frontendUrl}/auth/error?provider=soundcloud&error=${encodeURIComponent(error)}`
        );
      }

      if (!code || !state) {
        return res.redirect(
          `${config.frontendUrl}/auth/error?provider=soundcloud&error=missing_params`
        );
      }

      // With PKCE, the code_verifier is held client-side; redirect to frontend to complete connect
      const redirectUrl = `${config.frontendUrl}/auth/soundcloud?code=${encodeURIComponent(
        code
      )}&state=${encodeURIComponent(state)}`;
      return res.redirect(redirectUrl);
    } catch (e) {
      return res.redirect(
        `${config.frontendUrl}/auth/error?provider=soundcloud&error=callback_failed`
      );
    }
  },
};
