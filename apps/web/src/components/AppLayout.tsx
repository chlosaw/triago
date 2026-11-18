import { NavLink, Outlet } from 'react-router-dom';
import { useStats } from '../api/queries';
import { useAuth, useProfile } from '../features/auth/context';
import { Brand } from './Brand';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/queue', label: 'Queue' },
  { to: '/settings', label: 'Settings' }
];

export function AppLayout() {
  const { logout } = useAuth();
  const { user, org, role } = useProfile();
  const pending = useStats().data?.awaitingTriage ?? 0;
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
              {item.to === '/queue' && pending > 0 && <span className="nav-badge">{pending}</span>}
            </NavLink>
          ))}
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
    </div>
  );
}
