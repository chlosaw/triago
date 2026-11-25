import { STATUSES, type Ticket } from '@triago/shared';
import { Link } from 'react-router-dom';
import { useTicketPages } from '../../api/queries';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { displayStatus, formatReceived, priorityLabel, STATUS_COLUMNS } from '../../lib/labels';
import { CategoryIcon, PriorityIcon } from '../../components/Icons';
import { TriageBadge } from '../tickets/TicketBadges';
import { StatusSelect } from '../tickets/StatusSelect';

/** Closed tickets are folded away after this many, so the list stays about open work. */
const CLOSED_PREVIEW = 5;

/** Tickets assigned to the signed-in member, grouped New → In progress → On hold → Closed. */
export function MyTickets() {
  const tickets = useTicketPages(STATUSES, 'received', { assignee: 'me', limit: 100 });

  return (
    <Card className="panel-card my-tickets">
      <span className="stat-note">Assigned to you, newest first in each status</span>

      <QueryState
        query={tickets}
        loadingLabel="Loading your tickets…"
        isEmpty={(list) => list.length === 0}
        empty={
          <>
            <div className="queue-empty-title">Nothing assigned to you</div>
            <span>
              Use <strong>+ Create</strong> to add a ticket, or pick one up in the Queue.
            </span>
          </>
        }
      >
        {(list) => (
          <div className="my-groups">
            {STATUS_COLUMNS.map((column) => {
              const group = list.filter((ticket) => displayStatus(ticket.status) === column.value);
              if (group.length === 0) return null;
              if (column.value === 'closed' && group.length > CLOSED_PREVIEW) {
                return (
                  <details key={column.value} className="my-group">
                    <summary className="my-group-head">
                      <span className={`status-dot st-${column.value}`} aria-hidden="true" />
                      {column.label}
                      <span className="my-group-count">{group.length}</span>
                    </summary>
                    <TicketList tickets={group} />
                  </details>
                );
              }
              return (
                <section key={column.value} className="my-group" aria-label={column.label}>
                  <div className="my-group-head">
                    <span className={`status-dot st-${column.value}`} aria-hidden="true" />
                    {column.label}
                    <span className="my-group-count">{group.length}</span>
                  </div>
                  <TicketList tickets={group} />
                </section>
              );
            })}
          </div>
        )}
      </QueryState>
      {tickets.hasNextPage && (
        <button
          type="button"
          className="btn btn-ghost load-more"
          disabled={tickets.isFetchingNextPage}
          onClick={() => tickets.fetchNextPage()}
        >
          {tickets.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </Card>
  );
}

function TicketList({ tickets }: { tickets: Ticket[] }) {
  return (
    <div className="my-table" role="table" aria-label="Tickets">
      <div className="my-row my-head" role="row">
        <span role="columnheader">Key</span>
        <span role="columnheader">Title</span>
        <span role="columnheader">Priority</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" className="my-time">
          Received
        </span>
      </div>
      {tickets.map((ticket) => (
        <div key={ticket.id} className="my-row" role="row">
          <span className="my-key" role="cell">
            <CategoryIcon category={ticket.category} />
            <span className="ticket-key">{ticket.key}</span>
          </span>
          <span className="my-title-cell" role="cell">
            <Link className="my-title" to={`/tickets/${ticket.id}`} title={ticket.title}>
              {ticket.title}
            </Link>
            <TriageBadge reason={ticket.manualTriage} />
          </span>
          <span className="my-priority" role="cell">
            <PriorityIcon priority={ticket.priority} />
            {priorityLabel(ticket.priority)}
          </span>
          <span role="cell">
            <StatusSelect ticket={ticket} />
          </span>
          <span className="my-time" role="cell">
            {formatReceived(ticket.receivedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
