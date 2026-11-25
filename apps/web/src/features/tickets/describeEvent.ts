import type { Member, TicketEvent } from '@triago/shared';
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../lib/labels';

type Change = { from: string | null; to: string | null };

const FIELD_NAMES: Record<string, string> = {
  title: 'title',
  summary: 'summary',
  category: 'category',
  priority: 'priority',
  status: 'status',
  assigneeId: 'assignee'
};

const OPTION_LABELS: Record<string, string> = Object.fromEntries(
  [
    ...CATEGORY_OPTIONS,
    ...PRIORITY_OPTIONS,
    ...STATUS_OPTIONS,
    { value: 'resolved', label: 'Closed' },
    { value: 'dismissed', label: 'Closed' }
  ].map((option) => [option.value, option.label])
);

/** One sentence for an event, e.g. "changed priority from Medium to High". */
export function describeEvent(event: TicketEvent, members: Member[]): string {
  const data = event.data;
  const name = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? 'a former member') : 'nobody');
  const value = (field: string, raw: string | null) =>
    field === 'assigneeId' ? name(raw) : raw === null ? 'empty' : (OPTION_LABELS[raw] ?? `“${raw}”`);

  switch (event.type) {
    case 'created':
      if (data.source !== 'email') return 'created the ticket';
      if (!data.classifier) return 'imported the email';
      // 'claude' is kept for tickets drafted before the switch to Groq.
      return data.classifier === 'groq' || data.classifier === 'claude'
        ? 'imported the email; AI drafted the ticket'
        : data.classifier === 'keywords'
          ? 'imported the email; keyword rules drafted the ticket'
          : 'imported the email';
    case 'accepted': {
      const corrections = Object.entries((data.corrections ?? {}) as Record<string, Change>);
      if (corrections.length === 0) return 'accepted the draft as is';
      const list = corrections
        .map(
          ([field, change]) =>
            `${FIELD_NAMES[field] ?? field} ${value(field, change.from)} → ${value(field, change.to)}`
        )
        .join(', ');
      return `accepted the draft with corrections: ${list}`;
    }
    case 'dismissed':
      return 'closed the draft without filing it';
    case 'returned_to_queue':
      return 'moved it back to New';
    case 'drafted':
      return data.failed ? 'AI could not draft it; flagged for manual triage' : 'AI drafted the ticket';
    case 'injection_suspected':
      return 'flagged: the email seems to give the AI instructions, so the draft is marked low-confidence';
    case 'links_changed':
      return Number(data.count) === 1
        ? 'updated the links (1 link)'
        : `updated the links (${Number(data.count)} links)`;
    case 'field_changed': {
      const field = String(data.field);
      const change = data as unknown as Change;
      if (field === 'assigneeId') return change.to ? `assigned it to ${name(change.to)}` : 'unassigned it';
      if (field === 'title' || field === 'summary') return `edited the ${field}`;
      return `changed ${FIELD_NAMES[field] ?? field} from ${value(field, change.from)} to ${value(field, change.to)}`;
    }
    case 'replied':
      return data.sent === false ? 'wrote a reply (demo: not emailed)' : 'emailed a reply to the customer';
    case 'note_added':
      return 'added a note';
    case 'note_deleted':
      return 'deleted a note';
    default:
      return event.type.replaceAll('_', ' ');
  }
}
