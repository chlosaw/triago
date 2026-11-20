import type { SettableStatus, Ticket } from '@triago/shared';
import { useTicketActions } from '../../api/queries';
import { displayStatus, STATUS_OPTIONS } from '../../lib/labels';

/** Moves a ticket between New, In progress, On hold and Closed. */
export function StatusSelect({ ticket, className = 'status-select' }: { ticket: Ticket; className?: string }) {
  const { update } = useTicketActions();
  const current = displayStatus(ticket.status);

  return (
    <select
      className={`${className} st-${current}`}
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
  );
}
