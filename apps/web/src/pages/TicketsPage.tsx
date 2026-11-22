import type { Status } from '@triago/shared';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { useProfile } from '../features/auth/context';
import { TicketTable } from '../features/tickets/TicketTable';

const VIEWS = {
  open: { label: 'Open', statuses: ['new', 'open', 'waiting'] },
  closed: { label: 'Closed', statuses: ['closed', 'resolved', 'dismissed'] },
  all: { label: 'All', statuses: ['new', 'open', 'waiting', 'closed', 'resolved', 'dismissed'] }
} satisfies Record<string, { label: string; statuses: Status[] }>;
type View = keyof typeof VIEWS;

/** "All open tickets" and "My tickets": the same table, with or without the assignee filter. */
export function TicketsPage({ mine = false }: { mine?: boolean }) {
  const { org } = useProfile();
  const [view, setView] = useState<View>('open');
  const title = mine
    ? 'My tickets'
    : view === 'open'
      ? 'All open tickets'
      : view === 'closed'
        ? 'Closed tickets'
        : 'All tickets';

  return (
    <div className="screen-page">
      <PageHeader
        crumbs={[{ label: org.name, to: '/' }, { label: mine ? 'My tickets' : 'All tickets' }]}
        title={title}
        actions={
          <Segmented
            label="Which tickets"
            value={view}
            onChange={setView}
            options={(Object.keys(VIEWS) as View[]).map((value) => ({ value, label: VIEWS[value].label }))}
          />
        }
      />
      <TicketTable
        key={`${mine}-${view}`}
        statuses={VIEWS[view].statuses}
        assignee={mine ? 'me' : undefined}
        empty={mine ? 'Nothing assigned to you here.' : 'No tickets here.'}
      />
    </div>
  );
}
