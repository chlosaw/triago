import express, { Router } from 'express';
import { getAuth, requireRole } from '../../middleware/auth.js';
import { limiter } from '../../middleware/security.js';
import * as controller from './tickets.controller.js';

export const ticketsRouter = Router();

ticketsRouter.get('/', controller.list);
ticketsRouter.post('/', controller.create);
ticketsRouter.get('/:id', controller.show);
ticketsRouter.get('/:id/events', controller.events);
ticketsRouter.patch('/:id', controller.update);
ticketsRouter.post('/:id/accept', controller.accept);
ticketsRouter.post('/:id/dismiss', controller.dismiss);
ticketsRouter.post('/:id/return-to-queue', controller.returnToQueue);
ticketsRouter.delete('/:id', requireRole('admin'), controller.remove);

// Each reply emails a customer, so cap them per organisation.
const replyLimiter = limiter({ name: 'reply', windowMinutes: 10, limit: 60, key: (req) => getAuth(req).orgId });
ticketsRouter.post('/:id/replies', replyLimiter, controller.reply);
// Each draft can call a paid model, so cap them per organisation too.
const draftLimiter = limiter({ name: 'reply-draft', windowMinutes: 10, limit: 60, key: (req) => getAuth(req).orgId });
ticketsRouter.post('/:id/reply-draft', draftLimiter, controller.replyDraft);

// Internal notes on a ticket. Authorship is checked in the service.
ticketsRouter.post('/:id/notes', controller.addNote);
ticketsRouter.patch('/:id/notes/:noteId', controller.editNote);
ticketsRouter.delete('/:id/notes/:noteId', controller.deleteNote);

// Files on a ticket. Uploads are the raw bytes, capped at 5 MB.
ticketsRouter.post(
  '/:id/attachments',
  express.raw({ type: 'application/octet-stream', limit: '5mb' }),
  controller.addAttachment
);
ticketsRouter.get('/:id/attachments/:attachmentId', controller.downloadAttachment);
ticketsRouter.delete('/:id/attachments/:attachmentId', controller.deleteAttachment);
