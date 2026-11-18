import { Router } from 'express';
import { getAuth } from '../../middleware/auth.js';
import { limiter } from '../../middleware/security.js';
import * as controller from './emails.controller.js';

// Each sync can call a paid model, so cap it per organisation.
const syncLimiter = limiter({ name: 'email-sync', windowMinutes: 10, limit: 30, key: (req) => getAuth(req).orgId });

export const emailsRouter = Router();

emailsRouter.post('/sync', syncLimiter, controller.sync);
