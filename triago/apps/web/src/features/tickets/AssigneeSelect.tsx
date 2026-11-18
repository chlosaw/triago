import type { Ticket } from '@triago/shared';
import { useOrg, useTicketActions } from '../../api/queries';
import { useProfile } from '../auth/context';

/** Picks who owns a ticket. Lists the organisation's members, with the signed-in user first. */
export function AssigneeSelect({ ticket, className = 'status-select' }: { ticket: Ticket; className?: string }) {
  const members = useOrg().data?.members ?? [];
  const me = useProfile().user.id;
  const { update } = useTicketActions();
  const sorted = [...members].sort((a, b) => Number(b.id === me) - Number(a.id === me) || a.name.localeCompare(b.name));

  return (
    <select
      className={className}
      aria-label={`Assignee of ${ticket.key}`}
      value={ticket.assignee?.id ?? ''}
      disabled={update.isPending || members.length === 0}
      onChange={(event) => update.mutate({ id: ticket.id, patch: { assigneeId: event.target.value || null } })}
    >
      <option value="">Unassigned</option>
      {sorted.map((member) => (
        <option key={member.id} value={member.id}>
          {member.id === me ? `${member.name} (me)` : member.name}
        </option>
      ))}
    </select>
  );
}
