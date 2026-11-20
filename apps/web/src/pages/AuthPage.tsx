import { Brand } from '../components/Brand';
import { SpaceBackground } from '../components/SpaceBackground';
import { AuthForm } from '../features/auth/AuthForm';
import { ForgotPasswordForm, ResetPasswordForm } from '../features/auth/PasswordResetForms';

const STEPS = ['Create workspace', 'Import email', 'AI drafts', 'You approve'];

export function AuthPage({ mode }: { mode: 'register' | 'login' | 'forgot' | 'reset' }) {
  return (
    <div className="page-shell auth-space">
      <SpaceBackground />
      <div className="register-shell">
        <div className="register-copy">
          <div className="brand-wrap-left">
            <Brand />
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

        <div className="register-panel">
          {mode === 'forgot' ? (
            <ForgotPasswordForm />
          ) : mode === 'reset' ? (
            <ResetPasswordForm />
          ) : (
            <AuthForm mode={mode} />
          )}
        </div>
      </div>
    </div>
  );
}
