import type { Category, Priority, Ticket } from '@triago/shared';
import { useState } from 'react';
import { useTicket, useTicketActions } from '../../api/queries';
import { Avatar, CategoryIcon, PriorityIcon } from '../../components/Icons';
import { Markdown } from '../../components/Markdown';
import { ErrorState } from '../../components/QueryState';
import { RichTextEditor } from '../../components/RichTextEditor';
import { CATEGORY_OPTIONS, MANUAL_TRIAGE, PRIORITY_OPTIONS, percent } from '../../lib/labels';
import { useProfile } from '../auth/context';
import { ActivityTimeline } from './ActivityTimeline';
import { AssigneeSelect } from './AssigneeSelect';
import { AttachmentsPanel } from './AttachmentsPanel';
import { GrammarButton } from './GrammarButton';
import { LinksEditor } from './LinksEditor';
import { NotesPanel } from './NotesPanel';
import { StatusSelect } from './StatusSelect';

/** A ticket laid out like an issue view: the work on the left, the details on the right. */
export function TicketDetail({ ticket }: { ticket: Ticket }) {
  const detail = useTicket(ticket.id);
  const sourceEmail = detail.data?.messages.find((message) => message.kind === 'inbound');
  const notes = detail.data?.messages.filter((message) => message.kind === 'note') ?? [];
  const isDraft = ticket.status === 'new' && ticket.source === 'email';

  return (
    <article className="issue detail-panel">
      <div className="issue-grid">
        <div className="issue-head">
          <div className="issue-key-row">
            <CategoryIcon category={ticket.category} />
            <span className="ticket-key">{ticket.key}</span>
          </div>
          <EditableTitle ticket={ticket} />
          {ticket.manualTriage && (
            <div className={`triage-note triage-${ticket.manualTriage}`} role="note">
              <strong>{MANUAL_TRIAGE[ticket.manualTriage].label}</strong> {MANUAL_TRIAGE[ticket.manualTriage].note}
            </div>
          )}
        </div>

        <div className="issue-main">
          {detail.isError && <ErrorState message={detail.error.message} onRetry={() => detail.refetch()} />}

          {ticket.source === 'email' && (
            <section className="issue-section">
              <h4>
                Email from {ticket.requester.name || ticket.requester.email}
                {ticket.requester.email && ticket.requester.name && (
                  <span className="muted"> &lt;{ticket.requester.email}&gt;</span>
                )}
              </h4>
              {detail.isPending ? (
                <div className="state-box" role="status">
                  Loading email…
                </div>
              ) : (
                sourceEmail && <div className="email-body">{sourceEmail.body}</div>
              )}
            </section>
          )}

          {isDraft ? <DraftEditor ticket={ticket} /> : <DescriptionSection ticket={ticket} />}

          <LinksPanel ticket={ticket} />
          {detail.data && <AttachmentsPanel ticketId={ticket.id} attachments={detail.data.attachments} />}
          {detail.data && <NotesPanel ticketId={ticket.id} notes={notes} />}
          <ActivityTimeline ticketId={ticket.id} />
        </div>

        <aside className="issue-aside" aria-label="Details">
          <StatusSelect ticket={ticket} className="lozenge-large" />
          <DetailsBox ticket={ticket} />
        </aside>
      </div>
    </article>
  );
}

/** The title as a heading; click it (or the pencil) to edit in place. */
function EditableTitle({ ticket }: { ticket: Ticket }) {
  const { update } = useTicketActions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ticket.title);

  const save = () => {
    const title = value.trim();
    if (!title || title === ticket.title) {
      setEditing(false);
      setValue(ticket.title);
      return;
    }
    update.mutate({ id: ticket.id, patch: { title } }, { onSuccess: () => setEditing(false) });
  };

  if (!editing) {
    return (
      <h2 className="issue-title">
        <button
          type="button"
          className="issue-title-btn"
          title="Edit title"
          onClick={() => {
            setValue(ticket.title);
            setEditing(true);
          }}
        >
          {ticket.title}
        </button>
      </h2>
    );
  }
  return (
    <div className="issue-title-edit">
      <label className="visually-hidden" htmlFor={`title-${ticket.id}`}>
        Title
      </label>
      <input
        id={`title-${ticket.id}`}
        className="input issue-title-input"
        value={value}
        maxLength={200}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
          if (event.key === 'Escape') setEditing(false);
        }}
      />
      <div className="edit-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={update.isPending}>
          Save
        </button>
        <button type="button" className="btn btn-subtle" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {update.error && <ErrorState message={update.error.message} />}
    </div>
  );
}

/** The description, shown formatted; Edit opens the rich editor. */
function DescriptionSection({ ticket }: { ticket: Ticket }) {
  const { update } = useTicketActions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ticket.summary);

  return (
    <section className="issue-section">
      <div className="detail-section-head">
        <h4 id={`desc-${ticket.id}`}>Description</h4>
        {!editing && (
          <button
            type="button"
            className="btn btn-subtle btn-small"
            onClick={() => {
              setValue(ticket.summary);
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <>
          <RichTextEditor value={value} onChange={setValue} labelledBy={`desc-${ticket.id}`} />
          <div className="edit-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({ id: ticket.id, patch: { summary: value } }, { onSuccess: () => setEditing(false) })
              }
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-subtle" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <GrammarButton value={value} onChange={setValue} />
          </div>
          {update.error && <ErrorState message={update.error.message} />}
        </>
      ) : ticket.summary.trim() ? (
        <Markdown source={ticket.summary} className="issue-description" />
      ) : (
        <button type="button" className="description-empty" onClick={() => setEditing(true)}>
          Add a description…
        </button>
      )}
    </section>
  );
}

/** Assignee, reporter, priority, type, source and dates. */
function DetailsBox({ ticket }: { ticket: Ticket }) {
  const { update } = useTicketActions();
  const me = useProfile().user.id;

  return (
    <div className="details-box">
      <h4>Details</h4>
      <dl className="details-list">
        <dt>Assignee</dt>
        <dd>
          <AssigneeSelect ticket={ticket} className="input details-select" />
          {ticket.assignee?.id !== me && (
            <button
              type="button"
              className="link-btn link-blue"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: ticket.id, patch: { assigneeId: me } })}
            >
              Assign to me
            </button>
          )}
        </dd>

        <dt>Reporter</dt>
        <dd>
          {ticket.reporter ? (
            <span className="cell-person" title={ticket.reporter.email ?? undefined}>
              <Avatar name={ticket.reporter.name} />
              {ticket.reporter.name}
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </dd>

        <dt>Priority</dt>
        <dd>
          <span className="icon-select">
            <span className="icon-select-icon">
              <PriorityIcon priority={ticket.priority} />
            </span>
            <select
              className="input details-select"
              aria-label="Priority"
              value={ticket.priority}
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate({ id: ticket.id, patch: { priority: event.target.value as Priority } })
              }
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </dd>

        <dt>Type</dt>
        <dd>
          <span className="icon-select">
            <span className="icon-select-icon">
              <CategoryIcon category={ticket.category} />
            </span>
            <select
              className="input details-select"
              aria-label="Type"
              value={ticket.category}
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate({ id: ticket.id, patch: { category: event.target.value as Category } })
              }
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </dd>

        <dt>Source</dt>
        <dd>{ticket.source === 'email' ? 'Email' : 'Created in Triago'}</dd>

        <dt>Created</dt>
        <dd>{new Date(ticket.receivedAt).toLocaleString()}</dd>

        <dt>Updated</dt>
        <dd>{new Date(ticket.updatedAt).toLocaleString()}</dd>
      </dl>
      {update.error && <ErrorState message={update.error.message} />}
    </div>
  );
}

/**
 * The AI's draft: title and description are editable here before the agent accepts it.
 * Type and priority live in the Details panel, so there is one place to change each.
 */
function DraftEditor({ ticket }: { ticket: Ticket }) {
  const { accept, dismiss } = useTicketActions();
  const [draft, setDraft] = useState({ title: ticket.title, summary: ticket.summary });
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const error = accept.error ?? dismiss.error;

  return (
    <section className="issue-section ticket-draft" aria-labelledby={`draft-${ticket.id}`}>
      <div className="draft-head">
        <h4 id={`draft-${ticket.id}`}>AI draft</h4>
        {ticket.aiConfidence !== null && (
          <span className="draft-confidence" title="How sure the AI was about type and priority">
            {percent(ticket.aiConfidence)} confident
          </span>
        )}
      </div>
      <label className="draft-field">
        <span className="mini-label">Title</span>
        <input className="input" value={draft.title} onChange={(event) => set({ title: event.target.value })} />
      </label>
      <div className="draft-field">
        <label className="mini-label" htmlFor={`summary-${ticket.id}`}>
          Description
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

      {error && <div className="alert-box">{error.message}</div>}

      <div className="draft-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!draft.title.trim() || accept.isPending}
          onClick={() => accept.mutate({ id: ticket.id, edits: { ...draft, title: draft.title.trim() } })}
        >
          Accept and start progress
        </button>
        <button
          type="button"
          className="btn btn-subtle"
          disabled={dismiss.isPending}
          title="Close without working on it, e.g. spam or a duplicate"
          onClick={() => dismiss.mutate(ticket.id)}
        >
          Close
        </button>
      </div>
    </section>
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
