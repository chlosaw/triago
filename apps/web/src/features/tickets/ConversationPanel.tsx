import { ReplyBody, type Message, type Ticket } from '@triago/shared';
import { useId, useState, type FormEvent } from 'react';
import { useReply } from '../../api/queries';
import { GrammarButton } from './GrammarButton';

/**
 * The email thread after the customer's first message: replies the team sent and
 * anything the customer wrote back, oldest first, with a box to reply.
 */
export function ConversationPanel({ ticket, messages }: { ticket: Ticket; messages: Message[] }) {
  const headingId = useId();
  const email = ticket.requester.email;

  return (
    <section className="notes-panel conversation-panel" aria-labelledby={headingId}>
      <h4 id={headingId} className="detail-kicker">
        Replies {messages.length > 0 && `· ${messages.length}`}
      </h4>
      {messages.length > 0 && (
        <ul className="notes-list">
          {messages.map((message) => (
            <li key={message.id} className={`note-item message-${message.kind}`}>
              <div className="note-meta">
                <span>{message.kind === 'outbound' ? message.fromName || 'Former member' : message.fromName}</span>
                <span>{message.kind === 'outbound' ? `to ${email ?? 'customer'}` : 'customer'}</span>
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
              </div>
              <p className="note-body">{message.body}</p>
            </li>
          ))}
        </ul>
      )}
      {email ? (
        <ReplyForm ticketId={ticket.id} to={email} />
      ) : (
        <p className="notes-empty">This ticket has no customer email address, so there is no one to reply to.</p>
      )}
    </section>
  );
}

function ReplyForm({ ticketId, to }: { ticketId: string; to: string }) {
  const reply = useReply(ticketId);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const id = useId();
  const errorId = `${id}-error`;
  const shownError = error || reply.error?.message;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = ReplyBody.safeParse({ body });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check the reply.');
      return;
    }
    setError('');
    setNotice('');
    reply.mutate(result.data.body, {
      onSuccess: ({ sent }) => {
        setBody('');
        setNotice(sent ? `Sent to ${to}.` : 'Saved. In the demo, replies are not emailed to anyone.');
      }
    });
  };

  return (
    <form className="note-form" onSubmit={submit} noValidate>
      <label className="mini-label" htmlFor={id}>
        Reply to {to}
      </label>
      <textarea
        id={id}
        className="input textarea-input"
        placeholder="Write to the customer…"
        value={body}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? errorId : undefined}
        onChange={(event) => {
          setBody(event.target.value);
          if (error) setError('');
          if (notice) setNotice('');
        }}
      />
      <GrammarButton value={body} onChange={setBody} />
      {shownError && (
        <span id={errorId} className="field-error" role="alert">
          {shownError}
        </span>
      )}
      <div className="note-form-actions">
        <button type="submit" className="btn btn-primary" disabled={reply.isPending}>
          {reply.isPending ? 'Sending…' : 'Send reply'}
        </button>
        {notice && (
          <span className="muted" role="status">
            {notice}
          </span>
        )}
      </div>
    </form>
  );
}
