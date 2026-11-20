import { Router, type Request } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { limiter, requireSameOrigin } from '../../middleware/security.js';
import * as controller from './auth.controller.js';

/** The email a credential request targets, normalised like the schema does. */
const targetEmail = (req: Request): string | undefined => {
  const email: unknown = req.body?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : undefined;
};

// Password guessing is the threat here, so the budget is tight. Per IP stops
// one machine; per account stops a botnet spreading guesses over many IPs.
const credentialsPerIp = limiter({ name: 'credentials-ip', windowMinutes: 15, limit: 10 });
const credentialsPerAccount = limiter({ name: 'credentials-account', windowMinutes: 15, limit: 10, key: targetEmail });
// Demo sandboxes are cheap but write to the database; allow a shared office IP to try it.
const demoLimiter = limiter({ name: 'demo', windowMinutes: 60, limit: 30 });
// The app refreshes every 15 minutes per tab; this only catches token guessing and loops.
const refreshLimiter = limiter({ name: 'refresh', windowMinutes: 15, limit: 60 });

export const authRouter = Router();

// Every auth endpoint either sets or reads the refresh cookie.
authRouter.use(requireSameOrigin);

authRouter.post('/register', credentialsPerIp, credentialsPerAccount, controller.register);
authRouter.post('/login', credentialsPerIp, credentialsPerAccount, controller.login);
authRouter.post('/demo', demoLimiter, controller.demo);
authRouter.post('/refresh', refreshLimiter, controller.refresh);
authRouter.post('/logout', controller.logout);
// Same budget as sign-in: each request sends an email, and guessing tokens must be hopeless.
authRouter.post('/password/forgot', credentialsPerIp, credentialsPerAccount, controller.forgotPassword);
authRouter.post('/password/reset', credentialsPerIp, controller.resetPassword);
authRouter.get('/me', requireAuth, controller.me);
