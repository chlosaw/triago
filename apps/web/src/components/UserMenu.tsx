import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useProfile } from '../features/auth/context';
import { useTheme } from '../lib/theme';
import { Avatar } from './Icons';

/**
 * The signed-in person at the foot of the sidebar. Clicking it opens a menu with
 * the organisation switcher, the theme and Sign out.
 */
export function UserMenu() {
  const { logout, switchOrg } = useAuth();
  const { user, org, role, orgs } = useProfile();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on a click outside or Escape; Escape hands focus back to the button.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      {open && (
        <div className="user-menu-panel" id={menuId} role="group" aria-label="Account">
          <div className="user-menu-who">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          {orgs.length > 1 && (
            <label className="user-menu-row">
              <span>Organisation</span>
              <select
                className="input org-switcher"
                value={org.id}
                onChange={(event) =>
                  void switchOrg(event.target.value).then(() => {
                    setOpen(false);
                    navigate('/');
                  })
                }
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.role}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="user-menu-item"
            role="switch"
            aria-checked={theme === 'dark'}
            onClick={toggle}
          >
            <span>Dark theme</span>
            <span className={`mini-switch ${theme === 'dark' ? 'is-on' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="user-menu-item"
            onClick={() => {
              // Land on the homepage, not the sign-in form, after signing out.
              navigate('/', { replace: true });
              void logout();
            }}
          >
            Sign out
          </button>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className="sidebar-user user-menu-button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={user.name} size={32} />
        <span className="sidebar-user-meta">
          <strong>{user.name}</strong>
          <span>
            {org.name} · {role}
          </span>
        </span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="user-menu-chevron">
          <path d="m4 10 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
