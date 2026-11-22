import path from 'node:path';
import { z } from 'zod';

// Local development reads the repo-root .env; containers pass real env vars.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // No .env file: rely on the environment.
}

/**
 * An optional variable that may be present but blank: docker compose passes
 * `${VAR:-}` through as "", and `.env.example` ships `GROQ_API_KEY=`.
 * Blank means "not set", not "invalid".
 */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional());

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // How many reverse proxies sit in front of the API (nginx in docker compose = 1).
  // Leave at 0 when clients connect directly: otherwise anyone can fake their IP
  // with an X-Forwarded-For header and slip past the rate limits.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
  // Optional: with a free Groq key, new emails are drafted by an AI model; without one, by keyword rules.
  GROQ_API_KEY: optional(z.string().min(1)),
  CLASSIFIER_MODEL: z.string().min(1).default('llama-3.3-70b-versatile'),
  // Inbound email: the domain SendGrid Inbound Parse receives mail for, and the
  // secret in its webhook URL. Without a secret the inbound endpoint is off.
  INBOUND_EMAIL_DOMAIN: optional(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'INBOUND_EMAIL_DOMAIN must be a domain like in.example.com')
  ),
  INBOUND_WEBHOOK_SECRET: optional(z.string().min(32, 'INBOUND_WEBHOOK_SECRET must be at least 32 characters')),
  // Optional: a Google OAuth client (type "Web application") lets each organisation connect a Gmail
  // mailbox. See docs/gmail.md. The redirect URI defaults to <CLIENT_ORIGIN>/api/gmail/callback.
  GOOGLE_CLIENT_ID: optional(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
  GOOGLE_REDIRECT_URI: optional(z.url()),
  // Encrypts Gmail refresh tokens at rest. Separate from JWT_SECRET so rotating one doesn't
  // break the other. Generate with: openssl rand -base64 48. Without it, a key derived
  // from JWT_SECRET is used (tokens saved that way still decrypt after you add this).
  TOKEN_ENCRYPTION_KEY: optional(z.string().min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters')),
  // Optional: outgoing email (invitations, password reset links) through Resend.
  // MAIL_FROM must be on a domain verified in Resend, e.g. "Triago <no-reply@triago.bid>".
  // Without these, emails are printed to the console in development and not sent at all in production.
  RESEND_API_KEY: optional(z.string().min(1)),
  MAIL_FROM: optional(z.string().trim().min(3)),
  // Set to "false" to run an API instance that does not process background jobs.
  JOBS_ENABLED: z.enum(['true', 'false']).default('true')
});

const env = Env.parse(process.env);

if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production (try `openssl rand -base64 48`).');
}

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  clientOrigin: new URL(env.CLIENT_ORIGIN).origin,
  trustProxy: env.TRUST_PROXY,
  // Tests always use the deterministic keyword classifier.
  groqApiKey: env.NODE_ENV === 'test' ? undefined : env.GROQ_API_KEY,
  classifierModel: env.CLASSIFIER_MODEL,
  inboundEmailDomain: env.INBOUND_EMAIL_DOMAIN,
  inboundWebhookSecret: env.INBOUND_WEBHOOK_SECRET,
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: env.GOOGLE_REDIRECT_URI ?? `${new URL(env.CLIENT_ORIGIN).origin}/api/gmail/callback`
        }
      : null,
  tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
  mail: env.RESEND_API_KEY && env.MAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM } : null,
  jobsEnabled: env.JOBS_ENABLED === 'true' && env.NODE_ENV !== 'test',
  accessTokenTtlSeconds: 15 * 60,
  jwtIssuer: 'triago-api',
  jwtAudience: 'triago-web',
  refreshTokenTtlDays: 30,
  // How long a just-rotated refresh token is still accepted (concurrent tabs).
  refreshReuseGraceSeconds: 10
} as const;
