import { Router } from 'express';
import { getAuth, requireRole } from '../../middleware/auth.js';
import { limiter } from '../../middleware/security.js';
import * as controller from './org.controller.js';

export const orgRouter = Router();

orgRouter.get('/', controller.show);
orgRouter.patch('/settings', requireRole('admin'), controller.updateSettings);
orgRouter.delete('/', requireRole('admin'), controller.remove);

// Each invitation sends an email, so cap them per organisation.
const inviteLimiter = limiter({ name: 'invite', windowMinutes: 60, limit: 30, key: (req) => getAuth(req).orgId });

orgRouter.get('/invitations', requireRole('admin'), controller.invitations);
orgRouter.post('/invitations', requireRole('admin'), inviteLimiter, controller.invite);
orgRouter.delete('/invitations/:id', requireRole('admin'), controller.revokeInvitation);
orgRouter.patch('/members/:userId', requireRole('admin'), controller.updateMember);
// Admins remove anyone; any member may remove themselves (checked in the service).
orgRouter.delete('/members/:userId', controller.removeMember);
