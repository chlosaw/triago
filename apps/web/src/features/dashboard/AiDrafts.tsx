import { Link } from 'react-router-dom';
import { useTicketPages } from '../../api/queries';
import { CategoryIcon, PriorityIcon } from '../../components/Icons';
import { formatReceived, percent, priorityLabel } from '../../lib/labels';
import { TriageBadge } from '../tickets/TicketBadges';

const PREVIEW = 3;

/**
 * The top of the dashboard: how many AI drafts wait for a person to approve them,
 * with the oldest few and a way into the queue. "AI suggests, people decide."
 */
export function AiDrafts({ waiting }: { waiting: number }) {
  const drafts = useTicketPages(['new'], 'received', { limit: PREVIEW });
  const list = drafts.data ?? [];

  return (
    <section className="card ai-drafts" aria-labelledby="ai-drafts-heading">
      <div className="ai-drafts-head">
        <div>
          <span className="ai-drafts-kicker">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="currentColor" />
            </svg>
            AI suggests, you decide
          </span>
          <h2 id="ai-drafts-heading" className="ai-drafts-title">
            {waiting === 0 ? (
              'No AI drafts waiting'
            ) : (
              <>
                <span className="ai-drafts-count">{waiting}</span> AI {waiting === 1 ? 'draft' : 'drafts'} waiting for
                approval
              </>
            )}
          </h2>
          <p className="stat-note">
            {waiting === 0
              ? 'New email shows up here as a drafted ticket for you to check.'
              : 'Each email has a suggested title, type and priority. Accept, edit or close each one.'}
          </p>
        </div>
        <Link to="/queue" className="btn btn-primary">
          {waiting === 0 ? 'Open the queue' : 'Review drafts'}
        </Link>
      </div>

      {list.length > 0 && (
        <ul className="ai-drafts-list">
          {list.map((ticket) => (
            <li key={ticket.id}>
              <Link to={`/queue?ticket=${ticket.id}`} className="ai-draft-row">
                <CategoryIcon category={ticket.category} />
                <span className="ai-draft-title">
                  {ticket.title}
                  <TriageBadge reason={ticket.manualTriage} />
                </span>
                <span className="ai-draft-meta" title={priorityLabel(ticket.priority)}>
                  <PriorityIcon priority={ticket.priority} />
                  {priorityLabel(ticket.priority)}
                </span>
                <span className="ai-draft-meta">
                  {ticket.aiConfidence === null ? '—' : `${percent(ticket.aiConfidence)} sure`}
                </span>
                <span className="ai-draft-meta">{formatReceived(ticket.receivedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
