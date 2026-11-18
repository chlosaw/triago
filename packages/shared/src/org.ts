import { z } from 'zod';
import type { Role } from './auth.js';

const SettingsFields = {
  mailboxLabel: z.enum(['inbox', 'support', 'bugs']),
  model: z.enum(['gemini', 'llama']),
  reviewMode: z.enum(['review', 'auto']),
  skipBulkMail: z.boolean(),
  dailyDigest: z.boolean()
};

/** Per-organisation intake settings. Stored as jsonb; missing keys fall back to defaults. */
export const OrgSettings = z.object({
  mailboxLabel: SettingsFields.mailboxLabel.default('support'),
  model: SettingsFields.model.default('gemini'),
  reviewMode: SettingsFields.reviewMode.default('review'),
  skipBulkMail: SettingsFields.skipBulkMail.default(true),
  dailyDigest: SettingsFields.dailyDigest.default(false)
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
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
}
