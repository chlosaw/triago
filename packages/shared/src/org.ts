import { z } from 'zod';
import type { Role } from './auth.js';

/**
 * How long closed tickets (with their emails, notes and files) are kept after their
 * last change. 0 keeps them until someone deletes them.
 */
export const RETENTION_DAYS = [0, 90, 180, 365, 730] as const;

const SettingsFields = {
  mailboxLabel: z.enum(['inbox', 'support', 'bugs']),
  model: z.enum(['gemini', 'llama']),
  reviewMode: z.enum(['review', 'auto']),
  skipBulkMail: z.boolean(),
  dailyDigest: z.boolean(),
  retentionDays: z
    .number()
    .int()
    .refine((days) => (RETENTION_DAYS as readonly number[]).includes(days), 'Choose a listed retention period.')
};

/** Per-organisation intake settings. Stored as jsonb; missing keys fall back to defaults. */
export const OrgSettings = z.object({
  mailboxLabel: SettingsFields.mailboxLabel.default('support'),
  model: SettingsFields.model.default('gemini'),
  reviewMode: SettingsFields.reviewMode.default('review'),
  skipBulkMail: SettingsFields.skipBulkMail.default(true),
  dailyDigest: SettingsFields.dailyDigest.default(false),
  retentionDays: SettingsFields.retentionDays.default(0)
});
export type OrgSettings = z.infer<typeof OrgSettings>;

// No defaults: a patch must contain only the keys the caller sent.
export const OrgSettingsPatch = z.object(SettingsFields).partial().strict();
export type OrgSettingsPatch = z.infer<typeof OrgSettingsPatch>;

export interface Organisation {
  id: string;
  name: string;
  ticketPrefix: string;
  isDemo: boolean;
  /** Email sent here becomes a drafted ticket; null when inbound mail is not configured. */
  inboundAddress: string | null;
  settings: OrgSettings;
  gmail: GmailStatus;
}

export interface GmailStatus {
  /** False when the server has no Google OAuth client configured. */
  available: boolean;
  /** The connected mailbox, or null when none is connected. */
  email: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
}

/** Deleting an organisation needs its name typed back, like GitHub's repository delete. */
export const DeleteOrgBody = z.object({ confirmName: z.string().trim().min(1, 'Type the organisation name.') });
export type DeleteOrgBody = z.infer<typeof DeleteOrgBody>;

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
}
