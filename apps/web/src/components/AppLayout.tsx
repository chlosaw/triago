import type { Ticket } from '@triago/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useStats } from '../api/queries';
import { useProfile } from '../features/auth/context';
import { CreateTicketDialog } from '../features/tickets/CreateTicketDialog';
import { Brand } from './Brand';
import { UserMenu } from './UserMenu';

const icon = (d: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    {d}
  </svg>
);
const ICONS = {
  dashboard: icon(
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  tickets: icon(<path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />),
  mine: icon(
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" strokeLinecap="round" />
    </>
  ),
  queue: icon(<path d="M3.5 13.5h5l1.5 3h4l1.5-3h5M5 5.5h14l1.5 8v5h-17v-5Z" strokeLinejoin="round" />),
  settings: icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"
        strokeLinecap="round"
      />
    </>
  )
};

export function AppLayout() {
  const { org } = useProfile();
  const stats = useStats().data;
  const count = (statuses: string[]) =>
    statuses.reduce((sum, status) => sum + (stats?.byStatus[status as keyof typeof stats.byStatus] ?? 0), 0);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<Ticket | null>(null);
  // On narrow screens the sidebar folds away behind a menu button; following a link closes it.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  // The "created" notice fades out on its own.
  useEffect(() => {
    if (!justCreated) return;
    const timer = setTimeout(() => setJustCreated(null), 8000);
    return () => clearTimeout(timer);
  }, [justCreated]);

  const nav = [
    { to: '/', label: 'Dashboard', icon: ICONS.dashboard },
    { to: '/tickets', label: 'All open tickets', icon: ICONS.tickets, count: count(['new', 'open', 'waiting']) },
    { to: '/tickets/mine', label: 'My tickets', icon: ICONS.mine, count: stats?.mine },
    { to: '/queue', label: 'Triage queue', icon: ICONS.queue, count: stats?.awaitingTriage }
  ];

  return (
    <div className={`page-shell app-shell ${menuOpen ? 'menu-open' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar-top">
          <Brand />
          <button
            type="button"
            className="sidebar-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="sidebar-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>

        <div className="sidebar-body" id="sidebar-nav">
          <div className="sidebar-project">
            <span className="sidebar-project-icon" aria-hidden="true">
              {org.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="sidebar-project-name">
              <strong>{org.name}</strong>
              <span>Service desk</span>
            </span>
          </div>

          <button
            type="button"
            className="btn btn-primary sidebar-create"
            onClick={() => {
              closeMenu();
              setCreating(true);
            }}
          >
            <span aria-hidden="true">+</span> Create
          </button>

          <nav className="sidebar-nav" aria-label="Primary">
            <span className="sidebar-heading">Tickets</span>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                onClick={closeMenu}
                className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}
              >
                {item.icon}
                <span className="sidebar-label">{item.label}</span>
                {item.count !== undefined && <span className="sidebar-count">{item.count}</span>}
              </NavLink>
            ))}
            <hr className="sidebar-rule" />
            <NavLink
              to="/settings"
              end
              onClick={closeMenu}
              className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}
            >
              {ICONS.settings}
              <span className="sidebar-label">Settings</span>
            </NavLink>
          </nav>

          <div className="sidebar-footer">
            <UserMenu />
          </div>
        </div>
      </aside>

      <div className="app-main">
        {org.isDemo && (
          <div className="demo-banner">
            Demo sandbox: this organisation and its data are yours alone and are deleted after 24 hours.
          </div>
        )}
        <main id="main" className="page-main">
          <Outlet />
        </main>
      </div>

      {creating && <CreateTicketDialog onClose={() => setCreating(false)} onCreated={setJustCreated} />}
      <div className="toast-region" role="status">
        {justCreated && (
          <div className="toast">
            <span>
              <strong>{justCreated.key}</strong> created
            </span>
            <Link to={`/tickets/${justCreated.id}`} onClick={() => setJustCreated(null)}>
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
