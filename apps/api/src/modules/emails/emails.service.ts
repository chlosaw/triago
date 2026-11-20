import type { Ticket } from '@triago/shared';
import { prisma } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { isConnected, syncGmail } from '../gmail/gmail.service.js';
import { getTicket } from '../tickets/tickets.service.js';
import { storeEmail } from './intake.service.js';
import { SAMPLE_MAILBOX } from './sampleMailbox.js';

export interface SyncResult {
  /** The first ticket imported, so the queue can open it. */
  imported: Ticket | null;
  importedCount: number;
  remaining: number;
  source: 'gmail' | 'sample';
}

/** Pulls new mail: from the connected Gmail mailbox, or the sample mailbox when none is connected. */
export async function syncInbox(orgId: string): Promise<SyncResult> {
  if (await isConnected(orgId)) {
    const { imported, remaining } = await syncGmail(orgId);
    return { imported: imported[0] ?? null, importedCount: imported.length, remaining, source: 'gmail' };
  }
  const { imported, remaining } = await importNextEmail(orgId);
  return { imported, importedCount: imported ? 1 : 0, remaining, source: 'sample' };
}

/** Imports the next email this organisation has not seen from the sample mailbox, with an AI draft. */
export async function importNextEmail(orgId: string): Promise<{ imported: Ticket | null; remaining: number }> {
  const seen = await prisma.ticket.findMany({
    where: { orgId, externalId: { in: SAMPLE_MAILBOX.map((email) => email.id) } },
    select: { externalId: true }
  });
  const seenIds = new Set(seen.map((row) => row.externalId));
  const email = SAMPLE_MAILBOX.find((candidate) => !seenIds.has(candidate.id));
  const remaining = SAMPLE_MAILBOX.length - seenIds.size - (email ? 1 : 0);
  if (!email) return { imported: null, remaining };

  const result = await storeEmail(orgId, {
    externalId: email.id,
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    subject: email.subject,
    text: email.body
  });
  if (result.status === 'duplicate') {
    throw new HttpError(409, 'ALREADY_IMPORTED', 'That email was just imported. Pull again for the next one.');
  }
  const imported = await getTicket(orgId, result.ticketId);
  return { imported, remaining };
}
