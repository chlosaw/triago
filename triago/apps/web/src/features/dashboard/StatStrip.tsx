import type { Stats } from '@triago/shared';
import { Card } from '../../components/Card';
import { percent } from '../../lib/labels';

export function StatStrip({ stats }: { stats: Stats }) {
  const items = [
    {
      label: 'Awaiting triage',
      value: stats.awaitingTriage,
      note: stats.awaitingTriage ? 'in the queue' : 'queue is clear'
    },
    { label: 'Active tickets', value: stats.active, note: 'open or waiting on customer' },
    {
      label: 'Filed from email',
      value: stats.filedFromEmail,
      note: `${percent(stats.filedFromEmail / Math.max(stats.filed, 1))} of all tickets`
    },
    {
      label: 'Time to triage',
      value: stats.medianTriageMinutes === null ? '—' : `${stats.medianTriageMinutes}m`,
      note: 'median, email → decision'
    }
  ];

  return (
    <Card className="stat-strip">
      <div className="stats-grid">
        {items.map((item) => (
          <div key={item.label} className="stat-box">
            <span className="card-kicker">{item.label}</span>
            <span className="stat-value">{item.value}</span>
            <span className="stat-note">{item.note}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
