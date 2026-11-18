import { OrgSettingsPatch } from '@triago/shared';
import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import * as org from './org.service.js';

export async function show(req: Request, res: Response) {
  res.json(await org.getOrganisation(getAuth(req).orgId));
}

export async function updateSettings(req: Request, res: Response) {
  const settings = await org.updateSettings(getAuth(req).orgId, OrgSettingsPatch.parse(req.body));
  res.json({ settings });
}
