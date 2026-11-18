import type { Message } from '@triago/shared';
import type { Message as MessageRow } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../../middleware/auth.js';

// Internal notes are messages of kind `note`. Like everything else they are
// scoped to the organisation; on top of that only the author may edit a note,
// and only the author or an admin may delete it.

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    kind: row.kind,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    body: row.body,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null
  };
}

export async function addNote(auth: AuthContext, ticketId: string, body: string): Promise<Message> {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { orgId: auth.orgId, id: ticketId }, select: { id: true } });
    if (!ticket) throw notFound('Ticket');
    const author = await tx.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { name: true } });

    const note = await tx.message.create({
      data: { orgId: auth.orgId, ticketId, kind: 'note', authorId: auth.userId, fromName: author.name, body }
    });
    await tx.ticketEvent.create({
      data: { orgId: auth.orgId, ticketId, actorId: auth.userId, type: 'note_added', data: { noteId: note.id } }
    });
    return toMessage(note);
  });
}

/** Finds a note on this ticket in the caller's organisation, or 404s. */
async function findNote(auth: AuthContext, ticketId: string, noteId: string) {
  const note = await prisma.message.findFirst({
    where: { id: noteId, ticketId, orgId: auth.orgId, kind: 'note' }
  });
  if (!note) throw notFound('Note');
  return note;
}

export async function editNote(auth: AuthContext, ticketId: string, noteId: string, body: string): Promise<Message> {
  const note = await findNote(auth, ticketId, noteId);
  if (note.authorId !== auth.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only edit your own notes.');
  }
  const updated = await prisma.message.update({ where: { id: note.id }, data: { body, editedAt: new Date() } });
  return toMessage(updated);
}

export async function deleteNote(auth: AuthContext, ticketId: string, noteId: string): Promise<void> {
  const note = await findNote(auth, ticketId, noteId);
  if (note.authorId !== auth.userId && auth.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'Only the author or an admin can delete this note.');
  }
  await prisma.$transaction([
    prisma.message.delete({ where: { id: note.id } }),
    prisma.ticketEvent.create({
      data: { orgId: auth.orgId, ticketId, actorId: auth.userId, type: 'note_deleted', data: { noteId: note.id } }
    })
  ]);
}
