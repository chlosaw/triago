import { ReplyBody, type Message, type Ticket } from '@triago/shared';
import { useId, useState, type FormEvent } from 'react';
import { useReply, useReplyDraft } from '../../api/queries';
import { Avatar } from '../../components/Icons';
import { formatDateTime, formatRelative } from '../../lib/dates';
import { GrammarButton } from './GrammarButton';

/**
 * The email thread with the customer, oldest first, and under it the next reply:
 * an AI draft the agent approves, edits or discards. Nothing is sent without a click.
 */
export function ConversationPanel({
  ticket,
  messages,
  loading,
  canReply
}: {
  ticket: Ticket;
  /** Inbound and outbound emails only; notes live in their own panel. */
  messages: Message[];
  loading: boolean;
  /** False while the ticket is still an unaccepted draft. */
  canReply: boolean;
}) {
  const headingId = useId();
  const email = ticket.requester.email;

  return (
    <section className="issue-section conversation" aria-labelledby={headingId}>
      <h4 id={headingId}>
        Conversation with {ticket.requester.name || email}
        {email && ticket.requester.name && <span className="muted"> &lt;{email}&gt;</span>}
      </h4>
      {loading ? (
        <div className="state-box" role="status">
          Loading email…
        </div>
      ) : (
        <ol className="thread">
          {messages.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </ol>
      )}
      {!loading && canReply && email && <NextReply ticket={ticket} to={email} messages={messages} />}
      {!loading && !canReply && email && <p className="notes-empty">Accept the draft to reply to the customer.</p>}
    </section>
  );
}

function ThreadMessage({ message }: { message: Message }) {
  const fromCustomer = message.kind === 'inbound';
  const name = message.fromName || (fromCustomer ? message.fromEmail : 'Former member') || 'Unknown sender';
  return (
    <li className={`thread-message ${fromCustomer ? 'is-customer' : 'is-agent'}`}>
      <div className="thread-meta">
        <Avatar name={name} />
        <strong>{name}</strong>
        <span className="muted">{fromCustomer ? 'Customer' : 'Replied by email'}</span>
        <time dateTime={message.createdAt} title={formatRelative(message.createdAt)}>
          {formatDateTime(message.createdAt)}
        </time>
      </div>
      <div className="thread-body">{message.body}</div>
    </li>
  );
}

type Mode = 'suggest' | 'edit' | 'write';

/** The AI's suggested reply, with Approve and send / Edit / Discard, or a blank reply box. */
function NextReply({ ticket, to, messages }: { ticket: Ticket; to: string; messages: Message[] }) {
  const last = messages.at(-1) ?? null;
  // Draft automatically when the customer spoke last and the ticket is still open.
  const awaitingUs = last?.kind === 'inbound' && ticket.status !== 'closed' && ticket.status !== 'dismissed';
  const [asked, setAsked] = useState(false);
  const [mode, setMode] = useState<Mode>('suggest');
  const [notice, setNotice] = useState('');
  const draft = useReplyDraft(ticket.id, last?.id ?? null, awaitingUs || asked);
  const reply = useReply(ticket.id);

  const send = (body: string) => {
    setNotice('');
    reply.mutate(body, {
      onSuccess: ({ sent }) => {
        setMode('suggest');
        setAsked(false);
        setNotice(sent ? `Sent to ${to}.` : 'Saved. In the demo, replies are not emailed to anyone.');
      }
    });
  };

  if (mode !== 'suggest') {
    return (
      <>
        <ReplyForm
          to={to}
          initial={mode === 'edit' ? (draft.data?.body ?? '') : ''}
          pending={reply.isPending}
          serverError={reply.error?.message}
          onSend={send}
          onCancel={() => setMode('suggest')}
        />
      </>
    );
  }

  return (
    <div className="next-reply">
      {notice && (
        <p className="reply-notice" role="status">
          {notice}
        </p>
      )}
      {!draft.isFetching && !draft.data && !draft.isError ? (
        <div className="reply-start">
          <button type="button" className="btn btn-secondary" onClick={() => setAsked(true)}>
            <SparkIcon /> Draft a reply with AI
          </button>
          <button type="button" className="btn btn-subtle" onClick={() => setMode('write')}>
            Write a reply
          </button>
        </div>
      ) : (
        <div className="reply-draft" aria-live="polite" aria-busy={draft.isFetching}>
          <div className="reply-draft-head">
            <span className="reply-draft-label">
              <SparkIcon /> {draft.data?.engine === 'template' ? 'Suggested reply (template)' : 'AI-drafted reply'}
            </span>
            <span className="muted">to {to}</span>
          </div>
          {draft.isFetching ? (
            <p className="reply-draft-body is-loading">The AI is drafting a reply…</p>
          ) : draft.isError ? (
            <p className="reply-draft-body">
              The AI could not draft a reply ({draft.error.message}). Write one yourself.
            </p>
          ) : (
            <>
              {draft.data?.aiFailed && (
                <p className="reply-draft-note">
                  The AI was unavailable, so this is a template. Check it before sending.
                </p>
              )}
              <div className="reply-draft-body">{draft.data?.body}</div>
            </>
          )}
          {reply.error && (
            <span className="field-error" role="alert">
              {reply.error.message}
            </span>
          )}
          <div className="reply-draft-actions">
            {draft.data && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={reply.isPending}
                  onClick={() => send(draft.data.body)}
                >
                  {reply.isPending ? 'Sending…' : 'Approve and send'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setMode('edit')}>
                  Edit
                </button>
              </>
            )}
            {!draft.data && !draft.isFetching && (
              <button type="button" className="btn btn-secondary" onClick={() => setMode('write')}>
                Write a reply
              </button>
            )}
            <button
              type="button"
              className="btn btn-subtle"
              disabled={draft.isFetching}
              onClick={() => setMode('write')}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReplyForm({
  to,
  initial,
  pending,
  serverError,
  onSend,
  onCancel
}: {
  to: string;
  initial: string;
  pending: boolean;
  serverError?: string;
  onSend: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [error, setError] = useState('');
  const id = useId();
  const errorId = `${id}-error`;
  const shownError = error || serverError;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = ReplyBody.safeParse({ body });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check the reply.');
      return;
    }
    setError('');
    onSend(result.data.body);
  };

  return (
    <form className="note-form reply-form" onSubmit={submit} noValidate>
      <label className="mini-label" htmlFor={id}>
        Reply to {to}
      </label>
      <textarea
        id={id}
        className="input textarea-input reply-textarea"
        placeholder="Write to the customer…"
        value={body}
        autoFocus
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? errorId : undefined}
        onChange={(event) => {
          setBody(event.target.value);
          if (error) setError('');
        }}
      />
      <GrammarButton value={body} onChange={setBody} />
      {shownError && (
        <span id={errorId} className="field-error" role="alert">
          {shownError}
        </span>
      )}
      <div className="note-form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Sending…' : 'Send reply'}
        </button>
        <button type="button" className="btn btn-subtle" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="spark-icon">
      <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="currentColor" />
    </svg>
  );
}
