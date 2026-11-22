import type { StatsRange } from '@triago/shared';
import { useState } from 'react';
import { useStats } from '../api/queries';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { useProfile } from '../features/auth/context';
import { ActivityChart } from '../features/dashboard/ActivityChart';
import { MyTickets } from '../features/dashboard/MyTickets';
import { StatStrip } from '../features/dashboard/StatStrip';
import { StatusBreakdown } from '../features/dashboard/StatusBreakdown';

export function DashboardPage() {
  const [range, setRange] = useState<StatsRange>('week');
  const stats = useStats(range);
  const { org, user } = useProfile();

  return (
    <div className="screen-page dashboard-page">
      <PageHeader
        crumbs={[{ label: org.name }, { label: 'Dashboard' }]}
        title={`Welcome, ${user.name.split(' ')[0]}`}
      />
      <section className="dash-section" aria-labelledby="my-tickets-heading">
        <h2 id="my-tickets-heading" className="dash-section-title">
          My tickets
        </h2>
        <MyTickets />
      </section>

      <section className="dash-section" aria-labelledby="statistics-heading">
        <h2 id="statistics-heading" className="dash-section-title">
          Statistics
        </h2>
        <QueryState query={stats} loadingLabel="Loading metrics…">
          {(data) => (
            <>
              <StatStrip stats={data} />
              <StatusBreakdown byStatus={data.byStatus} />
              <ActivityChart
                activity={data.activity}
                range={range}
                onRangeChange={setRange}
                isUpdating={stats.isPlaceholderData}
              />
            </>
          )}
        </QueryState>
      </section>
    </div>
  );
}
