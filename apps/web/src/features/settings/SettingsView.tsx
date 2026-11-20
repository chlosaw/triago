import type { Member, Organisation, OrgSettings } from '@triago/shared';
import { useUpdateSettings } from '../../api/queries';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/QueryState';
import { Segmented } from '../../components/Segmented';
import { Toggle } from '../../components/Toggle';
import { useProfile } from '../auth/context';
import { GmailCard } from './GmailCard';

export function SettingsView({ org, members }: { org: Organisation; members: Member[] }) {
  const { user, role } = useProfile();
  const update = useUpdateSettings();
  const settings = org.settings;
  const readOnly = role !== 'admin';
  const save = (patch: Partial<OrgSettings>) => update.mutate(patch);

  return (
    <div className="account-page">
      <div className="account-left">
        <div className="account-header-row">
          <div>
            <span className="section-kicker">Settings</span>
            <h2>Mail intake</h2>
          </div>
          <span className={`connection-chip ${org.gmail.email ? 'is-on' : ''}`}>
            {org.gmail.email ? 'Gmail connected' : 'Gmail not connected'}
          </span>
        </div>

        <Card className="account-card">
          <div className="account-card-inner">
            <GmailCard org={org} readOnly={readOnly} />

            {readOnly && <div className="alert-box">Only admins can change these settings.</div>}
            {update.error && <ErrorState message={update.error.message} />}

            <div className="setting-block">
              <span className="mini-label">Watched label</span>
              <Segmented
                label="Watched label"
                disabled={readOnly}
                value={settings.mailboxLabel}
                onChange={(mailboxLabel) => save({ mailboxLabel })}
                options={[
                  { value: 'inbox', label: 'Inbox' },
                  { value: 'support', label: 'Support' },
                  { value: 'bugs', label: 'Bugs' }
                ]}
              />
              <span className="helper-line">
                Which Gmail label to import from. For Support or Bugs, create that label in Gmail (or a filter that
                applies it) first.
              </span>
            </div>

            <Toggle
              label="Skip newsletters and notifications"
              note="Ignore Gmail's Promotions, Social, Updates and Forums tabs."
              checked={settings.skipBulkMail}
              disabled={readOnly}
              onChange={(skipBulkMail) => save({ skipBulkMail })}
            />

            {/* Shown so the direction is visible, but disabled: nothing reads these yet. */}
            <fieldset className="planned" disabled>
              <legend>
                Planned <span>Not active yet</span>
              </legend>
              <div className="two-col-row">
                <div className="setting-block">
                  <span className="mini-label">AI model</span>
                  <Segmented
                    label="AI model"
                    disabled
                    value={settings.model}
                    onChange={() => {}}
                    options={[
                      { value: 'gemini', label: 'Gemini Flash' },
                      { value: 'llama', label: 'Llama · Groq' }
                    ]}
                  />
                  <span className="helper-line">Drafts currently come from a keyword classifier.</span>
                </div>
                <div className="setting-block">
                  <span className="mini-label">Review mode</span>
                  <Segmented
                    label="Review mode"
                    disabled
                    value={settings.reviewMode}
                    onChange={() => {}}
                    options={[
                      { value: 'review', label: 'Hold for review' },
                      { value: 'auto', label: 'Auto-accept ≥ 90%' }
                    ]}
                  />
                </div>
              </div>
              <div className="toggle-list">
                <Toggle
                  label="Daily queue digest"
                  note="One email at 9:00 with new drafts."
                  checked={settings.dailyDigest}
                  disabled
                  onChange={() => {}}
                />
              </div>
            </fieldset>
          </div>
        </Card>
      </div>

      <Card as="aside" className="account-sidebar">
        <div className="sidebar-content">
          <div className="account-info-row">
            <span className="mini-label">Organisation</span>
            <strong>{org.name}</strong>
          </div>
          <div className="account-info-row">
            <span className="mini-label">Ticket prefix</span>
            <strong>{org.ticketPrefix}</strong>
          </div>
          <div className="account-info-row">
            <span className="mini-label">Signed in as</span>
            <strong>
              {user.email} · {role}
            </strong>
          </div>
          <div className="account-info-row">
            <span className="mini-label">Members</span>
            <div className="member-list">
              {members.map((member) => (
                <div key={member.id}>
                  {member.name} <span>{member.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
