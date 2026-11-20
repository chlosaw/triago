import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { prisma } from './lib/db.js';
import { notFound } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireMember } from './middleware/auth.js';
import { limiter, noStore } from './middleware/security.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { emailsRouter } from './modules/emails/emails.routes.js';
import { gmailRouter } from './modules/gmail/gmail.routes.js';
import { inboundRouter } from './modules/inbound/inbound.routes.js';
import { orgRouter } from './modules/org/org.routes.js';
import { statsRouter } from './modules/stats/stats.routes.js';
import { textRouter } from './modules/text/text.routes.js';
import { ticketsRouter } from './modules/tickets/tickets.routes.js';

/**
 * The path as it appears in request logs: no query string (search terms, OAuth codes,
 * names and emails can be in it) and no inbound webhook secret.
 */
export function logUrl(url: string): string {
  return url.split('?')[0]!.replace(/^(\/api\/inbound\/sendgrid\/)[^/]+/, '$1[redacted]');
}

export function createApp() {
  const app = express();

  // Only trust X-Forwarded-For from proxies we actually run (see TRUST_PROXY).
  app.set('trust proxy', config.trustProxy);
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      // One line per request: method, path and status. Headers carry tokens and cookies.
      serializers: {
        // The inbound webhook URL carries a secret; never write it to the logs.
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: logUrl(req.url)
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode })
      }
    })
  );
  app.use(
    helmet({
      // The API only serves JSON: nothing in a response should ever load or run.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] }
      },
      strictTransportSecurity: config.isProduction ? { maxAge: 63072000, includeSubDomains: true } : false
    })
  );
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use('/api', noStore);
  // Broad per-IP budget for everything; auth routes add tighter limits of their own.
  app.use('/api', limiter({ name: 'api', windowMinutes: 1, limit: 300 }));
  // SendGrid Inbound Parse webhook; reads its own multipart body.
  app.use('/api/inbound', inboundRouter);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`select 1`;
    res.json({ ok: true, db: 'up' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/tickets', requireMember, ticketsRouter);
  app.use('/api/emails', requireMember, emailsRouter);
  app.use('/api/org', requireMember, orgRouter);
  app.use('/api/stats', requireMember, statsRouter);
  app.use('/api/text', requireMember, textRouter);
  // The OAuth callback is public (Google redirects the browser); the other routes check auth themselves.
  app.use('/api/gmail', gmailRouter);

  app.use('/api', () => {
    throw notFound('Endpoint');
  });
  app.use(errorHandler);

  return app;
}
