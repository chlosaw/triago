import { useId } from 'react';
import { useOrg, useTicketEvents } from '../../api/queries';
import { QueryState } from '../../components/QueryState';
import { describeEvent } from './describeEvent';

/** Who did what to a ticket, oldest first. */
export function ActivityTimeline({ ticketId }: { ticketId: string }) {
  const events = useTicketEvents(ticketId);
  const members = useOrg().data?.members ?? [];
  const headingId = useId();

  return (
    <section className="activity-panel" aria-labelledby={headingId}>
      <h4 id={headingId} className="detail-kicker">
        Activity
      </h4>
      <QueryState
        query={events}
        loadingLabel="Loading activity…"
        isEmpty={(list) => list.length === 0}
        empty="No activity yet."
      >
        {(list) => (
          <ol className="timeline">
            {list.map((event) => (
              <li key={event.id} className="timeline-item">
                <span className="timeline-text">
                  <strong>{event.actor ?? 'Triago'}</strong> {describeEvent(event, members)}
                </span>
                <time className="timeline-time" dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </section>
  );
}
