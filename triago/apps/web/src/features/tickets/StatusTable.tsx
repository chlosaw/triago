import type { Stats, Status } from '@triago/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTicketActions, useTicketPages } from '../../api/queries';
import { Card } from '../../components/Card';
import { ConfirmButton } from '../../components/ConfirmButton';
import { ErrorState, QueryState } from '../../components/QueryState';
import { formatReceived, GROUP_STATUS_OPTIONS, STATUS_GROUPS, type StatusGroup } from '../../lib/labels';
import { useProfile } from '../auth/context';
import { CategoryLabel, PriorityBadge } from './TicketBadges';
import { AssigneeSelect } from './AssigneeSelect';

/** Resolved tickets sit under Closed, so the picker shows them as Closed. */
const pickerValue = (status: Status): Status => (status === 'resolved' ? 'closed' : status);

export function StatusTable({ byStatus }: { byStatus: Stats['byStatus'] }) {
  const { role } = useProfile();
  const [group, setGroup] = useState<StatusGroup>('new');
  const current = STATUS_GROUPS.find((g) => g.value === group)!;
  const tickets = useTicketPages(current.statuses, 'received');
  const actions = useTicketActions();
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const mutationError = actions.update.error ?? actions.remove.error ?? actions.create.error;

  const countOf = (statuses: readonly Status[]) => statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);

  function addTicket(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError('Give the ticket a title.');
      return;
    }
    actions.create.mutate(title.trim(), { onSuccess: () => setTitle('') });
  }

  return (
    <Card className="recent-card">
      <div className="recent-header-row">
        <h3>Tickets by status</h3>
        <form className="inline-form" onSubmit={addTicket} noValidate>
          <div className="field-stack">
            <input
              className="input"
              placeholder="New ticket title"
              aria-label="New ticket title"
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? 'new-ticket-error' : undefined}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleError('');
              }}
            />
            {titleError && (
              <span id="new-ticket-error" className="field-error">
                {titleError}
              </span>
            )}
          </div>
          <button type="submit" className="btn btn-primary recent-add-btn" disabled={actions.create.isPending}>
            Add ticket
          </button>
        </form>
      </div>

      <div className="status-tabs" role="tablist" aria-label="Ticket status">
        {STATUS_GROUPS.map((g) => (
          <button
            key={g.value}
            type="button"
            role="tab"
            aria-selected={g.value === group}
            className={`status-tab ${g.value === group ? 'is-active' : ''}`}
            onClick={() => setGroup(g.value)}
          >
            <span className="status-tab-label">{g.label}</span>
            <span className="status-tab-count">{countOf(g.statuses)}</span>
          </button>
        ))}
      </div>

      {mutationError && <ErrorState message={mutationError.message} />}

      <QueryState
        query={tickets}
        loadingLabel="Loading tickets…"
        isEmpty={(list) => list.length === 0}
        empty={`No ${current.label.toLowerCase()} tickets.`}
      >
        {(list) => (
          <>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Title</th>
                    <th>From</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th className="text-right">Received</th>
                    {role === 'admin' && <th className="text-right">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="ticket-key">{ticket.key}</td>
                      <td>{ticket.title}</td>
                      <td className="muted">{ticket.source === 'manual' ? 'Manual' : ticket.requester.name}</td>
                      <td>
                        <CategoryLabel category={ticket.category} />
                      </td>
                      <td>
                        <PriorityBadge priority={ticket.priority} />
                      </td>
                      <td>
                        {ticket.status === 'new' ? (
                          <Link to="/queue" className="pill pill-draft">
                            AI draft · review
                          </Link>
                        ) : (
                          <select
                            className="status-select"
                            aria-label={`Status of ${ticket.key}`}
                            value={pickerValue(ticket.status)}
                            onChange={(event) =>
                              actions.update.mutate({ id: ticket.id, patch: { status: event.target.value as Status } })
                            }
                          >
                            {GROUP_STATUS_OPTIONS.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        {ticket.status === 'new' ? (
                          <span className="muted">—</span>
                        ) : (
                          <AssigneeSelect ticket={ticket} />
                        )}
                      </td>
                      <td className="text-right muted nowrap">{formatReceived(ticket.receivedAt)}</td>
                      {role === 'admin' && (
                        <td className="text-right">
                          <ConfirmButton
                            className="btn btn-ghost delete-btn"
                            aria-label={`Delete ${ticket.key}`}
                            confirmLabel="Confirm delete"
                            onConfirm={() => actions.remove.mutate(ticket.id)}
                          >
                            Delete
                          </ConfirmButton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          </>
        )}
      </QueryState>
    </Card>
  );
}
