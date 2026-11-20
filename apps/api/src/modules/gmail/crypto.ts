import crypto from 'node:crypto';
import { config } from '../../config.js';

// Gmail refresh tokens are encrypted at rest with AES-256-GCM. The key is
// derived from JWT_SECRET, so rotating that secret means reconnecting Gmail.
const key = crypto.hkdfSync('sha256', config.jwtSecret, 'triago', 'gmail-refresh-token', 32);

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(
    '.'
  );
}

/** Returns null when the value can't be decrypted (e.g. JWT_SECRET changed). */
export function decrypt(sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
