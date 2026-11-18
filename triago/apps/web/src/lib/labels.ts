import type { Category, Priority, Status } from '@triago/shared';

export const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'request', label: 'Request' },
  { value: 'question', label: 'Question' },
  { value: 'billing', label: 'Billing' }
];

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

/** Statuses a triaged ticket moves through, in board order. */
export const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'waiting', label: 'Waiting on customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
];

export type StatusGroup = 'new' | 'waiting' | 'closed';

/** How the dashboard groups statuses: not started, waiting on the customer, done. */
export const STATUS_GROUPS: { value: StatusGroup; label: string; statuses: readonly Status[] }[] = [
  { value: 'new', label: 'New', statuses: ['new', 'open'] },
  { value: 'waiting', label: 'Waiting', statuses: ['waiting'] },
  { value: 'closed', label: 'Closed', statuses: ['resolved', 'closed'] }
];

/** The status an agent picks for each group in the dashboard table. */
export const GROUP_STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'open', label: 'New' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'closed', label: 'Closed' }
];

export const priorityLabel = (priority: Priority) =>
  PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;

export const percent = (value: number) => `${Math.round(value * 100)}%`;

/** "9:42" today, "Yesterday", or "Mon 28 Oct". */
export function formatReceived(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
