import type { Ticket } from '@triago/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { isConnected, syncGmail } from '../gmail/gmail.service.js';
import { getTicket, insertTicket } from '../tickets/tickets.service.js';
import { draftTicket } from './llm-classifier.js';
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

  // Outside the transaction: the model call can take a few seconds.
  const draft = await draftTicket(email);
  const imported = await prisma
    .$transaction(async (tx) => {
      const id = await insertTicket(
        tx,
        orgId,
        {
          title: draft.title,
          summary: draft.summary,
          category: draft.category,
          priority: draft.priority,
          aiConfidence: draft.confidence,
          source: 'email',
          requesterName: email.fromName,
          requesterEmail: email.fromEmail,
          externalId: email.id,
          body: email.body,
          classifier: draft.classifier
        },
        null
      );
      return getTicket(orgId, id, tx);
    })
    .catch((error: unknown) => {
      // Another sync in this organisation imported the same email while this one was classifying.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpError(409, 'ALREADY_IMPORTED', 'That email was just imported. Pull again for the next one.');
      }
      throw error;
    });
  return { imported, remaining };
}
