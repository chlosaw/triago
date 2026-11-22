import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Breadcrumb, page title and optional actions, as at the top of every Jira page. */
export function PageHeader({
  crumbs,
  title,
  actions,
  children
}: {
  crumbs: { label: string; to?: string }[];
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`}>
              {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <div className="page-title-row">
        <h1 className="page-title">{title}</h1>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
