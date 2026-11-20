import type { Priority, Ticket } from '@triago/shared';
import { useState } from 'react';
import { useTicket, useTicketActions, type TicketEdits } from '../../api/queries';
import { Corners } from '../../components/Card';
import { ErrorState } from '../../components/QueryState';
import { Segmented } from '../../components/Segmented';
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS, percent, statusLabel } from '../../lib/labels';
import { ActivityTimeline } from './ActivityTimeline';
import { AssigneeSelect } from './AssigneeSelect';
import { AttachmentsPanel } from './AttachmentsPanel';
import { GrammarButton } from './GrammarButton';
import { LinksEditor } from './LinksEditor';
import { NotesPanel } from './NotesPanel';
import { StatusSelect } from './StatusSelect';

export function TicketDetail({ ticket }: { ticket: Ticket }) {
  const detail = useTicket(ticket.id);
  const sourceEmail = detail.data?.messages.find((message) => message.kind === 'inbound');
  const notes = detail.data?.messages.filter((message) => message.kind === 'note') ?? [];

  return (
    <section className="detail-panel">
      <span className="detail-kicker">{ticket.source === 'email' ? 'Source email' : 'Manual ticket'}</span>
      <h3>{ticket.title}</h3>
      <div className="source-grid">
        {(ticket.requester.name || ticket.requester.email) && (
          <>
            <span>From</span>
            <span>
              {ticket.requester.name}
              {ticket.requester.email && ` <${ticket.requester.email}>`}
            </span>
          </>
        )}
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

      {/* An email the AI drafted waits for review; everything else is worked like any ticket. */}
      {ticket.status === 'new' && ticket.source === 'email' ? (
        <DraftEditor ticket={ticket} />
      ) : (
        <TicketControls ticket={ticket} />
      )}

      <LinksPanel ticket={ticket} />
      {detail.data && <AttachmentsPanel ticketId={ticket.id} attachments={detail.data.attachments} />}
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

      <div className="draft-field">
        <label className="mini-label" htmlFor={`summary-${ticket.id}`}>
          Summary
        </label>
        <textarea
          id={`summary-${ticket.id}`}
          className="input textarea-input"
          value={draft.summary}
          spellCheck
          onChange={(event) => set({ summary: event.target.value })}
        />
        <GrammarButton value={draft.summary} onChange={(summary) => set({ summary })} />
      </div>

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
        <span className="mini-label">Urgency</span>
        <Segmented
          label="Urgency"
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
          Accept · start progress
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={dismiss.isPending}
          title="Close without working on it, e.g. spam or a duplicate"
          onClick={() => dismiss.mutate(ticket.id)}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/** Status, assignee and urgency for a ticket being worked, plus its description. */
function TicketControls({ ticket }: { ticket: Ticket }) {
  const { update } = useTicketActions();

  return (
    <div className="done-box">
      <span className="done-kicker">
        {ticket.key} · {statusLabel(ticket.status)}
        {ticket.status === 'dismissed' && ' (dismissed draft)'}
      </span>
      {ticket.summary && <p className="ticket-description">{ticket.summary}</p>}
      <div className="ticket-controls">
        <label className="draft-field">
          <span className="mini-label">Status</span>
          <StatusSelect ticket={ticket} />
        </label>
        <div className="draft-field">
          <span className="mini-label">Assignee</span>
          <AssigneeSelect ticket={ticket} />
        </div>
        <label className="draft-field">
          <span className="mini-label">Urgency</span>
          <select
            className="status-select"
            value={ticket.priority}
            disabled={update.isPending}
            onChange={(event) => update.mutate({ id: ticket.id, patch: { priority: event.target.value as Priority } })}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {update.error && <ErrorState message={update.error.message} />}
    </div>
  );
}

function LinksPanel({ ticket }: { ticket: Ticket }) {
  const { update } = useTicketActions();
  return (
    <section className="detail-section" aria-labelledby={`links-${ticket.id}`}>
      <div className="detail-section-head">
        <h4 id={`links-${ticket.id}`}>Links</h4>
      </div>
      <LinksEditor
        links={ticket.links}
        disabled={update.isPending}
        onChange={(links) => update.mutate({ id: ticket.id, patch: { links } })}
      />
      {update.error && <ErrorState message={update.error.message} />}
    </section>
  );
}
