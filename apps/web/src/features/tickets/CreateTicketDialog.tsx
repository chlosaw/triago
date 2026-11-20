import {
  CreateTicketBody,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TICKET,
  type Category,
  type Priority,
  type SettableStatus,
  type Ticket,
  type TicketLink
} from '@triago/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { uploadAttachment, useOrg, useTicketActions } from '../../api/queries';
import { Modal } from '../../components/Modal';
import { CATEGORY_OPTIONS, formatBytes, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../lib/labels';
import { useProfile } from '../auth/context';
import { GrammarButton } from './GrammarButton';
import { LinksEditor } from './LinksEditor';

/** Jira-style "Create ticket" dialog: every field on one form, files uploaded once the ticket exists. */
export function CreateTicketDialog({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated?: (ticket: Ticket) => void;
}) {
  const me = useProfile().user.id;
  const members = useOrg().data?.members ?? [];
  const sortedMembers = [...members].sort(
    (a, b) => Number(b.id === me) - Number(a.id === me) || a.name.localeCompare(b.name)
  );
  const { create } = useTicketActions();
  const queryClient = useQueryClient();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>(me);
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<SettableStatus>('new');
  const [category, setCategory] = useState<Category>('question');
  const [links, setLinks] = useState<TicketLink[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Set once the ticket exists, so a retry after a failed upload doesn't create a second ticket.
  const [created, setCreated] = useState<Ticket | null>(null);
  const busy = create.isPending || uploading !== null;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_BYTES) problems.push(`${file.name} is over 5 MB.`);
      else if (next.length >= MAX_ATTACHMENTS_PER_TICKET)
        problems.push(`Attach at most ${MAX_ATTACHMENTS_PER_TICKET} files.`);
      else next.push(file);
    }
    setFiles(next);
    setErrors((current) => ({ ...current, files: problems.join(' ') }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = CreateTicketBody.safeParse({
      title,
      summary,
      category,
      priority,
      status,
      assigneeId: assigneeId || null,
      links
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});

    let ticket = created;
    if (!ticket) {
      try {
        ticket = (await create.mutateAsync(parsed.data)).ticket;
        setCreated(ticket);
      } catch {
        return; // create.error is shown below.
      }
    }

    // The ticket exists now; upload files one at a time so a failure names the file.
    const failed: string[] = [];
    for (const file of files) {
      setUploading(file.name);
      try {
        await uploadAttachment(ticket.id, file);
      } catch (error) {
        failed.push(`${file.name}: ${(error as Error).message}`);
      }
    }
    setUploading(null);
    if (files.length) await queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });

    if (failed.length) {
      setFiles(files.filter((file) => failed.some((line) => line.startsWith(`${file.name}:`))));
      setErrors({
        files: `${ticket.key} was created, but some files did not upload. ${failed.join(' ')} Retry, or close and add them later.`
      });
      return;
    }
    onCreated?.(ticket);
    onClose();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  return (
    <Modal title="Create ticket" onClose={busy ? () => {} : onClose} className="create-modal">
      <form className="modal-form" onSubmit={submit} noValidate>
        <div className="modal-body">
          <p className="modal-note">
            Required fields are marked with an asterisk <span aria-hidden="true">*</span>
          </p>

          <div className="form-field">
            <label className="form-label" htmlFor={`${id}-title`}>
              Title <span className="required">*</span>
            </label>
            <input
              id={`${id}-title`}
              className="input"
              value={title}
              maxLength={200}
              autoFocus
              spellCheck
              aria-invalid={errors.title ? true : undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
            <GrammarButton value={title} onChange={setTitle} />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor={`${id}-summary`}>
              Description
            </label>
            <textarea
              id={`${id}-summary`}
              className="input textarea-input modal-textarea"
              value={summary}
              maxLength={5000}
              spellCheck
              placeholder="What happened, what's expected, and any steps to reproduce."
              aria-invalid={errors.summary ? true : undefined}
              onChange={(event) => setSummary(event.target.value)}
            />
            <GrammarButton value={summary} onChange={setSummary} />
            {errors.summary && <span className="field-error">{errors.summary}</span>}
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor={`${id}-assignee`}>
                Assignee
              </label>
              <select
                id={`${id}-assignee`}
                className="input"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {sortedMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === me ? `${member.name} (me)` : member.name}
                  </option>
                ))}
              </select>
              {assigneeId !== me && (
                <button type="button" className="link-btn align-start" onClick={() => setAssigneeId(me)}>
                  Assign to me
                </button>
              )}
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor={`${id}-priority`}>
                Urgency
              </label>
              <select
                id={`${id}-priority`}
                className="input"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor={`${id}-status`}>
                Status
              </label>
              <select
                id={`${id}-status`}
                className="input"
                value={status}
                onChange={(event) => setStatus(event.target.value as SettableStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor={`${id}-category`}>
                Type
              </label>
              <select
                id={`${id}-category`}
                className="input"
                value={category}
                onChange={(event) => setCategory(event.target.value as Category)}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <span className="form-label" id={`${id}-files-label`}>
              Attachments
            </span>
            <div
              className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span>Drop files here or</span>
              <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
                browse
              </button>
              <span className="drop-hint">Up to 5 MB each</span>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                aria-labelledby={`${id}-files-label`}
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatBytes(file.size)}</span>
                    {uploading === file.name ? (
                      <span className="file-size">Uploading…</span>
                    ) : (
                      <button
                        type="button"
                        className="link-btn"
                        aria-label={`Remove ${file.name}`}
                        disabled={busy}
                        onClick={() => setFiles(files.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {errors.files && (
              <span className="field-error" role="alert">
                {errors.files}
              </span>
            )}
          </div>

          <div className="form-field">
            <span className="form-label">Links</span>
            <LinksEditor links={links} onChange={setLinks} />
            {errors.links && <span className="field-error">{errors.links}</span>}
          </div>

          {create.error && <div className="alert-box">{create.error.message}</div>}
        </div>

        <footer className="modal-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (created) onCreated?.(created);
              onClose();
            }}
            disabled={busy}
          >
            {created ? 'Close' : 'Cancel'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {create.isPending
              ? 'Creating…'
              : uploading
                ? `Uploading ${uploading}…`
                : created
                  ? 'Retry upload'
                  : 'Create'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
