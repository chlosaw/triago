import type { Stats } from '@triago/shared';
import { Card } from '../../components/Card';
import { percent, STATUS_COLUMNS } from '../../lib/labels';

/**
 * Every ticket in the organisation as one stacked bar, a segment per status,
 * plus the two numbers the bar can't show: how much comes from email and how fast it's triaged.
 */
export function StatusBreakdown({ stats }: { stats: Stats }) {
  const counts = STATUS_COLUMNS.map((column) => ({
    ...column,
    count: column.statuses.reduce((sum, status) => sum + (stats.byStatus[status] ?? 0), 0)
  }));
  const total = counts.reduce((sum, column) => sum + column.count, 0);
  const summary = counts.map((column) => `${column.label} ${column.count}`).join(', ');

  return (
    <Card className="panel-card breakdown-card">
      <div className="section-head">
        <div>
          <h3>Tickets by status</h3>
          <span className="stat-note">All {total} tickets in the organisation</span>
        </div>
      </div>
      <div className="breakdown-bar" role="img" aria-label={`Tickets by status: ${summary}`}>
        {counts.map(
          (column) =>
            column.count > 0 && (
              <span
                key={column.value}
                className={`breakdown-seg st-${column.value}`}
                style={{ flexGrow: column.count }}
                title={`${column.label}: ${column.count}`}
              />
            )
        )}
      </div>
      <dl className="breakdown-grid">
        {counts.map((column) => (
          <div key={column.value} className="breakdown-item">
            <dt>
              <span className={`status-dot st-${column.value}`} aria-hidden="true" />
              {column.label}
            </dt>
            <dd>
              {column.count}
              <span className="breakdown-share">{total ? percent(column.count / total) : '0%'}</span>
            </dd>
          </div>
        ))}
      </dl>
      <dl className="breakdown-extra">
        <div>
          <dt>Filed from email</dt>
          <dd>
            {stats.filedFromEmail}{' '}
            <span className="stat-note">
              ({percent(stats.filedFromEmail / Math.max(stats.filed, 1))} of all tickets)
            </span>
          </dd>
        </div>
        <div>
          <dt>Time to triage</dt>
          <dd>
            {stats.medianTriageMinutes === null ? '—' : `${stats.medianTriageMinutes} min`}{' '}
            <span className="stat-note">(median, email to first decision)</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
