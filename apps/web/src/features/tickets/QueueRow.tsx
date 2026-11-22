import type { Ticket } from '@triago/shared';
import { CategoryIcon, PriorityIcon } from '../../components/Icons';
import { CATEGORY_OPTIONS, formatReceived, percent, priorityLabel } from '../../lib/labels';
import { TriageBadge } from './TicketBadges';

export function QueueRow({ ticket, active, onSelect }: { ticket: Ticket; active: boolean; onSelect: () => void }) {
  const type = CATEGORY_OPTIONS.find((c) => c.value === ticket.category)?.label ?? ticket.category;
  return (
    <button type="button" className={`queue-row ${active ? 'is-active' : ''}`} onClick={onSelect} aria-current={active}>
      <div className="queue-row-top">
        <span>{ticket.requester.name || ticket.requester.email || 'Manual ticket'}</span>
        <span className="queue-time">{formatReceived(ticket.receivedAt)}</span>
      </div>
      <span className="queue-title">{ticket.title}</span>
      <div className="queue-meta">
        <span className="cell-type">
          <CategoryIcon category={ticket.category} />
          <span>{type}</span>
        </span>
        <span className="cell-type" title={`Priority: ${priorityLabel(ticket.priority)}`}>
          <PriorityIcon priority={ticket.priority} />
          <span>{priorityLabel(ticket.priority)}</span>
        </span>
        <TriageBadge reason={ticket.manualTriage} />
        {ticket.aiConfidence !== null && <span className="queue-confidence">{percent(ticket.aiConfidence)} sure</span>}
      </div>
    </button>
  );
}
