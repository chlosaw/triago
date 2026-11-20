import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TICKET, type Attachment } from '@triago/shared';
import { useRef, useState } from 'react';
import { useAttachmentActions } from '../../api/queries';
import { ConfirmButton } from '../../components/ConfirmButton';
import { ErrorState } from '../../components/QueryState';
import { formatBytes } from '../../lib/labels';

export function AttachmentsPanel({ ticketId, attachments }: { ticketId: string; attachments: Attachment[] }) {
  const actions = useAttachmentActions(ticketId);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const full = attachments.length >= MAX_ATTACHMENTS_PER_TICKET;

  const upload = async (files: FileList | null) => {
    setError('');
    for (const file of Array.from(files ?? [])) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} is over 5 MB.`);
        continue;
      }
      try {
        await actions.upload.mutateAsync(file);
      } catch (failure) {
        setError(`${file.name}: ${(failure as Error).message}`);
      }
    }
  };

  return (
    <section className="detail-section" aria-labelledby={`attachments-${ticketId}`}>
      <div className="detail-section-head">
        <h4 id={`attachments-${ticketId}`}>Attachments</h4>
        <button
          type="button"
          className="link-btn"
          disabled={full || actions.upload.isPending}
          onClick={() => input.current?.click()}
        >
          {actions.upload.isPending ? 'Uploading…' : 'Add files'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Add files"
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {attachments.length === 0 ? (
        <p className="notes-empty">No files yet.</p>
      ) : (
        <ul className="file-list">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="file-item">
              <button
                type="button"
                className="file-name file-download"
                onClick={() => actions.download(attachment).catch((failure: Error) => setError(failure.message))}
              >
                {attachment.filename}
              </button>
              <span className="file-size">{formatBytes(attachment.size)}</span>
              <ConfirmButton
                className="link-btn"
                aria-label={`Delete ${attachment.filename}`}
                confirmLabel="Confirm"
                onConfirm={() => actions.remove.mutate(attachment.id)}
              >
                Delete
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
      {(error || actions.remove.error) && <ErrorState message={error || actions.remove.error!.message} />}
    </section>
  );
}
