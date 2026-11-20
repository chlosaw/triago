import type { Category, Priority, SettableStatus, Status } from '@triago/shared';

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

/**
 * The four statuses people see. Each is one `SettableStatus` the API accepts, plus
 * the stored statuses shown under it: legacy `resolved` and triage `dismissed` count as Closed.
 */
export const STATUS_COLUMNS: { value: SettableStatus; label: string; statuses: readonly Status[] }[] = [
  { value: 'new', label: 'New', statuses: ['new'] },
  { value: 'open', label: 'In progress', statuses: ['open'] },
  { value: 'waiting', label: 'On hold', statuses: ['waiting'] },
  { value: 'closed', label: 'Closed', statuses: ['closed', 'resolved', 'dismissed'] }
];

export const STATUS_OPTIONS = STATUS_COLUMNS.map(({ value, label }) => ({ value, label }));

/** Which of the four statuses a stored status shows as. */
export const displayStatus = (status: Status): SettableStatus =>
  STATUS_COLUMNS.find((column) => column.statuses.includes(status))!.value;

export const statusLabel = (status: Status) =>
  STATUS_COLUMNS.find((column) => column.value === displayStatus(status))!.label;

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

/** "2.4 MB", "830 KB", "512 B". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
