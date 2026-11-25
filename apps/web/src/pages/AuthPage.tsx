import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Card, Corners } from '../components/Card';
import { SpaceBackground } from '../components/SpaceBackground';
import { AuthForm } from '../features/auth/AuthForm';
import { EmailToTicketDemo } from '../features/auth/EmailToTicketDemo';
import { useAuth } from '../features/auth/context';
import { InviteForm } from '../features/auth/InviteForm';
import { ForgotPasswordForm, ResetPasswordForm } from '../features/auth/PasswordResetForms';

const STEPS = [
  { name: 'Create workspace', line: "Sign up and name your team's helpdesk." },
  { name: 'Import email', line: 'Connect Gmail or forward mail to your Triago address.' },
  { name: 'AI drafts', line: 'Each email becomes a ticket with a title, type and priority.' },
  { name: 'You approve', line: 'Accept, edit or close each draft, then reply from the ticket.' }
];

/** The signed-out pages share the starry hero on the left; the right side changes. */
function AuthShell({ children, nav, aside }: { children: ReactNode; nav?: ReactNode; aside?: ReactNode }) {
  return (
    <div className={`page-shell auth-space ${aside ? 'is-landing' : ''}`} data-theme="dark">
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
          <ol className="step-grid">
            {STEPS.map((step, index) => (
              <li key={step.name} className="step-card">
                <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="step-name">{step.name}</span>
                <span className="step-line">{step.line}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="register-panel">
          {aside}
          {children}
        </div>
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
      aside={<EmailToTicketDemo />}
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
        <button type="button" className="btn btn-outline btn-block" disabled={busy} onClick={tryDemo}>
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
