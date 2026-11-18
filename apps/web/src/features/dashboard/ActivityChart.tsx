import type { Stats, StatsRange } from '@triago/shared';
import { Card } from '../../components/Card';
import { Segmented } from '../../components/Segmented';

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
];

const RANGE_NOTE: Record<StatsRange, string> = {
  day: 'last 24 hours',
  week: 'last 7 days',
  month: 'last 30 days'
};

/** Axis label for a bucket; month view labels every fifth day so they don't collide. */
function bucketLabel(bucket: string, range: StatsRange, index: number, count: number): string {
  const date = new Date(bucket);
  if (range === 'day') {
    return index % 4 === 0 ? date.toLocaleTimeString([], { hour: 'numeric' }) : '';
  }
  if (range === 'week') return date.toLocaleDateString([], { weekday: 'short' });
  return index % 5 === 0 || index === count - 1 ? date.toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
}

function bucketTitle(bucket: string, range: StatsRange): string {
  const date = new Date(bucket);
  return range === 'day'
    ? date.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ActivityChart({
  activity,
  range,
  onRangeChange,
  isUpdating
}: {
  activity: Stats['activity'];
  range: StatsRange;
  onRangeChange: (range: StatsRange) => void;
  isUpdating: boolean;
}) {
  const { series } = activity;
  const max = Math.max(1, ...series.map((b) => Math.max(b.created, b.accepted)));

  return (
    <Card className="panel-card activity-card">
      <div className="activity-header">
        <div>
          <h3>Tickets created</h3>
          <span className="stat-note">AI drafts from email and manual tickets, {RANGE_NOTE[activity.range]}</span>
        </div>
        <Segmented label="Time range" options={RANGE_OPTIONS} value={range} onChange={onRangeChange} />
      </div>

      <div className={`activity-body ${isUpdating ? 'is-updating' : ''}`}>
        <div className="activity-totals">
          <div>
            <span className="card-kicker">Created</span>
            <span className="stat-value">{activity.created}</span>
          </div>
          <div>
            <span className="card-kicker">Accepted</span>
            <span className="stat-value">{activity.accepted}</span>
          </div>
          <div className="legend-row">
            <span>
              <i className="legend-swatch swatch-ghost" />
              Created
            </span>
            <span>
              <i className="legend-swatch swatch-accent" />
              Accepted
            </span>
          </div>
        </div>

        <div
          className={`chart-wrap chart-${activity.range}`}
          style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
        >
          {series.map((b, index) => (
            <div
              key={b.bucket}
              className="chart-col"
              title={`${bucketTitle(b.bucket, activity.range)}: ${b.created} created, ${b.accepted} accepted`}
            >
              <div className="bar-stack">
                <div className="chart-read" style={{ height: `${(b.created / max) * 100}%` }} />
                <div className="chart-file" style={{ height: `${(b.accepted / max) * 100}%` }} />
              </div>
              <span className="chart-day">{bucketLabel(b.bucket, activity.range, index, series.length)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
