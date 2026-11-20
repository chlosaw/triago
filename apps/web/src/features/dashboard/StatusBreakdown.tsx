import type { Stats } from '@triago/shared';
import { Card } from '../../components/Card';
import { STATUS_COLUMNS } from '../../lib/labels';

/** Every ticket in the organisation, split into the four statuses. */
export function StatusBreakdown({ byStatus }: { byStatus: Stats['byStatus'] }) {
  const counts = STATUS_COLUMNS.map((column) => ({
    ...column,
    count: column.statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)
  }));
  const total = counts.reduce((sum, column) => sum + column.count, 0);

  return (
    <Card className="panel-card breakdown-card">
      <div className="section-head">
        <div>
          <h3>Tickets by status</h3>
          <span className="stat-note">All {total} tickets in the organisation</span>
        </div>
      </div>
      <div className="breakdown-bar" aria-hidden="true">
        {counts.map(
          (column) =>
            column.count > 0 && (
              <span
                key={column.value}
                className={`breakdown-seg st-${column.value}`}
                style={{ flexGrow: column.count }}
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
            <dd>{column.count}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
