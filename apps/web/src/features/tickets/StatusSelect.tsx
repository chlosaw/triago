import type { SettableStatus, Ticket } from '@triago/shared';
import { useTicketActions } from '../../api/queries';
import { displayStatus, STATUS_OPTIONS, statusLabel } from '../../lib/labels';

/**
 * The ticket's status as a coloured lozenge that is also a dropdown:
 * New, In progress, On hold, Closed.
 */
export function StatusSelect({ ticket, className = '' }: { ticket: Ticket; className?: string }) {
  const { update } = useTicketActions();
  const current = displayStatus(ticket.status);

  return (
    <span className={`lozenge-select lozenge-${current} ${className}`}>
      <span className="lozenge-text" aria-hidden="true">
        {statusLabel(ticket.status)}
      </span>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <select
        aria-label={`Status of ${ticket.key}`}
        value={current}
        disabled={update.isPending}
        onChange={(event) => update.mutate({ id: ticket.id, patch: { status: event.target.value as SettableStatus } })}
      >
        {STATUS_OPTIONS.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** A read-only status lozenge. */
export function StatusLozenge({ status }: { status: Ticket['status'] }) {
  return <span className={`lozenge lozenge-${displayStatus(status)}`}>{statusLabel(status)}</span>;
}
