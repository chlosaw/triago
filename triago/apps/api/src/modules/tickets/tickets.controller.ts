import { AcceptTicketBody, CreateTicketBody, NoteBody, PatchTicketBody } from '@triago/shared';
import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as notes from './notes.service.js';
import { ListQuery, NoteId, TicketId } from './tickets.schema.js';
import * as tickets from './tickets.service.js';

export async function list(req: Request, res: Response) {
  const { status, ...options } = ListQuery.parse(req.query);
  res.json(await tickets.listTickets(getAuth(req).orgId, { statuses: status, ...options }));
}

export async function create(req: Request, res: Response) {
  const { orgId, userId } = getAuth(req);
  const ticket = await tickets.createManualTicket(orgId, CreateTicketBody.parse(req.body), userId);
  res.status(201).json({ ticket });
}

export async function show(req: Request, res: Response) {
  const { orgId } = getAuth(req);
  const id = TicketId.parse(req.params.id);
  const [ticket, messages] = await Promise.all([tickets.getTicket(orgId, id), tickets.listMessages(orgId, id)]);
  res.json({ ticket, messages });
}

export async function events(req: Request, res: Response) {
  const { orgId } = getAuth(req);
  res.json({ events: await tickets.listEvents(orgId, TicketId.parse(req.params.id)) });
}

export async function update(req: Request, res: Response) {
  const { orgId, userId } = getAuth(req);
  const patch = PatchTicketBody.parse(req.body);
  res.json({ ticket: await tickets.updateTicket(orgId, TicketId.parse(req.params.id), patch, userId) });
}

export async function accept(req: Request, res: Response) {
  const { orgId, userId } = getAuth(req);
  const edits = AcceptTicketBody.parse(req.body ?? {});
  res.json({ ticket: await tickets.acceptTicket(orgId, TicketId.parse(req.params.id), edits, userId) });
}

export async function dismiss(req: Request, res: Response) {
  const { orgId, userId } = getAuth(req);
  res.json({ ticket: await tickets.dismissTicket(orgId, TicketId.parse(req.params.id), userId) });
}

export async function returnToQueue(req: Request, res: Response) {
  const { orgId, userId } = getAuth(req);
  res.json({ ticket: await tickets.returnToQueue(orgId, TicketId.parse(req.params.id), userId) });
}

export async function remove(req: Request, res: Response) {
  await tickets.deleteTicket(getAuth(req).orgId, TicketId.parse(req.params.id));
  res.status(204).end();
}

export async function addNote(req: Request, res: Response) {
  const { body } = NoteBody.parse(req.body);
  res.status(201).json({ note: await notes.addNote(getAuth(req), TicketId.parse(req.params.id), body) });
}

export async function editNote(req: Request, res: Response) {
  const { body } = NoteBody.parse(req.body);
  const note = await notes.editNote(getAuth(req), TicketId.parse(req.params.id), NoteId.parse(req.params.noteId), body);
  res.json({ note });
}

export async function deleteNote(req: Request, res: Response) {
  await notes.deleteNote(getAuth(req), TicketId.parse(req.params.id), NoteId.parse(req.params.noteId));
  res.status(204).end();
}
