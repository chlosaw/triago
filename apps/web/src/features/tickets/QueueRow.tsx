import type { Ticket } from '@triago/shared';
import { formatReceived, percent } from '../../lib/labels';
import { CategoryLabel, PriorityBadge, TriageBadge } from './TicketBadges';

export function QueueRow({ ticket, active, onSelect }: { ticket: Ticket; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`queue-row ${active ? 'is-active' : ''}`} onClick={onSelect} aria-current={active}>
      <div className="queue-row-top">
        <span>{ticket.requester.name || ticket.requester.email || 'Manual ticket'}</span>
        <span className="queue-time">{formatReceived(ticket.receivedAt)}</span>
      </div>
      <span className="queue-title">{ticket.title}</span>
      <div className="queue-meta">
        <CategoryLabel category={ticket.category} />
        <PriorityBadge priority={ticket.priority} />
        <TriageBadge reason={ticket.manualTriage} />
        {ticket.aiConfidence !== null && <span className="queue-confidence">{percent(ticket.aiConfidence)} sure</span>}
      </div>
    </button>
  );
}
