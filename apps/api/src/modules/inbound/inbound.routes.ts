import crypto from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { config } from '../../config.js';
import { notFound } from '../../lib/errors.js';
import { limiter } from '../../middleware/security.js';
import { receiveEmail, slugFromAddress, type InboundEmailPayload } from './inbound.service.js';
import { readFields, toPayload } from './sendgrid.js';

/**
 * SendGrid Inbound Parse posts here. It cannot sign requests, so the shared
 * secret is part of the webhook URL: /api/inbound/sendgrid/<INBOUND_WEBHOOK_SECRET>.
 * A wrong or missing secret gets a plain 404, like any unknown path.
 */
const requireSecret: RequestHandler = (req, _res, next) => {
  const secret = config.inboundWebhookSecret;
  const token = String(req.params.token ?? '');
  const valid =
    secret !== undefined &&
    token.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  if (!valid) {
    if (secret) req.log.warn({ security: 'inbound_token_rejected', ip: req.ip }, 'Inbound email with a wrong token');
    throw notFound('Endpoint');
  }
  next();
};

/**
 * SendGrid retries any 5xx for up to three days, which also rides out a cold
 * start. Problems a retry cannot fix are answered with 200 so it stops.
 */
const parseSendGrid: RequestHandler = async (req, res, next) => {
  const { fields, truncated } = await readFields(req);
  const payload = await toPayload(fields, truncated);
  if (typeof payload === 'string') {
    req.log.info({ inbound: 'dropped', reason: payload }, 'Inbound email dropped');
    res.status(200).json({ status: 'dropped', reason: payload });
    return;
  }
  req.body = payload;
  next();
};

// Anyone can email an address, and each email may call a paid model: cap the AI per organisation.
// Over the cap the email is still saved, just without an AI draft, and flagged for a person.
const perOrganisation = limiter({
  name: 'inbound-org',
  windowMinutes: 60,
  limit: 30,
  enforceInTests: true,
  key: (req) => slugFromAddress((req.body as InboundEmailPayload).to) ?? undefined,
  onLimit: (req, _res, next) => {
    const payload = req.body as InboundEmailPayload;
    payload.hold ??= 'rate_limited';
    next();
  }
});

export const inboundRouter = Router();

inboundRouter.post('/sendgrid/:token', requireSecret, parseSendGrid, perOrganisation, async (req, res) => {
  const result = await receiveEmail(req.body as InboundEmailPayload);
  res.status(result.status === 'created' ? 201 : 200).json(result);
});
