import type { Organisation } from '@triago/shared';
import { useState } from 'react';
import { useDeleteOrganisation } from '../../api/queries';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/QueryState';
import { useAuth } from '../auth/context';

/** Deletes the organisation and everything in it. Asks for the name, like deleting a GitHub repository. */
export function DangerZone({ org }: { org: Organisation }) {
  const remove = useDeleteOrganisation();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const matches = name.trim() === org.name.trim();

  return (
    <Card className="account-card danger-card">
      <div className="account-card-inner">
        <div>
          <h3>Delete organisation</h3>
          <p className="helper-line">
            Permanently deletes {org.name}: every ticket, email, note, file and activity entry, the Gmail connection,
            and the accounts of members who don't belong to another organisation. This can't be undone.
          </p>
        </div>
        {!open ? (
          <button type="button" className="btn btn-danger align-start" onClick={() => setOpen(true)}>
            Delete organisation…
          </button>
        ) : (
          <form
            className="danger-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches) remove.mutate(name, { onSuccess: () => void logout() });
            }}
          >
            <label className="form-label" htmlFor="confirm-org-name">
              Type <strong>{org.name}</strong> to confirm
            </label>
            <input
              id="confirm-org-name"
              className="input"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {remove.error && <ErrorState message={remove.error.message} />}
            <div className="gmail-actions">
              <button type="submit" className="btn btn-danger" disabled={!matches || remove.isPending}>
                {remove.isPending ? 'Deleting…' : 'Delete everything'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setOpen(false);
                  setName('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
