import type { Category, ManualTriageReason, Priority } from '@triago/shared';
import { MANUAL_TRIAGE, priorityLabel } from '../../lib/labels';

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`pill pill-${priority}`}>{priorityLabel(priority)}</span>;
}

export function CategoryLabel({ category }: { category: Category }) {
  return <span className={`category-label category-${category}`}>{category}</span>;
}

export function TriageBadge({ reason }: { reason: ManualTriageReason | null }) {
  if (!reason) return null;
  const { label, note } = MANUAL_TRIAGE[reason];
  return (
    <span className={`triage-badge triage-${reason}`} title={note}>
      {label}
    </span>
  );
}
