import {
  type AcceptTicketBody,
  type CreateTicketBody,
  type Category,
  type Message,
  type PatchTicketBody,
  type Priority,
  type Sort,
  type Source,
  type Status,
  type Ticket,
  type TicketEvent,
  type TicketLink,
  type TicketPage
} from '@triago/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type Tx } from '../../lib/db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { toMessage } from './notes.service.js';

// Every query here filters by orgId. That filter is the tenant boundary: a
// ticket id from another organisation behaves as if it does not exist.

const ticketInclude = {
  org: { select: { ticketPrefix: true } },
  assignee: { select: { id: true, name: true } }
} satisfies Prisma.TicketInclude;

type TicketRow = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    key: `${row.org.ticketPrefix}-${row.number}`,
    title: row.title,
    summary: row.summary,
    category: row.category,
    priority: row.priority,
    status: row.status,
    source: row.source,
    requester: { name: row.requesterName, email: row.requesterEmail },
    assignee: row.assignee,
    links: Array.isArray(row.links) ? (row.links as unknown as TicketLink[]) : [],
    aiConfidence: row.aiConfidence,
    receivedAt: row.receivedAt.toISOString(),
    triagedAt: row.triagedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}

const ORDER_BY: Record<Sort, Prisma.TicketOrderByWithRelationInput[]> = {
  received: [{ receivedAt: 'desc' }, { id: 'desc' }],
  triaged: [{ triagedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
};

/**
 * Cursor pagination, newest first. The cursor is the last ticket's id; ties on
 * the sort column break on id, so pages stay stable while new tickets arrive.
 */
export async function listTickets(
  orgId: string,
  options: { statuses: Status[]; sort: Sort; limit: number; cursor?: string; q?: string; assigneeId?: string }
): Promise<TicketPage> {
  const rows = await prisma.ticket.findMany({
    where: {
      orgId,
      status: { in: options.statuses },
      ...(options.assigneeId ? { assigneeId: options.assigneeId } : {}),
      ...(options.q ? searchFilter(options.q) : {})
    },
    orderBy: ORDER_BY[options.sort],
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: ticketInclude
  });

  const page = rows.slice(0, options.limit);
  return {
    tickets: page.map(toTicket),
    nextCursor: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null
  };
}

/** Case-insensitive substring match on title, summary and requester. `%` and `_` match themselves. */
function searchFilter(q: string): Prisma.TicketWhereInput {
  const term = q.replace(/[\\%_]/g, '\\$&');
  const contains = { contains: term, mode: 'insensitive' } as const;
  return {
    OR: [{ title: contains }, { summary: contains }, { requesterName: contains }, { requesterEmail: contains }]
  };
}

export async function getTicket(orgId: string, id: string, db: Tx = prisma): Promise<Ticket> {
  const row = await db.ticket.findFirst({ where: { orgId, id }, include: ticketInclude });
  if (!row) throw notFound('Ticket');
  return toTicket(row);
}

export async function listMessages(orgId: string, ticketId: string): Promise<Message[]> {
  const rows = await prisma.message.findMany({ where: { orgId, ticketId }, orderBy: { createdAt: 'asc' } });
  return rows.map(toMessage);
}

export async function listEvents(orgId: string, ticketId: string): Promise<TicketEvent[]> {
  await getTicket(orgId, ticketId);
  const rows = await prisma.ticketEvent.findMany({
    where: { orgId, ticketId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { actor: { select: { name: true } } }
  });
  return rows.map((row) => ({
    id: String(row.id),
    type: row.type,
    actor: row.actor?.name ?? null,
    data: row.data as Record<string, unknown>,
    createdAt: row.createdAt.toISOString()
  }));
}

export interface NewTicket {
  title: string;
  summary?: string;
  category?: Category;
  priority?: Priority;
  status?: Status;
  assigneeId?: string | null;
  links?: TicketLink[];
  source: Source;
  requesterName?: string;
  requesterEmail?: string | null;
  aiConfidence?: number | null;
  externalId?: string | null;
  receivedAt?: Date;
  triagedAt?: Date | null;
  /** The original email, stored as the ticket's first message. */
  body?: string;
  /** Which classifier drafted an email ticket; kept on the `created` event, not the ticket. */
  classifier?: string;
}

/** Inserts a ticket (and its source email, if any) and logs a `created` event. Returns the new id. */
export async function insertTicket(tx: Tx, orgId: string, input: NewTicket, actorId: string | null): Promise<string> {
  const { nextTicketNumber } = await tx.organisation.update({
    where: { id: orgId },
    data: { nextTicketNumber: { increment: 1 } },
    select: { nextTicketNumber: true }
  });
  const { body, classifier, ...fields } = input;
  const receivedAt = input.receivedAt ?? new Date();

  const ticket = await tx.ticket.create({
    data: { ...fields, orgId, number: nextTicketNumber - 1, receivedAt },
    select: { id: true }
  });
  if (body) {
    await tx.message.create({
      data: {
        orgId,
        ticketId: ticket.id,
        kind: 'inbound',
        fromName: input.requesterName ?? '',
        fromEmail: input.requesterEmail ?? null,
        body,
        createdAt: receivedAt
      }
    });
  }
  await logEvent(
    tx,
    orgId,
    ticket.id,
    actorId,
    'created',
    { source: input.source, ...(classifier ? { classifier } : {}) },
    receivedAt
  );
  return ticket.id;
}

/**
 * A ticket an agent writes by hand. Without a status it starts In progress
 * (`open`); a `new` ticket waits in the New column like an email draft.
 */
export async function createManualTicket(orgId: string, input: CreateTicketBody, actorId: string): Promise<Ticket> {
  return prisma.$transaction(async (tx) => {
    if (input.assigneeId) await assertMember(tx, orgId, input.assigneeId);
    const status = input.status ?? 'open';
    const id = await insertTicket(
      tx,
      orgId,
      { ...input, source: 'manual', status, triagedAt: status === 'new' ? null : new Date() },
      actorId
    );
    return getTicket(orgId, id, tx);
  });
}

async function assertMember(tx: Tx, orgId: string, userId: string): Promise<void> {
  const member = await tx.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
  if (!member) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Assignee is not in this organisation.', {
      assigneeId: 'Not a member'
    });
  }
}

/** Applies a partial update and records one `field_changed` event per field that actually changed. */
export async function updateTicket(
  orgId: string,
  id: string,
  patch: PatchTicketBody,
  actorId: string
): Promise<Ticket> {
  return prisma.$transaction(async (tx) => {
    const current = await lockTicket(tx, orgId, id);
    if (patch.assigneeId) await assertMember(tx, orgId, patch.assigneeId);

    const { links, ...fields } = patch;
    const changes = await applyChanges(tx, current, fields);
    for (const [field, change] of Object.entries(changes)) {
      await logEvent(tx, orgId, id, actorId, 'field_changed', { field, ...change });
    }

    // Leaving New counts as triage; going back to New puts the ticket in the queue again.
    if (changes.status) {
      const triagedAt = changes.status.to === 'new' ? null : current.status === 'new' ? new Date() : undefined;
      if (triagedAt !== undefined) await tx.ticket.update({ where: { id }, data: { triagedAt } });
    }

    if (links && JSON.stringify(links) !== JSON.stringify(current.links)) {
      await tx.ticket.update({ where: { id }, data: { links } });
      await logEvent(tx, orgId, id, actorId, 'links_changed', { count: links.length });
    }
    return getTicket(orgId, id, tx);
  });
}

/**
 * Accepts an AI-drafted ticket from the triage queue. Edits the agent made
 * to the draft are logged as corrections so model accuracy can be measured.
 */
export async function acceptTicket(
  orgId: string,
  id: string,
  edits: AcceptTicketBody,
  actorId: string
): Promise<Ticket> {
  return prisma.$transaction(async (tx) => {
    const current = await lockTicket(tx, orgId, id);
    if (current.status !== 'new') throw new HttpError(409, 'ALREADY_TRIAGED', 'This ticket has already been triaged.');

    const corrections = await applyChanges(tx, current, edits);
    await tx.ticket.update({ where: { id }, data: { status: 'open', triagedAt: new Date() } });
    await logEvent(tx, orgId, id, actorId, 'accepted', { corrections });
    return getTicket(orgId, id, tx);
  });
}

export async function dismissTicket(orgId: string, id: string, actorId: string): Promise<Ticket> {
  return prisma.$transaction(async (tx) => {
    const current = await lockTicket(tx, orgId, id);
    if (current.status !== 'new') throw new HttpError(409, 'ALREADY_TRIAGED', 'This ticket has already been triaged.');

    await tx.ticket.update({ where: { id }, data: { status: 'dismissed', triagedAt: new Date() } });
    await logEvent(tx, orgId, id, actorId, 'dismissed', {});
    return getTicket(orgId, id, tx);
  });
}

/** Undo for a triage decision: puts the ticket back in the queue. */
export async function returnToQueue(orgId: string, id: string, actorId: string): Promise<Ticket> {
  return prisma.$transaction(async (tx) => {
    const current = await lockTicket(tx, orgId, id);
    if (current.status !== 'open' && current.status !== 'dismissed') {
      throw new HttpError(409, 'CANNOT_RETURN', 'Only open or dismissed tickets can go back to the queue.');
    }

    await tx.ticket.update({ where: { id }, data: { status: 'new', triagedAt: null } });
    await logEvent(tx, orgId, id, actorId, 'returned_to_queue', { from: current.status });
    return getTicket(orgId, id, tx);
  });
}

export async function deleteTicket(orgId: string, id: string): Promise<void> {
  const { count } = await prisma.ticket.deleteMany({ where: { orgId, id } });
  if (!count) throw notFound('Ticket');
}

const EDITABLE = ['title', 'summary', 'category', 'priority', 'status', 'assigneeId'] as const;
type Editable = Pick<Prisma.TicketGetPayload<object>, 'id' | 'links' | (typeof EDITABLE)[number]>;

/** Row-locks the ticket for the rest of the transaction and returns its editable fields. */
async function lockTicket(tx: Tx, orgId: string, id: string): Promise<Editable> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    select id from tickets where org_id = ${orgId}::uuid and id = ${id}::uuid for update`;
  if (!locked.length) throw notFound('Ticket');
  return tx.ticket.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      priority: true,
      status: true,
      assigneeId: true,
      links: true
    }
  });
}

type Change = { from: string | null; to: string | null };

/** Writes the fields of `patch` that differ from `current` and returns them as { field: { from, to } }. */
async function applyChanges(
  tx: Tx,
  current: Editable,
  patch: Omit<PatchTicketBody, 'links'>
): Promise<Record<string, Change>> {
  const changes: Record<string, Change> = {};
  const data: Prisma.TicketUncheckedUpdateInput = {};

  for (const field of EDITABLE) {
    const next = patch[field];
    if (next === undefined || next === current[field]) continue;
    changes[field] = { from: current[field], to: next };
    Object.assign(data, { [field]: next });
  }

  if (Object.keys(data).length) await tx.ticket.update({ where: { id: current.id }, data });
  return changes;
}

async function logEvent(
  tx: Tx,
  orgId: string,
  ticketId: string,
  actorId: string | null,
  type: string,
  data: Prisma.InputJsonObject,
  createdAt: Date = new Date()
): Promise<void> {
  await tx.ticketEvent.create({ data: { orgId, ticketId, actorId, type, data, createdAt } });
}
