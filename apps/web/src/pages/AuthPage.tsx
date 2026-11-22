import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Card, Corners } from '../components/Card';
import { SpaceBackground } from '../components/SpaceBackground';
import { AuthForm } from '../features/auth/AuthForm';
import { useAuth } from '../features/auth/context';
import { InviteForm } from '../features/auth/InviteForm';
import { ForgotPasswordForm, ResetPasswordForm } from '../features/auth/PasswordResetForms';

const STEPS = ['Create workspace', 'Import email', 'AI drafts', 'You approve'];

/** The signed-out pages share the starry hero on the left; the right side changes. */
function AuthShell({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  return (
    <div className="page-shell auth-space" data-theme="dark">
      <SpaceBackground />
      {nav && <nav className="landing-nav">{nav}</nav>}
      <div className="register-shell">
        <div className="register-copy">
          <div className="brand-wrap-left">
            <Link to="/" className="brand-home" aria-label="Triago home">
              <Brand />
            </Link>
          </div>
          <div className="register-copy-inner">
            <h1>From inbox chaos to structured tickets.</h1>
            <p>
              Triago reads new mail, drafts a ticket for each real request with a category, priority and summary, and
              holds it for your team to approve. The AI suggests; people decide.
            </p>
          </div>
          <div className="step-grid">
            {STEPS.map((step, index) => (
              <div key={step} className={`step-card ${index === 0 ? 'is-current' : ''}`}>
                <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="step-name">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="register-panel">{children}</div>
      </div>
    </div>
  );
}

/** The homepage for signed-out visitors. Registration only opens from "Create workspace". */
export function LandingPage() {
  const { startDemo } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tryDemo = async () => {
    setBusy(true);
    setError('');
    try {
      await startDemo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo. Try again.');
      setBusy(false);
    }
  };

  return (
    <AuthShell
      nav={
        <>
          <Link to="/login" className="landing-link">
            Sign in
          </Link>
          <Link to="/register" className="btn btn-primary">
            Create workspace
          </Link>
        </>
      }
    >
      <Card className="form-card get-started">
        <div className="form-heading">
          <h2>Get started</h2>
          <span>Set up your team's helpdesk in a minute, or look around first.</span>
        </div>
        <Link to="/register" className="btn btn-primary btn-block blueprint create-btn">
          <Corners />
          Create workspace
        </Link>
        <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={tryDemo}>
          {busy ? 'Starting the demo…' : 'Try the demo, no sign-up'}
        </button>
        {error && (
          <div className="alert-box" role="alert">
            {error}
          </div>
        )}
        <span className="signin-copy">
          Already have a workspace? <Link to="/login">Sign in</Link>
        </span>
      </Card>
    </AuthShell>
  );
}

export function AuthPage({ mode }: { mode: 'register' | 'login' | 'forgot' | 'reset' | 'invite' }) {
  return (
    <AuthShell>
      {mode === 'invite' ? (
        <InviteForm />
      ) : mode === 'forgot' ? (
        <ForgotPasswordForm />
      ) : mode === 'reset' ? (
        <ResetPasswordForm />
      ) : (
        <AuthForm mode={mode} />
      )}
    </AuthShell>
  );
}
