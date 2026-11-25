import { PRIORITIES, SORTS, STATUSES } from '@triago/shared';
import { z } from 'zod';

// Request bodies live in @triago/shared; these parse URL parts only.

export const TicketId = z.uuid('Ticket not found.');
export const NoteId = z.uuid('Note not found.');
export const AttachmentId = z.uuid('Attachment not found.');

export const ListQuery = z.object({
  // Comma-separated, e.g. ?status=open,waiting
  status: z
    .string()
    .default(STATUSES.join(','))
    .transform((value) => value.split(','))
    .pipe(z.array(z.enum(STATUSES)).min(1)),
  // Comma-separated, e.g. ?priority=high,urgent; omitted means every priority.
  priority: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',') : undefined))
    .pipe(z.array(z.enum(PRIORITIES)).min(1).optional()),
  // Received between these instants (ISO 8601, inclusive), e.g. ?from=2026-11-01T00:00:00Z
  from: z.iso.datetime({ offset: true, message: 'Use an ISO date and time.' }).optional(),
  to: z.iso.datetime({ offset: true, message: 'Use an ISO date and time.' }).optional(),
  // received: newest email first. triaged: most recently accepted first.
  sort: z.enum(SORTS).default('received'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  // Matches title, summary, requester name or email; blank means no search.
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  // Only tickets assigned to this member; "me" means the caller.
  assignee: z.union([z.literal('me'), z.uuid('Invalid assignee.')]).optional(),
  // The id of the last ticket on the previous page.
  cursor: z.uuid('Invalid cursor.').optional()
});
