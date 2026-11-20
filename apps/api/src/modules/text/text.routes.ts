import { CorrectTextBody } from '@triago/shared';
import { Router } from 'express';
import { getAuth } from '../../middleware/auth.js';
import { limiter } from '../../middleware/security.js';
import { correctText } from './text.service.js';

// Each check may call a model, so cap it per user.
const correctLimiter = limiter({
  name: 'text-correct',
  windowMinutes: 1,
  limit: 30,
  key: (req) => getAuth(req).userId
});

export const textRouter = Router();

textRouter.post('/correct', correctLimiter, async (req, res) => {
  const { text } = CorrectTextBody.parse(req.body);
  res.json(await correctText(text, undefined, getAuth(req).orgId));
});
