import type { Organisation } from '@triago/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGmailActions } from '../../api/queries';
import { ConfirmButton } from '../../components/ConfirmButton';
import { ErrorState } from '../../components/QueryState';

/** Connect, show and disconnect the organisation's Gmail mailbox. */
export function GmailCard({ org, readOnly }: { org: Organisation; readOnly: boolean }) {
  const { connect, disconnect, backfill } = useGmailActions();
  const [params, setParams] = useSearchParams();
  // Google sends the admin back to /settings?gmail=connected|error; show that once, then tidy the URL.
  const [outcome] = useState(() => ({ result: params.get('gmail'), message: params.get('message') }));
  useEffect(() => {
    if (params.has('gmail')) setParams({}, { replace: true });
  }, [params, setParams]);

  const { gmail } = org;
  const label = org.settings.mailboxLabel;

  return (
    <div className="gmail-card">
      <div className="sync-row">
        <div className={`sync-dot ${gmail.email ? 'is-on' : ''}`} />
        <div>
          {gmail.email ? (
            <>
              <strong>Connected to {gmail.email}</strong>
              <span>
                Triago checks {label === 'inbox' ? 'the Inbox' : `the “${label}” label`} every two minutes and drafts a
                ticket in New for each email from the last 7 days.
                {gmail.lastSyncedAt && ` Last checked ${new Date(gmail.lastSyncedAt).toLocaleString()}.`}
              </span>
            </>
          ) : gmail.available ? (
            <>
              <strong>Connect your Gmail</strong>
              <span>
                Sign in with Google and allow read-only access. New mail in the watched label becomes a drafted ticket
                in New. Triago never sends, changes or deletes your email.
              </span>
            </>
          ) : (
            <>
              <strong>Gmail is not set up on this server</strong>
              <span>
                Add a Google OAuth client (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) to the API's environment and
                restart it. docs/gmail.md walks through it. Until then, the queue imports from a sample mailbox.
              </span>
            </>
          )}
        </div>
      </div>

      {outcome.result === 'connected' && gmail.email && (
        <div className="success-box" role="status">
          Gmail connected. New mail will show up in the queue within a couple of minutes.
        </div>
      )}
      {outcome.result === 'error' && <ErrorState message={outcome.message ?? 'Could not connect Gmail.'} />}
      {connect.error && <ErrorState message={connect.error.message} />}
      {disconnect.error && <ErrorState message={disconnect.error.message} />}

      {gmail.available && !readOnly && (
        <div className="gmail-actions">
          {gmail.email ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => connect.mutate()}>
                Switch account
              </button>
              <ConfirmButton
                className="btn btn-ghost"
                confirmLabel="Confirm disconnect"
                onConfirm={() => disconnect.mutate()}
              >
                Disconnect
              </ConfirmButton>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? 'Opening Google…' : 'Connect Gmail'}
            </button>
          )}
        </div>
      )}
      {gmail.email && !readOnly && (
        <div className="backfill-row">
          <span className="mini-label">Import older mail</span>
          <div className="gmail-actions">
            {([30, 90, 365] as const).map((days) => (
              <button
                key={days}
                type="button"
                className="btn btn-secondary"
                disabled={backfill.isPending}
                onClick={() => backfill.mutate(days)}
              >
                Last {days === 365 ? 'year' : `${days} days`}
              </button>
            ))}
          </div>
          <span className="helper-line">
            Runs in the background from the watched label; emails already imported are skipped. Each one gets an AI
            draft, a few at a time.
          </span>
          {backfill.isSuccess && (
            <div className="success-box" role="status">
              Importing the last {backfill.data.days} days. New tickets appear in the queue as they come in.
            </div>
          )}
          {backfill.error && <ErrorState message={backfill.error.message} />}
        </div>
      )}
      {gmail.available && readOnly && !gmail.email && (
        <span className="helper-line">Ask an admin to connect Gmail.</span>
      )}
    </div>
  );
}
