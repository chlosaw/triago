import type { Request, Response } from 'express';
import { STATS_RANGES } from '@triago/shared';
import { z } from 'zod';
import { getAuth } from '../../middleware/auth.js';
import { getStats } from './stats.service.js';

const StatsQuery = z.object({
  // IANA zone of the viewer, so "today" on the chart is their today.
  tz: z
    .string()
    .default('UTC')
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone.'),
  range: z.enum(STATS_RANGES).default('week')
});

export async function show(req: Request, res: Response) {
  const { tz, range } = StatsQuery.parse(req.query);
  const auth = getAuth(req);
  res.json(await getStats(auth.orgId, tz, range, auth.userId));
}
