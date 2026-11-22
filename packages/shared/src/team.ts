import { z } from 'zod';

const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));
const MemberRole = z.enum(['admin', 'agent']);

/** Invitations expire after this many days. */
export const INVITATION_TTL_DAYS = 7;

export const InviteBody = z.object({ email: Email, role: MemberRole.default('agent') });
export type InviteBody = z.infer<typeof InviteBody>;

export const UpdateMemberBody = z.object({ role: MemberRole }).strict();
export type UpdateMemberBody = z.infer<typeof UpdateMemberBody>;

export const AcceptInviteBody = z.object({
  token: z.string().min(20, 'This invitation link is invalid.').max(200),
  /** Only for a new account; an existing account keeps its name. */
  name: z.string().trim().min(1, 'Enter your name.').max(80).optional(),
  password: z.string().min(1, 'Enter a password.').max(200)
});
export type AcceptInviteBody = z.infer<typeof AcceptInviteBody>;

export const SwitchOrgBody = z.object({ orgId: z.uuid() });
export type SwitchOrgBody = z.infer<typeof SwitchOrgBody>;

/** A pending invitation, as admins see it in Settings. */
export interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'agent';
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
}

/** What the invitation page shows before the person accepts. */
export interface InvitationPreview {
  orgName: string;
  email: string;
  role: 'admin' | 'agent';
  invitedBy: string | null;
  /** True when the email already has a Triago account: they sign in instead of signing up. */
  accountExists: boolean;
}
