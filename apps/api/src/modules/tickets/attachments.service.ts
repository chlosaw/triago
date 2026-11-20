import { MAX_ATTACHMENTS_PER_TICKET, MAX_ORG_ATTACHMENT_BYTES, type Attachment } from '@triago/shared';
import { prisma } from '../../lib/db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../../middleware/auth.js';
import { getTicket } from './tickets.service.js';

const summary = { id: true, filename: true, contentType: true, size: true, createdAt: true } as const;

function toAttachment(row: { id: string; filename: string; contentType: string; size: number; createdAt: Date }) {
  return { ...row, createdAt: row.createdAt.toISOString() } satisfies Attachment;
}

export async function listAttachments(orgId: string, ticketId: string): Promise<Attachment[]> {
  const rows = await prisma.attachment.findMany({
    where: { orgId, ticketId },
    orderBy: { createdAt: 'asc' },
    select: summary
  });
  return rows.map(toAttachment);
}

export async function addAttachment(
  auth: AuthContext,
  ticketId: string,
  file: { filename: string; contentType: string; data: Buffer }
): Promise<Attachment> {
  await getTicket(auth.orgId, ticketId);
  const count = await prisma.attachment.count({ where: { orgId: auth.orgId, ticketId } });
  if (count >= MAX_ATTACHMENTS_PER_TICKET) {
    throw new HttpError(409, 'TOO_MANY_ATTACHMENTS', `A ticket can have at most ${MAX_ATTACHMENTS_PER_TICKET} files.`);
  }
  // One organisation can't fill the shared database with files.
  const { _sum } = await prisma.attachment.aggregate({ where: { orgId: auth.orgId }, _sum: { size: true } });
  if ((_sum.size ?? 0) + file.data.length > MAX_ORG_ATTACHMENT_BYTES) {
    throw new HttpError(
      409,
      'STORAGE_FULL',
      'Your organisation has used its 500 MB of file storage. Delete old files or tickets to make room.'
    );
  }
  const row = await prisma.attachment.create({
    data: {
      orgId: auth.orgId,
      ticketId,
      uploaderId: auth.userId,
      filename: file.filename,
      contentType: file.contentType,
      size: file.data.length,
      data: new Uint8Array(file.data)
    },
    select: summary
  });
  return toAttachment(row);
}

export async function getAttachmentFile(orgId: string, ticketId: string, id: string) {
  const row = await prisma.attachment.findFirst({
    where: { orgId, ticketId, id },
    select: { filename: true, contentType: true, data: true }
  });
  if (!row) throw notFound('Attachment');
  return row;
}

/** The uploader or an admin may delete a file. */
export async function deleteAttachment(auth: AuthContext, ticketId: string, id: string): Promise<void> {
  const row = await prisma.attachment.findFirst({
    where: { orgId: auth.orgId, ticketId, id },
    select: { uploaderId: true }
  });
  if (!row) throw notFound('Attachment');
  if (row.uploaderId !== auth.userId && auth.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'Only the person who added this file or an admin can delete it.');
  }
  await prisma.attachment.delete({ where: { id } });
}
