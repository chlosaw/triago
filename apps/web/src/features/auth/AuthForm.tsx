import { LoginBody, RegisterBody } from '@triago/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { Card, Corners } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { useAuth } from './context';

const STRENGTH = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

type Form = { name: string; email: string; organisation: string; password: string };
type FieldErrors = Partial<Record<keyof Form, string>>;

/** Runs the same zod schema the API uses, so messages match the server's. */
function validate(form: Form, isRegister: boolean): FieldErrors {
  const result = (isRegister ? RegisterBody : LoginBody).safeParse(form);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof Form;
    errors[field] ??= issue.message;
  }
  return errors;
}

function passwordStrength(password: string): number {
  return [
    password.length >= 10,
    /[A-Z]/.test(password) && /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ].filter(Boolean).length;
}

export function AuthForm({ mode }: { mode: 'register' | 'login' }) {
  const { login, register, startDemo } = useAuth();
  const [form, setForm] = useState<Form>({ name: '', email: '', organisation: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  const strength = passwordStrength(form.password);

  const field = (key: keyof Form) => ({
    value: form[key],
    error: fieldErrors[key],
    onChange: (event: { target: { value: string } }) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  });

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setFieldErrors(err.fields as FieldErrors);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors = validate(form, isRegister);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    run(() => (isRegister ? register(form) : login(form.email, form.password)));
  }

  return (
    <Card className="form-card">
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="form-heading">
          <h2>{isRegister ? 'Create your workspace' : 'Sign in'}</h2>
          <span>{isRegister ? 'You become its admin.' : 'Welcome back.'}</span>
        </div>

        <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => run(startDemo)}>
          Try the demo, no sign-up
        </button>

        <div className="divider">
          <i />
          or with email
          <i />
        </div>

        {isRegister && (
          <>
            <TextField label="Full name" autoComplete="name" placeholder="John Doe" {...field('name')} />
            <TextField label="Company" autoComplete="organization" placeholder="Metaverse" {...field('organisation')} />
          </>
        )}

        <TextField label="Email" type="email" autoComplete="email" placeholder="you@company.com" {...field('email')} />

        <TextField
          label="Password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          placeholder={isRegister ? 'At least 10 characters' : ''}
          {...field('password')}
          hint={
            !isRegister ? (
              <Link to="/forgot-password" className="forgot-link">
                Forgot password?
              </Link>
            ) : (
              <>
                <div className="strength-row" aria-hidden>
                  {[0, 1, 2, 3].map((index) => (
                    <i
                      key={index}
                      style={{
                        height: 4,
                        background:
                          index < strength
                            ? strength >= 3
                              ? 'var(--color-accent-700)'
                              : 'var(--color-accent-400)'
                            : 'var(--color-divider)'
                      }}
                    />
                  ))}
                </div>
                {/* The field error already says what is needed, so skip the generic hint then. */}
                {(form.password || !fieldErrors.password) && (
                  <span className="strength-label">
                    {form.password
                      ? STRENGTH[strength]
                      : 'Use 10+ characters with a mix of letters, numbers and symbols.'}
                  </span>
                )}
              </>
            )
          }
        />

        {error && (
          <div className="alert-box" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block blueprint create-btn" disabled={busy}>
          <Corners />
          {isRegister ? 'Create workspace' : 'Sign in'}
        </button>

        <span className="signin-copy">
          {isRegister ? (
            <>
              Already registered? <Link to="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create a workspace</Link>
            </>
          )}
        </span>
      </form>
    </Card>
  );
}
