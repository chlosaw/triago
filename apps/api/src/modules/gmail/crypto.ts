import crypto from 'node:crypto';
import { config } from '../../config.js';

/**
 * Gmail refresh tokens are encrypted at rest with AES-256-GCM.
 *
 * v2 tokens use TOKEN_ENCRYPTION_KEY. v1 tokens used a key derived from JWT_SECRET;
 * they still decrypt, and are written as v2 the next time the mailbox is connected.
 * Without TOKEN_ENCRYPTION_KEY everything stays on the v1 key.
 */
const derive = (secret: string, info: string) => Buffer.from(crypto.hkdfSync('sha256', secret, 'triago', info, 32));

const legacyKey = derive(config.jwtSecret, 'gmail-refresh-token');
const currentKey = config.tokenEncryptionKey ? derive(config.tokenEncryptionKey, 'token-encryption-v2') : null;

const KEYS: Record<string, Buffer | null> = { v1: legacyKey, v2: currentKey };

export function encrypt(plain: string): string {
  const version = currentKey ? 'v2' : 'v1';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEYS[version]!, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    version,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url')
  ].join('.');
}

/** Returns null when the value can't be decrypted (wrong key, tampered, unknown version). */
export function decrypt(sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split('.');
  const key = version ? KEYS[version] : null;
  if (!key || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
