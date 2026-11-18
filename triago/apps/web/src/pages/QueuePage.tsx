import { useMutationState } from '@tanstack/react-query';
import { useState } from 'react';
import {
  QUEUE_VIEWS,
  TRIAGE_MUTATION_KEY,
  useOrg,
  useStats,
  useSyncInbox,
  useTicketPages,
  type QueueView
} from '../api/queries';
import { ErrorState, QueryState } from '../components/QueryState';
import { Segmented } from '../components/Segmented';
import { QueueRow } from '../features/tickets/QueueRow';
import { InboundAddress } from '../features/tickets/InboundAddress';
import { TicketDetail } from '../features/tickets/TicketDetail';
import { useDebouncedValue } from '../lib/useDebouncedValue';

export function QueuePage() {
  const [view, setView] = useState<QueueView>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // On narrow screens the list and the detail take turns; this is true while the detail is showing.
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Query the API once typing pauses, not on every keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);
  const org = useOrg().data?.org;
  // While a real inbox feeds this organisation, check the pending queue for new mail every few seconds.
  const poll = org?.inboundAddress && view === 'pending' ? 5_000 : false;
  const ticketsQuery = useTicketPages(QUEUE_VIEWS[view], 'received', debouncedSearch, poll);
  const searching = debouncedSearch.trim() !== '';
  const triageError = useLatestTriageError();
  const tickets = ticketsQuery.data ?? [];
  const pendingCount = useStats('week', poll).data?.awaitingTriage ?? 0;
  const label = org?.settings.mailboxLabel ?? 'support';
  const sync = useSyncInbox();

  // Keep the selection on screen: fall back to the first ticket in the view.
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0] ?? null;

  // Gmail sync is not built yet; the button imports from a fixed sample mailbox.
  const inboxEmpty = sync.data?.remaining === 0;
  const syncLabel = sync.isPending ? 'Syncing…' : inboxEmpty ? 'Sample inbox empty' : 'Pull new mail';

  return (
    <div className={`queue-shell ${detailOpen ? 'detail-open' : ''}`}>
      <aside className="queue-list-panel">
        <div className="queue-toolbar">
          <div className="queue-header-row">
            <h2>Queue</h2>
            <span className="watch-flag">#{label}</span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={sync.isPending || inboxEmpty}
              title="Imports the next email from a sample mailbox. Gmail sync is planned."
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: ({ imported }) => {
                    if (imported) {
                      setView('pending');
                      setSelectedId(imported.id);
                      setDetailOpen(true);
                    }
                  }
                })
              }
            >
              {syncLabel}
            </button>
          </div>
          {org?.inboundAddress && <InboundAddress address={org.inboundAddress} />}
          {sync.error && <ErrorState message={sync.error.message} />}
          {triageError && <ErrorState message={`The ticket is back in the queue. ${triageError}`} />}
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
            label="Queue view"
            value={view}
            onChange={setView}
            options={[
              { value: 'pending', label: `Pending ${pendingCount}` },
              { value: 'accepted', label: 'Accepted' },
              { value: 'dismissed', label: 'Dismissed' }
            ]}
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
                  New mail in the watched label lands in Pending.
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
