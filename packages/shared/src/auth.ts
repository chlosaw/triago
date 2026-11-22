import { z } from 'zod';

export type Role = 'admin' | 'agent';

const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

const NewPassword = z.string().min(10, 'Use at least 10 characters.').max(200);

export const RegisterBody = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  email: Email,
  password: NewPassword,
  organisation: z.string().trim().min(1, 'Name your team or company.').max(80)
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: Email,
  // Capped like registration so a huge password cannot tie up the hasher.
  password: z.string().min(1, 'Enter your password.').max(200)
});
export type LoginBody = z.infer<typeof LoginBody>;

export const ForgotPasswordBody = z.object({ email: Email });
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBody>;

export const ResetPasswordBody = z.object({
  token: z.string().min(20, 'This reset link is invalid.').max(200),
  password: NewPassword
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;

export interface Profile {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; isDemo: boolean };
  role: Role;
  /** Every organisation this person belongs to, for the switcher. */
  orgs: { id: string; name: string; role: Role }[];
}
