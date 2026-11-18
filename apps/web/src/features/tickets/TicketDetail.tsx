import type { Status, Ticket } from '@triago/shared';
import { useState } from 'react';
import { useTicket, useTicketActions, type TicketEdits } from '../../api/queries';
import { Corners } from '../../components/Card';
import { ErrorState } from '../../components/QueryState';
import { Segmented } from '../../components/Segmented';
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS, percent } from '../../lib/labels';
import { ActivityTimeline } from './ActivityTimeline';
import { AssigneeSelect } from './AssigneeSelect';
import { NotesPanel } from './NotesPanel';

export function TicketDetail({ ticket }: { ticket: Ticket }) {
  const detail = useTicket(ticket.id);
  const sourceEmail = detail.data?.messages.find((message) => message.kind === 'inbound');
  const notes = detail.data?.messages.filter((message) => message.kind === 'note') ?? [];

  return (
    <section className="detail-panel">
      <span className="detail-kicker">{ticket.source === 'email' ? 'Source email' : 'Manual ticket'}</span>
      <h3>{ticket.title}</h3>
      <div className="source-grid">
        <span>From</span>
        <span>
          {ticket.requester.name}
          {ticket.requester.email && ` <${ticket.requester.email}>`}
        </span>
        <span>Received</span>
        <span>{new Date(ticket.receivedAt).toLocaleString()}</span>
      </div>
      {detail.isPending && (
        <div className="state-box" role="status">
          Loading email…
        </div>
      )}
      {detail.isError && <ErrorState message={detail.error.message} onRetry={() => detail.refetch()} />}
      {sourceEmail && <div className="email-body">{sourceEmail.body}</div>}

      {ticket.status === 'new' ? <DraftEditor ticket={ticket} /> : <TriageOutcome ticket={ticket} />}

      {detail.data && <NotesPanel ticketId={ticket.id} notes={notes} />}
      <ActivityTimeline ticketId={ticket.id} />
    </section>
  );
}

/** The AI's draft, editable before the agent accepts it. */
function DraftEditor({ ticket }: { ticket: Ticket }) {
  const { accept, dismiss } = useTicketActions();
  const [draft, setDraft] = useState<Required<TicketEdits>>({
    title: ticket.title,
    summary: ticket.summary,
    category: ticket.category,
    priority: ticket.priority
  });
  const set = (patch: TicketEdits) => setDraft((current) => ({ ...current, ...patch }));
  const error = accept.error ?? dismiss.error;

  return (
    <div className="ticket-draft">
      <div className="draft-split">
        <label className="draft-field">
          <span className="mini-label">Title</span>
          <input className="input" value={draft.title} onChange={(event) => set({ title: event.target.value })} />
        </label>
        <div className="draft-field confidence-box">
          <span className="mini-label">AI confidence</span>
          <span className="confidence-score">{ticket.aiConfidence === null ? '—' : percent(ticket.aiConfidence)}</span>
        </div>
      </div>

      <label className="draft-field">
        <span className="mini-label">Summary</span>
        <textarea
          className="input textarea-input"
          value={draft.summary}
          onChange={(event) => set({ summary: event.target.value })}
        />
      </label>

      <div className="draft-field">
        <span className="mini-label">Category</span>
        <Segmented
          label="Category"
          options={CATEGORY_OPTIONS}
          value={draft.category}
          onChange={(category) => set({ category })}
        />
      </div>

      <div className="draft-field">
        <span className="mini-label">Priority</span>
        <Segmented
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={draft.priority}
          onChange={(priority) => set({ priority })}
        />
      </div>

      {error && <div className="alert-box">{error.message}</div>}

      <div className="draft-actions">
        <button
          type="button"
          className="btn btn-primary blueprint"
          disabled={!draft.title.trim() || accept.isPending}
          onClick={() => accept.mutate({ id: ticket.id, edits: { ...draft, title: draft.title.trim() } })}
        >
          <Corners />
          Accept as {ticket.key}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate(ticket.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function TriageOutcome({ ticket }: { ticket: Ticket }) {
  const { returnToQueue, update } = useTicketActions();
  const dismissed = ticket.status === 'dismissed';
  const canUndo = dismissed || ticket.status === 'open';

  return (
    <div className="done-box">
      <span className="done-kicker">{dismissed ? 'Dismissed' : `Accepted · ${ticket.key}`}</span>
      <span className="done-title">{ticket.title}</span>
      {dismissed ? (
        <span className="done-note">No ticket was filed. The email stays in the mailbox untouched.</span>
      ) : (
        <div className="ticket-controls">
          <label className="draft-field">
            <span className="mini-label">Status</span>
            <select
              className="status-select"
              value={ticket.status}
              disabled={update.isPending}
              onChange={(event) => update.mutate({ id: ticket.id, patch: { status: event.target.value as Status } })}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <div className="draft-field">
            <span className="mini-label">Assignee</span>
            <AssigneeSelect ticket={ticket} />
          </div>
        </div>
      )}
      {update.error && <ErrorState message={update.error.message} />}
      {returnToQueue.error && <ErrorState message={returnToQueue.error.message} />}
      {canUndo && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={returnToQueue.isPending}
          onClick={() => returnToQueue.mutate(ticket.id)}
        >
          Move back to pending
        </button>
      )}
    </div>
  );
}
