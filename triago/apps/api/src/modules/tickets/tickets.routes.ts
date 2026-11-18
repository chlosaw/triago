import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
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

// Internal notes on a ticket. Authorship is checked in the service.
ticketsRouter.post('/:id/notes', controller.addNote);
ticketsRouter.patch('/:id/notes/:noteId', controller.editNote);
ticketsRouter.delete('/:id/notes/:noteId', controller.deleteNote);
