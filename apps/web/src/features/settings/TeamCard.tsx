import { InviteBody, type Member, type Organisation, type Role } from '@triago/shared';
import { useState, type FormEvent } from 'react';
import { useInvitations, useTeamActions } from '../../api/queries';
import { Card } from '../../components/Card';
import { ConfirmButton } from '../../components/ConfirmButton';
import { ErrorState } from '../../components/QueryState';
import { useAuth, useProfile } from '../auth/context';

const ROLE_HELP: Record<Role, string> = {
  admin: 'Manages settings, Gmail and the team, and can delete tickets.',
  agent: 'Works tickets: triage, status, notes and files.'
};

/** Members and invitations. Admins invite, change roles and remove; everyone can leave. */
export function TeamCard({ org, members }: { org: Organisation; members: Member[] }) {
  const { user, role: myRole } = useProfile();
  const { logout } = useAuth();
  const isAdmin = myRole === 'admin';
  const invitations = useInvitations(isAdmin);
  const actions = useTeamActions();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [emailError, setEmailError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const sorted = [...members].sort(
    (a, b) => Number(b.id === user.id) - Number(a.id === user.id) || a.name.localeCompare(b.name)
  );
  const adminCount = members.filter((m) => m.role === 'admin').length;
  const error = actions.setRole.error ?? actions.remove.error ?? actions.revoke.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = InviteBody.safeParse({ email, role });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Check the email address.');
      return;
    }
    actions.invite.mutate(parsed.data, {
      onSuccess: () => {
        setSentTo(parsed.data.email);
        setEmail('');
      },
      onError: (failure) => setEmailError(failure.message)
    });
  };

  return (
    <Card className="account-card team-card">
      <div className="account-card-inner">
        <div className="section-head">
          <div>
            <h3>Team</h3>
            <span className="stat-note">
              {members.length} member{members.length === 1 ? '' : 's'} in {org.name}
            </span>
          </div>
        </div>

        {isAdmin &&
          (org.isDemo ? (
            <p className="helper-line">Invitations are turned off in the demo.</p>
          ) : (
            <form className="invite-form" onSubmit={submit} noValidate>
              <div className="form-field invite-email">
                <label className="form-label" htmlFor="invite-email">
                  Invite by email
                </label>
                <input
                  id="invite-email"
                  className="input"
                  type="email"
                  autoComplete="off"
                  placeholder="teammate@company.com"
                  value={email}
                  aria-invalid={emailError ? true : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailError('');
                    setSentTo('');
                  }}
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="invite-role">
                  Role
                </label>
                <select
                  id="invite-role"
                  className="input"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" disabled={actions.invite.isPending}>
                {actions.invite.isPending ? 'Sending…' : 'Send invite'}
              </button>
              <span className="helper-line invite-help">{ROLE_HELP[role]}</span>
              {emailError && (
                <span className="field-error invite-help" role="alert">
                  {emailError}
                </span>
              )}
              {sentTo && (
                <span className="success-box invite-help" role="status">
                  Invitation sent to {sentTo}. The link works for 7 days.
                </span>
              )}
            </form>
          ))}

        {isAdmin && invitations.data && invitations.data.length > 0 && (
          <div className="team-section">
            <span className="mini-label">Pending invitations</span>
            <ul className="team-list">
              {invitations.data.map((invitation) => (
                <li key={invitation.id} className="team-row">
                  <span className="team-avatar is-pending" aria-hidden="true">
                    @
                  </span>
                  <span className="team-who">
                    <strong>{invitation.email}</strong>
                    <span>
                      {invitation.role === 'admin' ? 'Admin' : 'Agent'} · expires{' '}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  </span>
                  <ConfirmButton
                    className="link-btn"
                    aria-label={`Revoke invitation for ${invitation.email}`}
                    confirmLabel="Confirm revoke"
                    onConfirm={() => actions.revoke.mutate(invitation.id)}
                  >
                    Revoke
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="team-section">
          <span className="mini-label">Members</span>
          <ul className="team-list">
            {sorted.map((member) => {
              const isMe = member.id === user.id;
              const lastAdmin = member.role === 'admin' && adminCount === 1;
              return (
                <li key={member.id} className="team-row">
                  <span className="team-avatar" aria-hidden="true">
                    {member.name
                      .split(/\s+/)
                      .map((word) => word[0] ?? '')
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="team-who">
                    <strong>
                      {member.name}
                      {isMe && ' (you)'}
                    </strong>
                    <span>{member.email}</span>
                  </span>
                  {isAdmin ? (
                    <select
                      className="status-select team-role"
                      aria-label={`Role of ${member.name}`}
                      value={member.role}
                      disabled={actions.setRole.isPending || lastAdmin}
                      title={lastAdmin ? 'The only admin; make someone else admin first' : undefined}
                      onChange={(event) =>
                        actions.setRole.mutate({ userId: member.id, role: event.target.value as Role })
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="agent">Agent</option>
                    </select>
                  ) : (
                    <span className="team-role-label">{member.role === 'admin' ? 'Admin' : 'Agent'}</span>
                  )}
                  {(isAdmin || isMe) && !lastAdmin ? (
                    <ConfirmButton
                      className="link-btn"
                      aria-label={isMe ? 'Leave organisation' : `Remove ${member.name}`}
                      confirmLabel={isMe ? 'Confirm leave' : 'Confirm remove'}
                      onConfirm={() =>
                        actions.remove.mutate(member.id, { onSuccess: () => (isMe ? void logout() : undefined) })
                      }
                    >
                      {isMe ? 'Leave' : 'Remove'}
                    </ConfirmButton>
                  ) : (
                    <span className="team-spacer" />
                  )}
                </li>
              );
            })}
          </ul>
          <span className="helper-line">
            Removing someone ends their access at once and unassigns their tickets here.
          </span>
        </div>

        {error && <ErrorState message={error.message} />}
      </div>
    </Card>
  );
}
