import { ForgotPasswordBody, ResetPasswordBody } from '@triago/shared';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Card, Corners } from '../../components/Card';
import { TextField } from '../../components/TextField';

/** Step 1: ask for a reset link. The answer is the same whether or not the email has an account. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ForgotPasswordBody.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/password/forgot', { method: 'POST', body: parsed.data });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="form-card">
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="form-heading">
          <h2>Reset your password</h2>
          <span>We'll email you a link to choose a new one.</span>
        </div>
        {sent ? (
          <div className="success-box" role="status">
            If {email.trim()} has a Triago account, a reset link is on its way. It works once, for 30 minutes. Check
            your spam folder if it doesn't arrive.
          </div>
        ) : (
          <>
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              error={error}
              onChange={(event) => {
                setEmail(event.target.value);
                setError('');
              }}
            />
            <button type="submit" className="btn btn-primary btn-block blueprint create-btn" disabled={busy}>
              <Corners />
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}
        <span className="signin-copy">
          Remembered it? <Link to="/login">Sign in</Link>
        </span>
      </form>
    </Card>
  );
}

/** Step 2: the link from the email lands here with ?token=. */
export function ResetPasswordForm() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ResetPasswordBody.safeParse({ token, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setErrors(issue?.path[0] === 'token' ? { form: issue.message } : { password: issue?.message });
      return;
    }
    if (password !== confirm) {
      setErrors({ confirm: "The passwords don't match." });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await api('/auth/password/reset', { method: 'POST', body: parsed.data });
      setDone(true);
    } catch (err) {
      setErrors(
        err instanceof ApiError && err.fields.password
          ? { password: err.fields.password }
          : { form: err instanceof Error ? err.message : 'Something went wrong.' }
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="form-card">
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="form-heading">
          <h2>Choose a new password</h2>
          <span>You'll be signed out everywhere else.</span>
        </div>
        {done ? (
          <>
            <div className="success-box" role="status">
              Your password is changed.
            </div>
            <Link to="/login" className="btn btn-primary btn-block create-btn">
              Sign in
            </Link>
          </>
        ) : !token ? (
          <div className="alert-box" role="alert">
            This page needs the link from the reset email. <Link to="/forgot-password">Ask for a new one</Link>.
          </div>
        ) : (
          <>
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 10 characters"
              value={password}
              error={errors.password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <TextField
              label="Repeat new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              error={errors.confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            {errors.form && (
              <div className="alert-box" role="alert">
                {errors.form} <Link to="/forgot-password">Ask for a new link</Link>.
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-block blueprint create-btn" disabled={busy}>
              <Corners />
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </>
        )}
      </form>
    </Card>
  );
}
