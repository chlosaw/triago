import type { Priority, SettableStatus, Status, Ticket } from '@triago/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrg, useTicketActions, useTicketPages } from '../../api/queries';
import { Avatar, CategoryIcon, PriorityIcon } from '../../components/Icons';
import { ErrorState, QueryState } from '../../components/QueryState';
import { CATEGORY_OPTIONS, priorityLabel, STATUS_OPTIONS } from '../../lib/labels';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useProfile } from '../auth/context';
import { TriageBadge } from './TicketBadges';
import { StatusSelect } from './StatusSelect';

const typeLabel = (ticket: Ticket) =>
  CATEGORY_OPTIONS.find((c) => c.value === ticket.category)?.label ?? ticket.category;

/** A list of tickets as a table, with checkboxes for changing many at once. */
export function TicketTable({
  statuses,
  assignee,
  empty
}: {
  statuses: readonly Status[];
  assignee?: 'me';
  empty: string;
}) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const tickets = useTicketPages(statuses, 'received', { q, assignee, limit: 50 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const list = tickets.data ?? [];
  const visibleSelected = list.filter((t) => selected.has(t.id));
  const allChecked = list.length > 0 && visibleSelected.length === list.length;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="ticket-table-wrap">
      <div className="table-toolbar">
        <label className="visually-hidden" htmlFor="ticket-search">
          Search tickets
        </label>
        <input
          id="ticket-search"
          type="search"
          className="input table-search"
          placeholder="Search tickets"
          value={search}
          maxLength={200}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {visibleSelected.length > 0 && <BulkBar tickets={visibleSelected} onDone={() => setSelected(new Set())} />}

      <QueryState
        query={tickets}
        loadingLabel="Loading tickets…"
        isEmpty={(rows) => rows.length === 0}
        empty={q.trim() ? `No tickets match “${q.trim()}”.` : empty}
      >
        {(rows) => (
          <div className="table-scroll">
            <table className="table jira-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      type="checkbox"
                      aria-label="Select all tickets"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((t) => t.id)))}
                    />
                  </th>
                  <th>Type</th>
                  <th>Key</th>
                  <th>Summary</th>
                  <th>Reporter</th>
                  <th>Assignee</th>
                  <th>
                    <span className="visually-hidden">Priority</span>
                    <span aria-hidden="true">P</span>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className={selected.has(ticket.id) ? 'is-selected' : ''}
                    onClick={(event) => {
                      // Clicks on controls inside the row do their own thing.
                      if ((event.target as HTMLElement).closest('input, select, a, button, label')) return;
                      navigate(`/tickets/${ticket.id}`);
                    }}
                  >
                    <td className="col-check">
                      <input
                        type="checkbox"
                        aria-label={`Select ${ticket.key}`}
                        checked={selected.has(ticket.id)}
                        onChange={() => toggle(ticket.id)}
                      />
                    </td>
                    <td>
                      <span className="cell-type" title={typeLabel(ticket)}>
                        <CategoryIcon category={ticket.category} />
                        <span>{typeLabel(ticket)}</span>
                      </span>
                    </td>
                    <td className="nowrap">
                      <Link to={`/tickets/${ticket.id}`} className="ticket-key-link">
                        {ticket.key}
                      </Link>
                    </td>
                    <td className="cell-summary">
                      <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
                      <TriageBadge reason={ticket.manualTriage} />
                    </td>
                    <td>
                      {ticket.reporter ? (
                        <span className="cell-person" title={ticket.reporter.email ?? undefined}>
                          <Avatar name={ticket.reporter.name} />
                          <span>{ticket.reporter.name}</span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {ticket.assignee ? (
                        <span className="cell-person">
                          <Avatar name={ticket.assignee.name} />
                          <span>{ticket.assignee.name}</span>
                        </span>
                      ) : (
                        <span className="cell-person muted">
                          <span className="avatar avatar-empty" aria-hidden="true" />
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td title={priorityLabel(ticket.priority)}>
                      <PriorityIcon priority={ticket.priority} />
                      <span className="visually-hidden">{priorityLabel(ticket.priority)}</span>
                    </td>
                    <td>
                      <StatusSelect ticket={ticket} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      {tickets.hasNextPage && (
        <button
          type="button"
          className="btn btn-subtle load-more"
          disabled={tickets.isFetchingNextPage}
          onClick={() => tickets.fetchNextPage()}
        >
          {tickets.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/** Change status, assignee or urgency of every selected ticket at once. */
function BulkBar({ tickets, onDone }: { tickets: Ticket[]; onDone: () => void }) {
  const { update } = useTicketActions();
  const members = useOrg().data?.members ?? [];
  const me = useProfile().user.id;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = async (patch: { status?: SettableStatus; assigneeId?: string | null; priority?: Priority }) => {
    setBusy(true);
    setError('');
    const results = await Promise.allSettled(tickets.map((t) => update.mutateAsync({ id: t.id, patch })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBusy(false);
    if (failed) setError(`${failed} of ${tickets.length} tickets could not be changed.`);
    else onDone();
  };

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <strong>{tickets.length} selected</strong>
      <select
        className="input bulk-select"
        aria-label="Change status of selected tickets"
        value=""
        disabled={busy}
        onChange={(event) => void apply({ status: event.target.value as SettableStatus })}
      >
        <option value="" disabled>
          Change status…
        </option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        className="input bulk-select"
        aria-label="Assign selected tickets"
        value=""
        disabled={busy}
        onChange={(event) => void apply({ assigneeId: event.target.value === 'none' ? null : event.target.value })}
      >
        <option value="" disabled>
          Assign to…
        </option>
        <option value={me}>Me</option>
        {members
          .filter((m) => m.id !== me)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        <option value="none">Unassigned</option>
      </select>
      <button type="button" className="btn btn-subtle" onClick={onDone} disabled={busy}>
        Clear selection
      </button>
      {busy && <span className="muted">Saving…</span>}
      {error && <ErrorState message={error} />}
    </div>
  );
}
