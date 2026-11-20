import { z } from 'zod';

export const STATUSES = ['new', 'open', 'waiting', 'resolved', 'closed', 'dismissed'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const CATEGORIES = ['bug', 'request', 'question', 'billing'] as const;
export const SOURCES = ['email', 'manual'] as const;
export const SORTS = ['received', 'triaged'] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Source = (typeof SOURCES)[number];
export type Sort = (typeof SORTS)[number];

/**
 * The four statuses people work with. In the UI: `new` = New, `open` = In progress,
 * `waiting` = On hold, `closed` = Closed. The legacy `resolved` and the triage-only
 * `dismissed` are shown as Closed.
 */
export const SETTABLE_STATUSES = ['new', 'open', 'waiting', 'closed'] as const satisfies readonly Status[];
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

const Title = z.string().trim().min(1, 'Title is required.').max(200);
const Summary = z.string().trim().max(5000, 'Keep the description under 5000 characters.');

export const TicketLink = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .pipe(z.url({ protocol: /^https?$/, message: 'Enter a full http:// or https:// link.' })),
  title: z.string().trim().max(200).default('')
});
export type TicketLink = z.infer<typeof TicketLink>;
const Links = z.array(TicketLink).max(20, 'Add at most 20 links.');

export const CreateTicketBody = z.object({
  title: Title,
  summary: Summary.optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(SETTABLE_STATUSES).optional(),
  assigneeId: z.uuid().nullable().optional(),
  links: Links.optional()
});
export type CreateTicketBody = z.infer<typeof CreateTicketBody>;

export const PatchTicketBody = z
  .object({
    title: Title,
    summary: Summary,
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    status: z.enum(SETTABLE_STATUSES),
    assigneeId: z.uuid().nullable(),
    links: Links
  })
  .partial()
  .strict();
export type PatchTicketBody = z.infer<typeof PatchTicketBody>;

/** Edits an agent can make to an AI draft before accepting it. */
export const AcceptTicketBody = PatchTicketBody.pick({
  title: true,
  summary: true,
  category: true,
  priority: true
}).strict();
export type AcceptTicketBody = z.infer<typeof AcceptTicketBody>;

/** An internal note on a ticket; only agents see it. */
export const NoteBody = z.object({
  body: z.string().trim().min(1, 'Write something first.').max(5000, 'Keep notes under 5000 characters.')
});
export type NoteBody = z.infer<typeof NoteBody>;

export interface Ticket {
  id: string;
  key: string;
  title: string;
  summary: string;
  category: Category;
  priority: Priority;
  status: Status;
  source: Source;
  requester: { name: string; email: string | null };
  assignee: { id: string; name: string } | null;
  links: TicketLink[];
  aiConfidence: number | null;
  receivedAt: string;
  triagedAt: string | null;
  updatedAt: string;
}

export interface TicketPage {
  tickets: Ticket[];
  /** Pass back as ?cursor= for the next page; null on the last page. */
  nextCursor: string | null;
}

export interface Message {
  id: string;
  kind: 'inbound' | 'outbound' | 'note';
  fromName: string;
  fromEmail: string | null;
  body: string;
  /** The agent who wrote a note; null for emails. */
  authorId: string | null;
  createdAt: string;
  editedAt: string | null;
}

export interface TicketEvent {
  id: string;
  type: string;
  actor: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

/** A file attached to a ticket; download it from /tickets/:id/attachments/:attachmentId. */
export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/** Largest file a ticket attachment may be, in bytes. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TICKET = 20;

/** Text to check for spelling and grammar. */
export const CorrectTextBody = z.object({ text: z.string().max(5000) });
export type CorrectTextBody = z.infer<typeof CorrectTextBody>;

export interface CorrectTextResult {
  text: string;
  changed: boolean;
  /** `ai` when a language model checked it, `rules` for the built-in spelling and punctuation fixes. */
  engine: 'ai' | 'rules';
}
