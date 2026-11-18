import pino from 'pino';
import { config } from '../config.js';

/** Structured JSON logs in production, readable lines in development, quiet in tests. */
export const logger = pino({
  level: config.env === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  ...(config.env === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {})
});
