import crypto from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendMail } from '../../lib/mailer.js';

const RESET_TTL_MINUTES = 30;
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Emails a reset link if the address belongs to an account with a password.
 * The caller always gets the same answer, so it can't be used to find out
 * who has an account. Older unused links for that account stop working.
 */
export async function requestReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  // Demo visitors have no password and no real inbox.
  if (!user?.passwordHash) return;

  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000)
      }
    })
  ]);

  const link = new URL('/reset-password', config.clientOrigin);
  link.searchParams.set('token', token);
  await sendMail({
    to: email,
    subject: 'Reset your Triago password',
    text: [
      'Someone asked to reset the password for this Triago account.',
      '',
      `Choose a new password here (the link works once, for ${RESET_TTL_MINUTES} minutes):`,
      link.toString(),
      '',
      "If it wasn't you, ignore this email; your password stays the same."
    ].join('\n')
  });
}

/**
 * Sets a new password from a reset link. The link works once and for 30 minutes.
 * Every existing session for the account is signed out, in case the old password leaked.
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  const passwordHash = await argon2.hash(password);
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string; user_id: string; usable: boolean }[]>`
      select id, user_id, (used_at is null and expires_at > now()) as usable
        from password_reset_tokens where token_hash = ${hash(token)} for update`;
    if (!row?.usable) {
      throw new HttpError(
        400,
        'INVALID_RESET_LINK',
        'This reset link has expired or was already used. Ask for a new one.'
      );
    }
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: row.user_id }, data: { passwordHash } });
    await tx.refreshToken.updateMany({
      where: { userId: row.user_id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    logger.info({ security: 'password_reset', userId: row.user_id }, 'Password reset');
  });
}
