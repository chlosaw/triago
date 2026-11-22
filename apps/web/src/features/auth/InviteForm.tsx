import type { InvitationPreview } from '@triago/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Card, Corners } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { useAuth } from './context';

/** The page an invitation email links to: create an account (or sign in) and join the organisation. */
export function InviteForm() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { acceptInvite } = useAuth();
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    retry: false
  });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invite = preview.data;
    if (!invite) return;
    const next: typeof errors = {};
    if (!invite.accountExists && !name.trim()) next.name = 'Enter your name.';
    if (!invite.accountExists && password.length < 10) next.password = 'Use at least 10 characters.';
    if (invite.accountExists && !password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await acceptInvite({ token, password, ...(invite.accountExists ? {} : { name: name.trim() }) });
      navigate('/', { replace: true });
    } catch (err) {
      setErrors(
        err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
          ? { password: err.message }
          : err instanceof ApiError && Object.keys(err.fields).length
            ? (err.fields as typeof errors)
            : { form: err instanceof Error ? err.message : 'Something went wrong.' }
      );
    } finally {
      setBusy(false);
    }
  }

  const invite = preview.data;
  return (
    <Card className="form-card">
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {!token || preview.isError ? (
          <>
            <div className="form-heading">
              <h2>Invitation not valid</h2>
              <span>
                {token
                  ? (preview.error?.message ?? 'This invitation has expired, was revoked or was already used.')
                  : 'This page needs the link from your invitation email.'}
              </span>
            </div>
            <span className="signin-copy">
              Ask whoever invited you to send a new one, or <Link to="/login">sign in</Link>.
            </span>
          </>
        ) : !invite ? (
          <div className="state-box" role="status">
            Checking your invitation…
          </div>
        ) : (
          <>
            <div className="form-heading">
              <h2>Join {invite.orgName}</h2>
              <span>
                {invite.invitedBy ? `${invite.invitedBy} invited you` : "You're invited"} as{' '}
                {invite.role === 'admin' ? 'an admin' : 'an agent'}.
              </span>
            </div>
            <TextField label="Email" value={invite.email} readOnly disabled />
            {invite.accountExists ? (
              <TextField
                label="Your Triago password"
                type="password"
                autoComplete="current-password"
                value={password}
                error={errors.password}
                hint={
                  <Link to="/forgot-password" className="forgot-link">
                    Forgot password?
                  </Link>
                }
                onChange={(event) => setPassword(event.target.value)}
              />
            ) : (
              <>
                <TextField
                  label="Full name"
                  autoComplete="name"
                  value={name}
                  error={errors.name}
                  onChange={(event) => setName(event.target.value)}
                />
                <TextField
                  label="Choose a password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 10 characters"
                  value={password}
                  error={errors.password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </>
            )}
            {errors.form && (
              <div className="alert-box" role="alert">
                {errors.form}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-block blueprint create-btn" disabled={busy}>
              <Corners />
              {busy ? 'Joining…' : invite.accountExists ? `Sign in and join` : 'Create account and join'}
            </button>
          </>
        )}
      </form>
    </Card>
  );
}
