import type { SettableStatus } from '@triago/shared';
import { useMutationState } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TRIAGE_MUTATION_KEY, useOrg, useStats, useSyncInbox, useTicketPages } from '../api/queries';
import { ErrorState, QueryState } from '../components/QueryState';
import { Segmented } from '../components/Segmented';
import { QueueRow } from '../features/tickets/QueueRow';
import { TicketDetail } from '../features/tickets/TicketDetail';
import { STATUS_COLUMNS } from '../lib/labels';
import { useDebouncedValue } from '../lib/useDebouncedValue';

const isColumn = (value: string | null): value is SettableStatus => STATUS_COLUMNS.some((c) => c.value === value);

export function QueuePage() {
  // The status tab and the open ticket live in the URL, so other pages can link straight to a ticket.
  const [params, setParams] = useSearchParams();
  const view: SettableStatus = isColumn(params.get('status')) ? (params.get('status') as SettableStatus) : 'new';
  const selectedId = params.get('ticket');
  const select = (next: { status?: SettableStatus; ticket?: string | null }) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next.status) updated.set('status', next.status);
        if (next.ticket === null) updated.delete('ticket');
        else if (next.ticket) updated.set('ticket', next.ticket);
        return updated;
      },
      { replace: true }
    );
  const setView = (status: SettableStatus) => select({ status, ticket: null });
  const setSelectedId = (ticket: string) => select({ ticket });
  const column = STATUS_COLUMNS.find((c) => c.value === view)!;
  // On narrow screens the list and the detail take turns; this is true while the detail is showing.
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Query the API once typing pauses, not on every keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);
  const org = useOrg().data?.org;
  // While Gmail feeds this organisation, refresh the New tab now and then; the server syncs in the background.
  const gmailEmail = org?.gmail.email ?? null;
  const poll = gmailEmail && view === 'new' ? 30_000 : false;
  const ticketsQuery = useTicketPages(column.statuses, 'received', { q: debouncedSearch }, poll);
  const searching = debouncedSearch.trim() !== '';
  const triageError = useLatestTriageError();
  const tickets = ticketsQuery.data ?? [];
  const stats = useStats('week', poll).data;
  const countOf = (statuses: readonly string[]) =>
    statuses.reduce((sum, status) => sum + (stats?.byStatus[status as SettableStatus] ?? 0), 0);
  const label = org?.settings.mailboxLabel ?? 'support';
  const sync = useSyncInbox();

  // Keep the selection on screen: fall back to the first ticket in the view.
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0] ?? null;

  // With Gmail connected the button checks the mailbox now; without it, it imports from a sample mailbox.
  const sampleEmpty = !gmailEmail && sync.data?.source === 'sample' && sync.data.remaining === 0;
  const syncLabel = sync.isPending
    ? 'Checking…'
    : gmailEmail
      ? 'Check Gmail'
      : sampleEmpty
        ? 'Sample inbox empty'
        : 'Pull sample email';
  const syncNote =
    sync.data && !sync.isPending
      ? sync.data.importedCount === 0
        ? 'No new mail.'
        : `Imported ${sync.data.importedCount} email${sync.data.importedCount === 1 ? '' : 's'}${
            sync.data.remaining > 0 ? `; ${sync.data.remaining} more on the next check` : ''
          }.`
      : '';

  return (
    <div className={`queue-shell ${detailOpen ? 'detail-open' : ''}`}>
      <aside className="queue-list-panel">
        <div className="queue-toolbar">
          <div className="queue-header-row">
            <h2>Queue</h2>
            {gmailEmail && (
              <span className="watch-flag" title={`Watching ${gmailEmail}`}>
                #{label}
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={sync.isPending || sampleEmpty}
              title={
                gmailEmail
                  ? `Imports new mail from ${gmailEmail} now. It also checks every two minutes.`
                  : 'Imports the next email from a sample mailbox. Connect Gmail in Settings for real mail.'
              }
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: ({ imported }) => {
                    if (imported) {
                      select({ status: 'new', ticket: imported.id });
                      setDetailOpen(true);
                    }
                  }
                })
              }
            >
              {syncLabel}
            </button>
          </div>
          {syncNote && (
            <span className="sync-note" role="status">
              {syncNote}
            </span>
          )}
          {sync.error && <ErrorState message={sync.error.message} />}
          {triageError && <ErrorState message={`The ticket is back in New. ${triageError}`} />}
          <label className="visually-hidden" htmlFor="queue-search">
            Search tickets
          </label>
          <input
            id="queue-search"
            type="search"
            className="input"
            placeholder="Search title, summary or requester"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Segmented
            label="Status"
            value={view}
            onChange={setView}
            options={STATUS_COLUMNS.map((c) => ({
              value: c.value,
              label: stats ? `${c.label} ${countOf(c.statuses)}` : c.label
            }))}
          />
        </div>

        <div className="queue-items" aria-busy={ticketsQuery.isFetching && !ticketsQuery.isFetchingNextPage}>
          <QueryState
            query={ticketsQuery}
            loadingLabel="Loading queue…"
            isEmpty={(list) => list.length === 0}
            empty={
              searching ? (
                <>
                  <div className="queue-empty-title">No matches</div>
                  Nothing in this view matches “{debouncedSearch.trim()}”.
                </>
              ) : (
                <>
                  <div className="queue-empty-title">Nothing here</div>
                  {view === 'new'
                    ? gmailEmail
                      ? 'New mail in the watched Gmail label lands here.'
                      : 'New tickets and imported email land here.'
                    : `No tickets are ${column.label.toLowerCase()}.`}
                </>
              )
            }
          >
            {(list) =>
              list.map((ticket) => (
                <QueueRow
                  key={ticket.id}
                  ticket={ticket}
                  active={ticket.id === selected?.id}
                  onSelect={() => {
                    setSelectedId(ticket.id);
                    setDetailOpen(true);
                  }}
                />
              ))
            }
          </QueryState>
          {ticketsQuery.hasNextPage && (
            <button
              type="button"
              className="btn btn-ghost load-more"
              disabled={ticketsQuery.isFetchingNextPage}
              onClick={() => ticketsQuery.fetchNextPage()}
            >
              {ticketsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </aside>

      {selected && (
        <main className="queue-detail-panel">
          <button type="button" className="btn btn-ghost mobile-only back-btn" onClick={() => setDetailOpen(false)}>
            ← Back to queue
          </button>
          <TicketDetail key={selected.id} ticket={selected} />
        </main>
      )}
    </div>
  );
}

/**
 * Accept and dismiss remove the row before the server answers, so the row's
 * own error message would vanish with it. Show the latest failure here instead.
 */
function useLatestTriageError(): string | null {
  const latest = useMutationState({
    filters: { mutationKey: TRIAGE_MUTATION_KEY },
    select: (mutation) => ({ status: mutation.state.status, error: mutation.state.error?.message ?? null })
  }).at(-1);
  return latest?.status === 'error' ? latest.error : null;
}
