import type { Status } from './tickets.js';

export const STATS_RANGES = ['day', 'week', 'month'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export interface Stats {
  awaitingTriage: number;
  active: number;
  filed: number;
  filedFromEmail: number;
  medianTriageMinutes: number | null;
  /** Every status except `dismissed`. */
  byStatus: Partial<Record<Status, number>>;
  last7Days: { day: string; received: number; filed: number }[];
  /** Tickets created over the requested range, bucketed by hour (day) or day (week, month). */
  activity: {
    range: StatsRange;
    created: number;
    accepted: number;
    /** `bucket` is local time in the viewer's zone, "YYYY-MM-DDTHH:MM". */
    series: { bucket: string; created: number; accepted: number }[];
  };
}
