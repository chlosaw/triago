import {
  AcceptTicketBody,
  CreateTicketBody,
  MAX_ATTACHMENT_BYTES,
  NoteBody,
  PatchTicketBody,
  ReplyBody
} from '@triago/shared';
import type { Request, Response } from 'express';
import { HttpError } from '../../lib/errors.js';
import { getAuth } from '../../middleware/auth.js';
import * as attachments from './attachments.service.js';
import * as notes from './notes.service.js';
import * as replies from './replies.service.js';
import { AttachmentId, ListQuery, NoteId, TicketId } from './tickets.schema.js';
import * as tickets from './tickets.service.js';

export async function list(req: Request, res: Response) {
  const auth = getAuth(req);
  const { status, assignee, priority, from, to, ...options } = ListQuery.parse(req.query);
  const assigneeId = assignee === 'me' ? auth.userId : assignee;
  if (from && to && new Date(from) > new Date(to)) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The start date is after the end date.', { from: 'After "to"' });
  }
  res.json(
    await tickets.listTickets(auth.orgId, {
      statuses: status,
      priorities: priority,
      receivedFrom: from ? new Date(from) : undefined,
      receivedTo: to ? new Date(to) : undefined,
      assigneeId,
      ...options
    })
  );
}

export async function create(req: Request, res: Response) {
  const { orgId, userId } = getAuth(req);
  const ticket = await tickets.createManualTicket(orgId, CreateTicketBody.parse(req.body), userId);
  res.status(201).json({ ticket });
}

export async function show(req: Request, res: Response) {
  const { orgId } = getAuth(req);
  const id = TicketId.parse(req.params.id);
  const [ticket, messages, files] = await Promise.all([
    tickets.getTicket(orgId, id),
    tickets.listMessages(orgId, id),
    attachments.listAttachments(orgId, id)
  ]);
  res.json({ ticket, messages, attachments: files });
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

export async function reply(req: Request, res: Response) {
  const { body } = ReplyBody.parse(req.body);
  res.status(201).json(await replies.sendReply(getAuth(req), TicketId.parse(req.params.id), body));
}

export async function replyDraft(req: Request, res: Response) {
  res.json(await replies.draftReply(getAuth(req), TicketId.parse(req.params.id)));
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

/**
 * The body is the raw file (sent as application/octet-stream); the name and real
 * type come in X-Filename (URI-encoded) and X-Content-Type.
 */
export async function addAttachment(req: Request, res: Response) {
  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The file is empty.');
  }
  if (data.length > MAX_ATTACHMENT_BYTES) throw new HttpError(413, 'TOO_LARGE', 'Files can be at most 5 MB.');
  let filename = 'file';
  try {
    filename = decodeURIComponent(String(req.get('x-filename') ?? 'file'));
  } catch {
    // Keep the default name.
  }
  // Strip path parts and control characters so the name is safe in a download header.
  filename =
    filename
      .split(/[\\/]/)
      .pop()!
      // eslint-disable-next-line no-control-regex -- removing control characters is the point
      .replace(/[\u0000-\u001f\u007f"]/g, '')
      .trim()
      .slice(0, 200) || 'file';
  const type = String(req.get('x-content-type') ?? '').trim();
  const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type.slice(0, 100) : 'application/octet-stream';

  const attachment = await attachments.addAttachment(getAuth(req), TicketId.parse(req.params.id), {
    filename,
    contentType,
    data
  });
  res.status(201).json({ attachment });
}

export async function downloadAttachment(req: Request, res: Response) {
  const file = await attachments.getAttachmentFile(
    getAuth(req).orgId,
    TicketId.parse(req.params.id),
    AttachmentId.parse(req.params.attachmentId)
  );
  // Always a download, never rendered inline, so an uploaded HTML or SVG file can't run in the app's origin.
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(Buffer.from(file.data));
}

export async function deleteAttachment(req: Request, res: Response) {
  await attachments.deleteAttachment(
    getAuth(req),
    TicketId.parse(req.params.id),
    AttachmentId.parse(req.params.attachmentId)
  );
  res.status(204).end();
}
