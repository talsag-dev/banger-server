import { Router } from 'express';
import { soundcloudController } from '../controllers/soundcloudController';

export const soundcloudRouter = Router();

// Handle SoundCloud OAuth callback (PKCE: forward code to frontend)
soundcloudRouter.get('/callback', soundcloudController.callback as any);


