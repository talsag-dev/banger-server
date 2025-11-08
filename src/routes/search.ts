import express from 'express';
import { auth } from '../middleware/auth';
import { searchController } from '../controllers/searchController';

const router = express.Router();

// Unified search endpoint - searches across all connected music providers
router.get('/', auth, searchController.search as any);

export { router as searchRouter };
