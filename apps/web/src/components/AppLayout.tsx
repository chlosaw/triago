import type { Ticket } from '@triago/shared';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useStats } from '../api/queries';
import { useAuth, useProfile } from '../features/auth/context';
import { CreateTicketDialog } from '../features/tickets/CreateTicketDialog';
import { displayStatus } from '../lib/labels';
import { Brand } from './Brand';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/queue', label: 'Queue' },
  { to: '/settings', label: 'Settings' }
];

export function AppLayout() {
  const { logout } = useAuth();
  const { user, org, role } = useProfile();
  const newCount = useStats().data?.awaitingTriage ?? 0;
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<Ticket | null>(null);

  // The "created" notice fades out on its own.
  useEffect(() => {
    if (!justCreated) return;
    const timer = setTimeout(() => setJustCreated(null), 8000);
    return () => clearTimeout(timer);
  }, [justCreated]);
  const initials = user.name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="page-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {org.isDemo && (
        <div className="demo-banner">
          Demo sandbox: this organisation and its data are yours alone and are deleted after 24 hours.
        </div>
      )}
      <header className="topbar">
        <Brand />
        <nav className="topnav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => `nav-btn ${isActive ? 'is-active' : ''}`}
            >
              {item.label}
              {item.to === '/queue' && newCount > 0 && (
                <span className="nav-badge" title={`${newCount} new`}>
                  {newCount}
                </span>
              )}
            </NavLink>
          ))}
          <button type="button" className="btn btn-primary create-nav-btn" onClick={() => setCreating(true)}>
            <span aria-hidden="true">+</span> Create
          </button>
        </nav>
        <div className="user-panel">
          <div className="avatar-box">{initials}</div>
          <div className="user-meta">
            <span className="user-name">{user.name}</span>
            <span className="user-detail">
              {org.name} · {role}
            </span>
          </div>
          <button type="button" className="btn btn-ghost signout" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <div id="main" className="page-main">
        <Outlet />
      </div>
      {creating && <CreateTicketDialog onClose={() => setCreating(false)} onCreated={setJustCreated} />}
      <div className="toast-region" role="status">
        {justCreated && (
          <div className="toast">
            <span>
              <strong>{justCreated.key}</strong> created
            </span>
            <Link
              to={`/queue?status=${displayStatus(justCreated.status)}&ticket=${justCreated.id}`}
              onClick={() => setJustCreated(null)}
            >
              View
            </Link>
            <button type="button" className="link-btn" aria-label="Dismiss" onClick={() => setJustCreated(null)}>
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
