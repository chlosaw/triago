import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/auth.js';
import { syncInbox } from './emails.service.js';

export async function sync(req: Request, res: Response) {
  const result = await syncInbox(getAuth(req).orgId);
  res.status(result.imported ? 201 : 200).json(result);
}
