import type { StatsRange } from '@triago/shared';
import { useState } from 'react';
import { useStats } from '../api/queries';
import { PageHeader } from '../components/PageHeader';
import { QueryState } from '../components/QueryState';
import { useProfile } from '../features/auth/context';
import { ActivityChart } from '../features/dashboard/ActivityChart';
import { AiDrafts } from '../features/dashboard/AiDrafts';
import { MyTickets } from '../features/dashboard/MyTickets';
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
      {/* The AI's drafts lead: they are the work only a person can finish. */}
      {stats.data && <AiDrafts waiting={stats.data.awaitingTriage} />}

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
              <StatusBreakdown stats={data} />
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
