import type { StatsRange } from '@triago/shared';
import { useState } from 'react';
import { useStats } from '../api/queries';
import { QueryState } from '../components/QueryState';
import { ActivityChart } from '../features/dashboard/ActivityChart';
import { StatStrip } from '../features/dashboard/StatStrip';
import { StatusTable } from '../features/tickets/StatusTable';

export function DashboardPage() {
  const [range, setRange] = useState<StatsRange>('week');
  const stats = useStats(range);

  return (
    <div className="screen-page dashboard-page">
      <QueryState query={stats} loadingLabel="Loading metrics…">
        {(data) => (
          <>
            <StatStrip stats={data} />
            <ActivityChart
              activity={data.activity}
              range={range}
              onRangeChange={setRange}
              isUpdating={stats.isPlaceholderData}
            />
            <StatusTable byStatus={data.byStatus} />
          </>
        )}
      </QueryState>
    </div>
  );
}
