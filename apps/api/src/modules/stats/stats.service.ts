import type { Stats, StatsRange } from '@triago/shared';
import { prisma } from '../../lib/db.js';

// Aggregates read better as SQL (filtered counts, a percentile, a date
// series), so this module uses $queryRaw; everything else goes through Prisma.

const RANGES: Record<StatsRange, { unit: 'hour' | 'day'; buckets: number }> = {
  day: { unit: 'hour', buckets: 24 },
  week: { unit: 'day', buckets: 7 },
  month: { unit: 'day', buckets: 30 }
};

export async function getStats(
  orgId: string,
  timeZone: string,
  range: StatsRange = 'week',
  userId?: string
): Promise<Stats> {
  const { unit, buckets } = RANGES[range];
  const step = `1 ${unit}`;
  const [[totals], byStatus, last7Days, series] = await Promise.all([
    prisma.$queryRaw<
      {
        awaiting_triage: number;
        active: number;
        mine: number;
        filed: number;
        filed_from_email: number;
        median_triage_seconds: number | null;
      }[]
    >`
      select
        count(*) filter (where status = 'new')::int                                       as awaiting_triage,
        count(*) filter (where status in ('open', 'waiting'))::int                        as active,
        count(*) filter (where status in ('new', 'open', 'waiting')
                           and assignee_id = ${userId ?? null}::uuid)::int                 as mine,
        count(*) filter (where status not in ('new', 'dismissed'))::int                   as filed,
        count(*) filter (where status not in ('new', 'dismissed') and source = 'email')::int as filed_from_email,
        percentile_cont(0.5) within group (order by extract(epoch from triaged_at - received_at))
          filter (where source = 'email' and triaged_at is not null)                      as median_triage_seconds
      from tickets where org_id = ${orgId}::uuid`,

    prisma.ticket.groupBy({
      by: ['status'],
      where: { orgId },
      _count: { _all: true }
    }),

    // Emails received vs. tickets accepted per day, in the viewer's time zone.
    prisma.$queryRaw<Stats['last7Days']>`
      select to_char(day, 'YYYY-MM-DD') as day,
             (select count(*) from tickets
               where org_id = ${orgId}::uuid and source = 'email'
                 and (received_at at time zone ${timeZone})::date = day::date)::int as received,
             (select count(*) from tickets
               where org_id = ${orgId}::uuid and status not in ('new', 'dismissed')
                 and (triaged_at at time zone ${timeZone})::date = day::date)::int as filed
        from generate_series((now() at time zone ${timeZone})::date - 6,
                             (now() at time zone ${timeZone})::date,
                             interval '1 day') as day`,

    // Tickets created (anything not dismissed) and accepted per hour or day, in the viewer's time zone.
    prisma.$queryRaw<Stats['activity']['series']>`
      select to_char(bucket, 'YYYY-MM-DD"T"HH24:MI') as bucket,
             (select count(*) from tickets
               where org_id = ${orgId}::uuid and status <> 'dismissed'
                 and date_trunc(${unit}, received_at at time zone ${timeZone}) = bucket)::int as created,
             (select count(*) from tickets
               where org_id = ${orgId}::uuid and status not in ('new', 'dismissed')
                 and date_trunc(${unit}, triaged_at at time zone ${timeZone}) = bucket)::int as accepted
        from generate_series(date_trunc(${unit}, now() at time zone ${timeZone}) - ${buckets - 1}::int * ${step}::interval,
                             date_trunc(${unit}, now() at time zone ${timeZone}),
                             ${step}::interval) as bucket
       order by bucket`
  ]);

  return {
    awaitingTriage: totals!.awaiting_triage,
    active: totals!.active,
    mine: totals!.mine,
    filed: totals!.filed,
    filedFromEmail: totals!.filed_from_email,
    medianTriageMinutes: totals!.median_triage_seconds === null ? null : Math.round(totals!.median_triage_seconds / 60),
    byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
    last7Days,
    activity: {
      range,
      created: series.reduce((sum, b) => sum + b.created, 0),
      accepted: series.reduce((sum, b) => sum + b.accepted, 0),
      series
    }
  };
}
