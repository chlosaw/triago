import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import * as controller from './org.controller.js';

export const orgRouter = Router();

orgRouter.get('/', controller.show);
orgRouter.patch('/settings', requireRole('admin'), controller.updateSettings);
