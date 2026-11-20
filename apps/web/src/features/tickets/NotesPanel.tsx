import { NoteBody, type Message } from '@triago/shared';
import { useId, useState, type FormEvent } from 'react';
import { useNoteActions } from '../../api/queries';
import { GrammarButton } from './GrammarButton';
import { ErrorState } from '../../components/QueryState';
import { useProfile } from '../auth/context';

/** Internal notes on a ticket: only the team sees them. */
export function NotesPanel({ ticketId, notes }: { ticketId: string; notes: Message[] }) {
  const { add } = useNoteActions(ticketId);
  const headingId = useId();

  return (
    <section className="notes-panel" aria-labelledby={headingId}>
      <h4 id={headingId} className="detail-kicker">
        Internal notes {notes.length > 0 && `· ${notes.length}`}
      </h4>
      {notes.length === 0 ? (
        <p className="notes-empty">No notes yet. Notes are only visible to your team.</p>
      ) : (
        <ul className="notes-list">
          {notes.map((note) => (
            <NoteItem key={note.id} ticketId={ticketId} note={note} />
          ))}
        </ul>
      )}
      <NoteForm
        submitLabel="Add note"
        pending={add.isPending}
        serverError={add.error?.message}
        onSubmit={(body, reset) => add.mutate(body, { onSuccess: reset })}
      />
    </section>
  );
}

function NoteItem({ ticketId, note }: { ticketId: string; note: Message }) {
  const profile = useProfile();
  const { edit, remove } = useNoteActions(ticketId);
  const [editing, setEditing] = useState(false);
  const isAuthor = note.authorId === profile.user.id;
  const canDelete = isAuthor || profile.role === 'admin';

  if (editing) {
    return (
      <li className="note-item">
        <NoteForm
          initial={note.body}
          submitLabel="Save"
          pending={edit.isPending}
          serverError={edit.error?.message}
          onCancel={() => setEditing(false)}
          onSubmit={(body) => edit.mutate({ id: note.id, body }, { onSuccess: () => setEditing(false) })}
        />
      </li>
    );
  }

  return (
    <li className="note-item">
      <div className="note-meta">
        <span>{note.fromName || 'Former member'}</span>
        <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time>
        {note.editedAt && <span>(edited)</span>}
      </div>
      <p className="note-body">{note.body}</p>
      {(isAuthor || canDelete) && (
        <div className="note-actions">
          {isAuthor && (
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="link-btn"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm('Delete this note?')) remove.mutate(note.id);
              }}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      )}
      {remove.error && <ErrorState message={remove.error.message} />}
    </li>
  );
}

interface NoteFormProps {
  initial?: string;
  submitLabel: string;
  pending: boolean;
  serverError?: string;
  onSubmit: (body: string, reset: () => void) => void;
  onCancel?: () => void;
}

/** Textarea validated with the same schema the API uses. */
export function NoteForm({ initial = '', submitLabel, pending, serverError, onSubmit, onCancel }: NoteFormProps) {
  const [body, setBody] = useState(initial);
  const [error, setError] = useState('');
  const id = useId();
  const errorId = `${id}-error`;
  const shownError = error || serverError;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = NoteBody.safeParse({ body });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check the note.');
      return;
    }
    setError('');
    onSubmit(result.data.body, () => setBody(''));
  };

  return (
    <form className="note-form" onSubmit={submit} noValidate>
      <label className="visually-hidden" htmlFor={id}>
        {submitLabel === 'Save' ? 'Edit note' : 'New note'}
      </label>
      <textarea
        id={id}
        className="input textarea-input"
        placeholder="Add context for your team…"
        value={body}
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
        <button type="submit" className="btn btn-ghost" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
